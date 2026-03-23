import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'
import { getTodayMeetingTitles, getAreasForMeetings } from '@/lib/google-calendar'

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

    const prompt = `You are an AI Chief of Staff preparing a daily executive briefing for the CEO (Julian) and COO (Cami) of Ontop, a global payroll and workforce platform.

Today is ${today}. Today's leadership reviews: ${reviewLabel}.
Quarter: Q${quarter} ${year}.
${calendarError ? `Note: Calendar was unavailable, showing all areas.\n` : ''}

Here is the raw OKR data for today's areas:

${areaDataText}

You must output TWO sections separated by the exact token THREAD_DETAIL: on its own line.

─────────────────────────────────────
SECTION 1 — CHANNEL_SUMMARY:
─────────────────────────────────────
Start your output with the literal token CHANNEL_SUMMARY: on its own line, then write a SHORT channel summary with a BLANK LINE between each element:

Line 1: "Hey Juli and Cami! 👋 Here's today's exec brief | ${today}"

[blank line]

Line 2: ONE sentence on today's biggest theme (max 20 words)

[blank line]

Lines 3–5: The 2–3 most critical areas, one line each WITH a blank line between each, format:
*[Area]* → [one-sentence risk or gap] → ❓ [the key question]

[blank line between each area bullet]

─────────────────────────────────────
SECTION 2 — THREAD_DETAIL:
─────────────────────────────────────
Then on a new line write the literal token THREAD_DETAIL: and follow with the full per-area breakdown.

For each of the 3–5 most urgent areas write EXACTLY:

*[Area Name]*

🔥 *At risk:* [One sentence — most pressing business risk. Bold key metrics.]
👀 *Missing:* [One sentence — most important blind spot or stale signal. Bold key metrics.]
❓ *Ask:* [One sharp, decision-useful question for the area owner.]

Leave ONE blank line between areas. No "---" dividers.

End the thread with:
"_Full details → https://ontop-okr-app.vercel.app/executive_"

─────────────────────────────────────
RULES (apply to both sections):
─────────────────────────────────────
- Sound like a COO/operator — no consulting language
- Confidence 1–2 = at risk. Never updated = missing signal. No OKRs = flying blind.
- Bold key metrics, numbers, account names with Slack bold (*like this*)
- If all areas are healthy, say so in one sentence instead of listing areas
- Output ONLY the two sections. No preamble, no explanation.`

    const anthropic = new Anthropic()
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
