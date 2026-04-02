import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'
import { getTodayMeetingTitles, getAreasForMeetings } from '@/lib/google-calendar'

export const maxDuration = 60

const SLACK_CHANNEL = 'C030BRV0C2G' // #cos

async function postToSlack(message: string, threadTs?: string): Promise<string> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text: message, mrkdwn: true, thread_ts: threadTs }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
  return data.ts as string
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
    }

    const noMeetingsToday = todayAreas.length === 0 && !calendarError

    if (noMeetingsToday) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No leadership meetings today' })
    }

    // Step 2: Fetch OKR data
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

    // Filter to today's areas (or all if calendar failed)
    const filteredObjectives = calendarError || todayAreas.length === 0
      ? (areaObjectives ?? []) as unknown as ObjRow[]
      : (areaObjectives ?? []).filter(o =>
          todayAreas.includes(getAreaName(o as unknown as ObjRow))
        ) as unknown as ObjRow[]

    const relevantAreas = calendarError || todayAreas.length === 0
      ? (areas ?? [])
      : (areas ?? []).filter(a => todayAreas.includes(a.name))

    const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => (o as unknown as ObjRow).area_id))
    const missingAreas: string[] = relevantAreas
      .filter(a => !areaIdsWithOKRs.has(a.id))
      .map(a => a.name)

    // Step 3: Build rich per-area data for AI summarization
    type AreaInsight = {
      area: string
      hasOKRs: boolean
      keyResults: {
        description: string
        confidenceScore: number | null
        latestUpdate: string | null
        neverUpdated: boolean
      }[]
    }

    const areaInsights: AreaInsight[] = filteredObjectives.map(obj => {
      const areaName = getAreaName(obj)
      const krs = getKRs(obj)
      return {
        area: areaName,
        hasOKRs: true,
        keyResults: krs.map(kr => {
          const sorted = (kr.updates ?? []).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          const latest = sorted[0] ?? null
          return {
            description: kr.description,
            confidenceScore: latest?.confidence_score ?? null,
            latestUpdate: latest?.update_text ?? null,
            neverUpdated: !latest,
          }
        }),
      }
    })

    // Add areas that have no OKRs at all
    for (const name of missingAreas) {
      if (!areaInsights.find(a => a.area === name)) {
        areaInsights.push({ area: name, hasOKRs: false, keyResults: [] })
      }
    }

    // Step 4: AI summarization pass
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
    })
    const reviewLabel = todayAreas.length > 0 ? todayAreas.join(', ') : 'All Areas'

    const areaDataText = areaInsights.map(a => {
      if (!a.hasOKRs) {
        return `Area: ${a.area}\nStatus: No OKRs set for this quarter.\n`
      }
      const krLines = a.keyResults.map(kr => {
        const score = kr.confidenceScore !== null ? `Confidence: ${kr.confidenceScore}/5` : 'Confidence: not rated'
        const update = kr.neverUpdated
          ? 'Latest update: never updated'
          : `Latest update: "${kr.latestUpdate ?? ''}"`
        return `  - KR: ${kr.description}\n    ${score}\n    ${update}`
      }).join('\n')
      return `Area: ${a.area}\n${krLines || '  (no key results)'}`
    }).join('\n\n')

    const prompt = `You are a blunt AI Chief of Staff. No fluff, no filler, no consulting speak. Every word must earn its place.

Today: ${today} | Q${quarter} ${year} | Areas in review: ${reviewLabel}
${calendarError ? `(Calendar unavailable — showing all areas)\n` : ''}

OKR DATA:
${areaDataText}

Output exactly TWO sections using these tokens on their own line: CHANNEL_SUMMARY: and THREAD_DETAIL:

CHANNEL_SUMMARY:
3–5 lines max. No intro, no sign-off.

"Hey Juli & Cami 👋 | ${today}"
[ONE line: the single most important thing to know today — max 15 words]
[2–3 bullets, one per critical area, format: *Area* → risk in <10 words → ❓ question]

THREAD_DETAIL:
One block per critical area (3–5 areas max). Each block:

*Area Name*
🔥 [Risk in one short sentence. Bold the number.]
❓ [One question the owner must answer today.]

Blank line between areas. Nothing else.
End with: "_→ https://ontop-okr-app.vercel.app/executive_"

RULES:
- No greetings, no "here's your briefing", no transitions, no summaries
- No area gets more than 2 lines in the thread
- Confidence ≤2 or no updates = flag it. No OKRs = say "flying blind"
- Bold metrics with *asterisks*
- If everything is healthy, write one line saying so. Done.`

    const anthropic = new Anthropic({ maxRetries: 5 })
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : 'Executive briefing unavailable.'

    // Parse CHANNEL_SUMMARY / THREAD_DETAIL split
    const [summaryPart, detailPart] = raw.split(/^THREAD_DETAIL:\s*/m)
    const summaryRaw = summaryPart.replace(/^CHANNEL_SUMMARY:\s*/m, '').trim()
    // Ensure a blank line between every non-empty line in the summary
    const summary = summaryRaw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n\n')
    const detail  = detailPart?.replace(/---+\n?/g, '').trim()

    const dateLabel = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
    })

    if (detail) {
      // Post short summary to channel, full detail in thread
      const parentTs = await postToSlack(`*${dateLabel} / OKR Execution Brief* 🧵👇🏼\n\n${summary}`)
      await postToSlack(detail, parentTs)
    } else {
      // Fallback: post full message once (no split found)
      await postToSlack(summary || raw)
    }

    return NextResponse.json({
      ok: true,
      areas: reviewLabel,
      meetings: meetingTitles,
      areasAnalyzed: areaInsights.length,
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
