import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'
import { getTodayMeetingTitles, getMatchedMeetings, MatchedMeeting } from '@/lib/google-calendar'
import { GroupedMeeting } from '@/config/meeting-area-map'

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

// --- Area OKR data text builder ---
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

function buildAreaDataText(areaInsights: AreaInsight[]): string {
  return areaInsights.map(a => {
    if (!a.hasOKRs) return `Area: ${a.area}\nStatus: No OKRs set for this quarter.`
    const krLines = a.keyResults.map(kr => {
      const score  = kr.confidenceScore !== null ? `Confidence: ${kr.confidenceScore}/5` : 'Confidence: not rated'
      const update = kr.neverUpdated
        ? 'Latest update: never updated'
        : `Latest update: "${kr.latestUpdate ?? ''}"`
      return `  - KR: ${kr.description}\n    ${score}\n    ${update}`
    }).join('\n')
    return `Area: ${a.area}\n${krLines || '  (no key results)'}`
  }).join('\n\n')
}

// --- Prompt builders ---

function buildGroupedMeetingContext(meetings: MatchedMeeting[]): string {
  const grouped = meetings.filter(m => m.config.type === 'grouped') as { keyword: string; config: GroupedMeeting }[]
  if (grouped.length === 0) return ''

  return grouped.map(({ keyword, config }) => {
    const questions = config.focusQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    return `MEETING: ${keyword}
Purpose: ${config.purpose}
Areas involved: ${config.areas.join(', ')}
Questions leadership should walk in ready to answer:
${questions}`
  }).join('\n\n')
}

function buildPrompt(
  today: string,
  quarter: number,
  year: number,
  matchedMeetings: MatchedMeeting[],
  areaDataText: string,
  calendarError: string | null,
): string {
  const hasGrouped    = matchedMeetings.some(m => m.config.type === 'grouped')
  const hasSimple     = matchedMeetings.some(m => m.config.type === 'simple')
  const meetingNames  = matchedMeetings.map(m => m.keyword).join(', ')
  const groupedCtx    = buildGroupedMeetingContext(matchedMeetings)

  const header = `You are a blunt AI Chief of Staff preparing Julian (CEO) and Cami (COO) for today's leadership meetings. No fluff, no filler, no consulting speak. Every word must earn its place.

Today: ${today} | Q${quarter} ${year}
Meetings today: ${meetingNames || 'All areas (calendar unavailable)'}
${calendarError ? `(Calendar unavailable — showing all areas)\n` : ''}`

  const okrData = `OKR DATA:
${areaDataText}`

  if (hasGrouped) {
    const groupedInstructions = `
MEETING CONTEXT:
${groupedCtx}

${hasSimple ? `There are also 1:1 meetings today (${matchedMeetings.filter(m => m.config.type === 'simple').map(m => m.keyword).join(', ')}). Cover those briefly after the grouped meetings.` : ''}`

    return `${header}
${groupedInstructions}

${okrData}

Output exactly TWO sections using these tokens on their own line: CHANNEL_SUMMARY: and THREAD_DETAIL:

CHANNEL_SUMMARY:
4–6 lines max. No intro, no sign-off. Start with:
"Hey Juli & Cami 👋 | ${today}"

For each grouped meeting, ONE sharp line naming the biggest risk or cross-area issue (not per-area bullet — cross-area signal).
Format: *[Meeting name]* → [cross-area insight in <12 words] → ❓ [one question]

THREAD_DETAIL:
For each grouped meeting, a structured block:

*[Meeting Name] — [Purpose in 5 words or fewer]*
Answer each focus question with one crisp line using the OKR data:
[✅ or ⚠️ or 🔥] [Question rephrased as finding, max 15 words. Bold any number.]

Then: ❓ *The one question that most needs an answer in this meeting today.*

For 1:1 meetings (if any), one compact block per area:
*Area*
🔥 [Risk or status in one sentence. Bold any number.]
❓ [One question for the owner.]

Blank line between all blocks.
End with: "_→ https://ontop-okr-app.vercel.app/executive_"

RULES:
- Structure the brief around the meeting's purpose and questions — not a per-area status list
- Flag cross-area dependencies and misalignments explicitly
- Confidence ≤2 or never updated = 🔥. No OKRs = "flying blind"
- Slack bold = single asterisks: *text* — do NOT use double asterisks **text**
- Bold metrics and numbers using single asterisks: *42%*, *$1.2M*
- No greetings, no transitions, no summaries
- If something is healthy, say so in one word. Save detail for risks.
- CRITICAL: only reference topics, initiatives, and risks that appear explicitly in the OKR data above. Do not add context from your own knowledge of the company or industry.`
  }

  // All simple / 1:1 meetings — original format
  const simpleAreas = matchedMeetings.map(m => m.config.areas).flat().join(', ')
  return `${header}
Areas in review: ${simpleAreas}

${okrData}

Output exactly TWO sections using these tokens on their own line: CHANNEL_SUMMARY: and THREAD_DETAIL:

CHANNEL_SUMMARY:
3–5 lines max. No intro, no sign-off.

"Hey Juli & Cami 👋 | ${today}"
[ONE line: the single most important thing to know today — max 15 words]
[2–3 bullets, one per critical area, format: *Area* → risk in <10 words → ❓ question]

THREAD_DETAIL:
One block per critical area (3–5 areas max). Each block:

*Area Name*
🔥 [Risk in one short sentence. Bold any number.]
❓ [One question the owner must answer today.]

Blank line between areas. Nothing else.
End with: "_→ https://ontop-okr-app.vercel.app/executive_"

RULES:
- No greetings, no transitions, no summaries
- No area gets more than 2 lines in the thread
- Confidence ≤2 or no updates = flag it. No OKRs = say "flying blind"
- Slack bold = single asterisks: *text* — do NOT use **text**
- If everything is healthy, write one line saying so. Done.`
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron     = cronSecret && authHeader === `Bearer ${cronSecret}`
  const isManual   = request.headers.get('x-manual-send') === '1'

  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const anthropic = new Anthropic({ maxRetries: 5 })

  try {
    // Step 1: Fetch calendar titles and deterministically match against known meeting keywords
    let matchedMeetings: MatchedMeeting[] = []
    let todayAreas:      string[]         = []
    let meetingTitles:   string[]         = []
    let calendarError:   string | null    = null

    try {
      meetingTitles = await getTodayMeetingTitles()
      matchedMeetings = getMatchedMeetings(meetingTitles)
      todayAreas      = [...new Set(matchedMeetings.flatMap(m => m.config.areas))]
    } catch (err) {
      calendarError = err instanceof Error ? err.message : String(err)
    }

    if (calendarError) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Calendar unavailable', calendarError })
    }

    if (todayAreas.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'No leadership meetings today' })
    }

    // Step 2: Fetch OKR data for relevant areas
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

    const getAreaName = (o: ObjRow) => (o.area as { name?: string } | null)?.name ?? 'Unknown'
    const getKRs      = (o: ObjRow): KRRow[] => (o.key_results as KRRow[]) ?? []

    const filteredObjectives = (areaObjectives ?? [])
      .filter(o => todayAreas.includes(getAreaName(o as unknown as ObjRow))) as unknown as ObjRow[]

    const relevantAreas = (areas ?? []).filter(a => todayAreas.includes(a.name))

    const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => (o as unknown as ObjRow).area_id))
    const missingAreas    = relevantAreas.filter(a => !areaIdsWithOKRs.has(a.id)).map(a => a.name)

    // Step 3: Build area insights
    const areaInsights: AreaInsight[] = filteredObjectives.map(obj => {
      const areaName = getAreaName(obj)
      return {
        area: areaName,
        hasOKRs: true,
        keyResults: getKRs(obj).map(kr => {
          const sorted = (kr.updates ?? []).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          const latest = sorted[0] ?? null
          return {
            description:     kr.description,
            confidenceScore: latest?.confidence_score ?? null,
            latestUpdate:    latest?.update_text ?? null,
            neverUpdated:    !latest,
          }
        }),
      }
    })

    for (const name of missingAreas) {
      if (!areaInsights.find(a => a.area === name)) {
        areaInsights.push({ area: name, hasOKRs: false, keyResults: [] })
      }
    }

    // Step 4: Build meeting-aware prompt and call Claude
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
    })

    const prompt = buildPrompt(
      today,
      quarter,
      year,
      matchedMeetings,
      buildAreaDataText(areaInsights),
      calendarError,
    )

    const aiResponse = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : 'Executive briefing unavailable.'

    // Parse CHANNEL_SUMMARY / THREAD_DETAIL split
    const [summaryPart, detailPart] = raw.split(/^THREAD_DETAIL:\s*/m)
    const summaryRaw = summaryPart.replace(/^CHANNEL_SUMMARY:\s*/m, '').trim()
    const summary    = summaryRaw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n\n')
    const detail = detailPart?.replace(/---+\n?/g, '').trim()

    const dateLabel = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Bogota',
    })

    const meetingLabel = `_Triggered by: ${matchedMeetings.map(m => m.keyword).join(', ')}_`

    if (detail) {
      const parentTs = await postToSlack(`*${dateLabel} / OKR Execution Brief* 🧵👇🏼\n${meetingLabel}\n\n${summary}`)
      await postToSlack(detail, parentTs)
    } else {
      await postToSlack(`${meetingLabel}\n\n${summary || raw}`)
    }

    return NextResponse.json({
      ok: true,
      calendarError,
      meetings: meetingTitles,
      matchedMeetings: matchedMeetings.map(m => m.keyword),
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
