import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'

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
  // Allow both manual button calls (no auth needed beyond being logged in)
  // and Vercel cron calls (verified via CRON_SECRET)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  const isManual = request.headers.get('x-manual-send') === '1'

  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => (o as unknown as ObjRow).area_id))

  const missing: string[] = []
  for (const area of areas ?? []) {
    if (!areaIdsWithOKRs.has(area.id)) missing.push(area.name)
  }

  const stale: { area: string; kr: string }[] = []
  const atRisk: { area: string; kr: string; score: number }[] = []

  for (const obj of (areaObjectives ?? []) as unknown as ObjRow[]) {
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

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  let message = `*📊 Daily OKR Briefing — Q${quarter} ${year} | ${today}*\n\n`
  message += `_Your AI Chief of Staff reporting for duty. Here's what needs your attention today:_\n\n`

  if (atRisk.length === 0 && stale.length === 0 && missing.length === 0) {
    message += `✅ *All green!* No flagged items across all areas. Strong week.\n`
  } else {
    if (atRisk.length > 0) {
      message += `*🔴 At-Risk Key Results (confidence ≤ 2/5)*\n`
      atRisk.slice(0, 5).forEach(r => {
        message += `• *${r.area}:* ${r.kr} _(${r.score}/5)_\n`
      })
      if (atRisk.length > 5) message += `• _…and ${atRisk.length - 5} more_\n`
      message += '\n'
    }

    if (stale.length > 0) {
      message += `*🟠 Never Updated KRs*\n`
      stale.slice(0, 5).forEach(r => {
        message += `• *${r.area}:* ${r.kr}\n`
      })
      if (stale.length > 5) message += `• _…and ${stale.length - 5} more_\n`
      message += '\n'
    }

    if (missing.length > 0) {
      message += `*🟡 Areas with No OKRs This Quarter*\n`
      missing.forEach(a => { message += `• ${a}\n` })
      message += '\n'
    }
  }

  message += `_Full details + suggested check-in questions → Executive View in the OKR system_`

  try {
    await postToSlack(message)
    return NextResponse.json({ ok: true, atRisk: atRisk.length, stale: stale.length, missing: missing.length })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}

// Vercel cron calls this route via GET
export async function GET(request: NextRequest) {
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
  }))
}
