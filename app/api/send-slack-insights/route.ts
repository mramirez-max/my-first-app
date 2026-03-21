import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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

Write a Slack message that reads like a sharp, strategic executive brief — not a database export. Follow these rules exactly:

1. Start with this line (fill in today's date):
"Hey Juli and Cami! 👋 I'm your AI Chief of Staff. Here's today's executive brief | ${today}"

2. Follow with ONE short line summarizing today's biggest themes across all areas (max 20 words).

3. Then select the 3 to 5 most urgent areas. For each area, write EXACTLY this format (leave a blank line between areas — no "---" or dividers):

*[Area Name]*
• 🔥 *At risk:* [One sentence — the most pressing business risk or execution gap. Sound like a leadership risk, not a KR description. Be specific. Bold any key metrics, numbers, or critical terms.]
• 👀 *Missing:* [One sentence — the most important blind spot, stale signal, missing update, or execution gap. Say what's missing and why it matters. Bold any key metrics, numbers, or critical terms.]
• ❓ *Ask:* [One sharp, decision-useful question the CEO/COO should ask the area owner today.]

Rules:
- Pick only the most urgent areas. If an area looks fine, skip it.
- Do NOT list every KR. Synthesize into one crisp sentence per bullet.
- Sound like an operator, not a consultant. No generic phrases like "ensure alignment" or "drive performance."
- Confidence score of 1-2 = at risk. Never updated = missing signal. No OKRs = flying blind.
- Rank areas by urgency — most critical first.
- Separate areas with a blank line only — never use "---" or any other divider.
- Bold key metrics, numbers, percentages, account names, or any high-signal facts (use Slack bold: *like this*).
- If all areas look healthy, say so in one sentence instead of listing areas.

4. End with exactly this line:
"_Full details + suggested questions → https://ontop-okr-app.vercel.app/executive_"

Output only the Slack message. No preamble, no explanation.`

    const anthropic = new Anthropic()
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = aiResponse.content[0].type === 'text'
      ? aiResponse.content[0].text
      : 'Executive briefing unavailable.'

    // Enforce double blank line before each area header (*Bold* lines that start a section)
    const message = raw
      .replace(/---+\n?/g, '')                          // strip any "---" dividers
      .replace(/\n(\*[^*\n]+\*\n)/g, '\n\n\n$1')       // double-space before area headers

    await postToSlack(message)

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
