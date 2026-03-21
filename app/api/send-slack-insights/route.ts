import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'
import { getTodayMeetingTitles, getAreasForMeetings } from '@/lib/google-calendar'

const SLACK_CHANNEL = 'C030BRV0C2G' // #cos

async function postToSlack(message: string) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text: message, mrkdwn: true }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
  return data
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  const isManual = request.headers.get('x-manual-send') === '1'

  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Step 1: Find today's leadership meetings and map to areas
    let todayAreas: string[] = []
    let meetingTitles: string[] = []
    let calendarError: string | null = null

    try {
      meetingTitles = await getTodayMeetingTitles()
      todayAreas = getAreasForMeetings(meetingTitles)
    } catch (err) {
      calendarError = err instanceof Error ? err.message : String(err)
      // Fall back to all areas if calendar is unavailable
    }

    const noMeetingsToday = todayAreas.length === 0 && !calendarError

    // Step 2: Fetch OKR data, filtered to today's areas if we have them
    const supabase = createAdminClient()
    const { quarter, year } = getCurrentQuarter()

    const [{ data: areas }, { data: areaObjectives }] = await Promise.all([
      supabase.from('areas').select('id, name').order('name'),
      supabase
        .from('area_objectives')
        .select('area_id, area:areas(name), key_results:area_key_results(description, updates:area_kr_updates(confidence_score, update_text, created_at))')
        .eq('quarter', quarter)
        .eq('year', year),
    ])

    type KRRow = { description: string; updates: { confidence_score: number; update_text: string; created_at: string }[] }
    type ObjRow = { area_id: string; area: unknown; key_results: unknown }

    function getAreaName(obj: ObjRow) {
      return (obj.area as { name?: string } | null)?.name ?? 'Unknown'
    }
    function getKRs(obj: ObjRow): KRRow[] {
      return (obj.key_results as KRRow[]) ?? []
    }

    // Filter objectives to only today's scheduled areas (or all if calendar failed)
    const filteredObjectives = calendarError || todayAreas.length === 0
      ? (areaObjectives ?? []) as unknown as ObjRow[]
      : (areaObjectives ?? []).filter(o =>
          todayAreas.includes(getAreaName(o as unknown as ObjRow))
        ) as unknown as ObjRow[]

    const filteredAreaNames = new Set(filteredObjectives.map(o => getAreaName(o)))

    // Missing OKRs — only for today's areas
    const relevantAreas = calendarError || todayAreas.length === 0
      ? (areas ?? [])
      : (areas ?? []).filter(a => todayAreas.includes(a.name))

    const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => (o as unknown as ObjRow).area_id))
    const missing: string[] = relevantAreas
      .filter(a => !areaIdsWithOKRs.has(a.id))
      .map(a => a.name)

    const stale: { area: string; kr: string }[] = []
    const atRisk: { area: string; kr: string; score: number }[] = []

    for (const obj of filteredObjectives) {
      const areaName = getAreaName(obj)
      for (const kr of getKRs(obj)) {
        if (!kr.updates || kr.updates.length === 0) {
          const short = kr.description.length > 60 ? kr.description.slice(0, 60) + '…' : kr.description
          stale.push({ area: areaName, kr: short })
        } else {
          const latest = [...kr.updates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          if (latest.confidence_score <= 2) {
            const short = kr.description.length > 60 ? kr.description.slice(0, 60) + '…' : kr.description
            atRisk.push({ area: areaName, kr: short, score: latest.confidence_score })
          }
        }
      }
    }

    // Step 3: Build the Slack message
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
    })

    // Skip if no meetings today and calendar is working fine
    if (noMeetingsToday) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No leadership meetings today' })
    }

    const reviewLabel = todayAreas.length > 0
      ? todayAreas.join(', ')
      : 'All Areas'

    let message = `*📊 OKR Briefing — Q${quarter} ${year} | ${today}*\n`
    message += `_Today's reviews: ${reviewLabel}_\n\n`

    if (calendarError) {
      message += `⚠️ _Calendar unavailable — showing all areas. Error: ${calendarError}_\n\n`
    }

    if (atRisk.length === 0 && stale.length === 0 && missing.length === 0) {
      message += `✅ *All green!* No flagged items for today's areas.\n`
    } else {
      if (atRisk.length > 0) {
        message += `*🔴 At-Risk Key Results (confidence ≤ 2/5)*\n`
        atRisk.forEach(r => { message += `• *${r.area}:* ${r.kr} _(${r.score}/5)_\n` })
        message += '\n'
      }
      if (stale.length > 0) {
        message += `*🟠 Never Updated KRs*\n`
        stale.forEach(r => { message += `• *${r.area}:* ${r.kr}\n` })
        message += '\n'
      }
      if (missing.length > 0) {
        message += `*🟡 No OKRs Set*\n`
        missing.forEach(a => { message += `• ${a}\n` })
        message += '\n'
      }
    }

    message += `_Full details + suggested questions → Executive View_`

    await postToSlack(message)
    return NextResponse.json({
      ok: true,
      areas: reviewLabel,
      meetings: meetingTitles.filter(t => todayAreas.length > 0),
      atRisk: atRisk.length,
      stale: stale.length,
      missing: missing.length,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}

// Vercel cron calls via GET
export async function GET(request: NextRequest) {
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
  }))
}
