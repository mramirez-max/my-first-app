import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'
import { getTodayMeetingTitles, getAreasForMeetings } from '@/lib/google-calendar'
import { METRIC_DEFINITIONS, formatMetricValue } from '@/lib/metrics'

// --- Deduplication (in-memory, sufficient for serverless retries) -------------
const processedEvents = new Set<string>()

// --- Slack signature verification --------------------------------------------
function verifySlackSignature(req: NextRequest, rawBody: string): boolean {
  const secret    = process.env.SLACK_SIGNING_SECRET
  const timestamp = req.headers.get('x-slack-request-timestamp')
  const signature = req.headers.get('x-slack-signature')

  if (!secret || !timestamp || !signature) return false

  // Reject requests older than 5 minutes (replay attack protection)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false

  const sigBase  = `v0:${timestamp}:${rawBody}`
  const computed = `v0=${crypto.createHmac('sha256', secret).update(sigBase).digest('hex')}`

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

// --- Slack API helpers -------------------------------------------------------
const SLACK_API = 'https://slack.com/api'

async function slackPost(channel: string, text: string, threadTs?: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return null
  const res  = await fetch(`${SLACK_API}/chat.postMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ channel, text, thread_ts: threadTs, mrkdwn: true }),
  })
  const data = await res.json()
  return data.ok ? data.ts : null
}

async function slackUpdate(channel: string, ts: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  await fetch(`${SLACK_API}/chat.update`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ channel, ts, text, mrkdwn: true }),
  })
}

// --- OKR context fetcher -----------------------------------------------------
async function buildOKRContext(): Promise<string> {
  const supabase          = createAdminClient()
  const { quarter, year } = getCurrentQuarter()

  // Latest month with metrics data
  const now = new Date()
  const latestMonth = now.getMonth() + 1
  const latestYear  = now.getFullYear()
  const prevMonth   = latestMonth === 1 ? 12 : latestMonth - 1
  const prevYear    = latestMonth === 1 ? latestYear - 1 : latestYear

  const [
    { data: areas },
    { data: companyObjectives },
    { data: areaObjectives },
    { data: metricsRaw },
    { data: documents },
  ] = await Promise.all([
    supabase.from('areas').select('id, name').order('name'),
    supabase.from('company_objectives').select('title').eq('quarter', quarter).eq('year', year),
    supabase
      .from('area_objectives')
      .select('area_id, area:areas(name), key_results:area_key_results(description, updates:area_kr_updates(confidence_score, update_text, created_at))')
      .eq('quarter', quarter)
      .eq('year', year),
    supabase
      .from('business_metrics')
      .select('metric_name, month, year, value')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase
      .from('company_documents')
      .select('title, doc_type, doc_date, summary')
      .order('doc_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ])

  type KRRow  = { description: string; updates: { confidence_score: number; update_text: string; created_at: string }[] }
  type ObjRow = { area_id: string; area: unknown; key_results: unknown }

  const getAreaName = (o: ObjRow) => (o.area as { name?: string } | null)?.name ?? 'Unknown'
  const getKRs      = (o: ObjRow): KRRow[] => (o.key_results as KRRow[]) ?? []

  // Compute flags
  const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => (o as unknown as ObjRow).area_id))
  const missingAreas    = (areas ?? []).filter(a => !areaIdsWithOKRs.has(a.id)).map(a => a.name)

  const atRisk: string[] = []
  const stale:  string[] = []

  for (const obj of (areaObjectives ?? []) as unknown as ObjRow[]) {
    const area = getAreaName(obj)
    for (const kr of getKRs(obj)) {
      const sorted = (kr.updates ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest = sorted[0]
      if (!latest) {
        stale.push(`${area}: "${kr.description}"`)
      } else if (latest.confidence_score <= 2) {
        atRisk.push(`${area}: "${kr.description}" (confidence ${latest.confidence_score}/5 -- ${latest.update_text?.slice(0, 120) ?? 'no note'})`)
      }
    }
  }

  // Area detail blocks — structured per KR with full update text
  const areaBlocks = (areaObjectives ?? []).reduce<Record<string, string[]>>((acc, obj) => {
    const o    = obj as unknown as ObjRow
    const name = getAreaName(o)
    if (!acc[name]) acc[name] = []
    for (const kr of getKRs(o)) {
      const sorted = (kr.updates ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest = sorted[0] ?? null
      const conf   = latest ? `${latest.confidence_score}/5` : 'not rated'
      const update = latest
        ? `"${latest.update_text ?? ''}"`
        : 'never updated'
      acc[name].push(`  KR: ${kr.description}\n  Confidence: ${conf}\n  Latest update: ${update}`)
    }
    return acc
  }, {})

  // Calendar context
  let calendarLine = ''
  try {
    const titles     = await getTodayMeetingTitles()
    const todayAreas = getAreasForMeetings(titles)
    if (todayAreas.length > 0) calendarLine = `\nToday's scheduled reviews: ${todayAreas.join(', ')}`
  } catch { /* calendar optional */ }

  const coList = (companyObjectives ?? []).map(c => `  - ${c.title}`).join('\n') || '  (none set)'

  const areaDetail = Object.entries(areaBlocks)
    .map(([name, krs]) => `*${name}*\n${krs.join('\n\n')}`)
    .join('\n\n') || '(No area OKRs set this quarter.)'

  // Business metrics — all historical data grouped by month
  const MONTH_NAMES_S = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const byPeriod = new Map<string, typeof metricsRaw>()
  for (const row of metricsRaw ?? []) {
    const key = `${MONTH_NAMES_S[row.month - 1]} ${row.year}`
    if (!byPeriod.has(key)) byPeriod.set(key, [])
    byPeriod.get(key)!.push(row)
  }

  const metricsSection = byPeriod.size === 0
    ? 'Business Metrics: no data entered yet'
    : 'Business Metrics:\n' + Array.from(byPeriod.entries()).map(([period, rows]) => {
        const lines = METRIC_DEFINITIONS
          .map(def => {
            const row = (rows ?? []).find(r => r.metric_name === def.name)
            if (!row || row.value === null) return null
            return `  ${def.name}: ${formatMetricValue(row.value, def.format)}`
          })
          .filter(Boolean)
          .join('\n')
        return lines ? `${period}:\n${lines}` : null
      })
      .filter(Boolean)
      .join('\n\n')

  const atRiskSection = atRisk.length === 0
    ? 'At-Risk KRs (confidence <=2): None'
    : `At-Risk KRs (confidence <=2):\n${atRisk.map(r => `  - ${r}`).join('\n')}`

  const staleSection = stale.length === 0
    ? 'Never Updated KRs: None'
    : `Never Updated KRs:\n${stale.map(s => `  - ${s}`).join('\n')}`

  const missingSection = missingAreas.length === 0
    ? 'No OKRs Set: None'
    : `No OKRs Set: ${missingAreas.join(', ')}`

  const docsSection = (documents ?? []).length > 0
    ? (documents ?? []).map(d => {
        const date = d.doc_date
          ? new Date(d.doc_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
          : 'undated'
        return `[${d.title} · ${d.doc_type.replace(/_/g, ' ')} · ${date}]\n${d.summary}`
      }).join('\n\n')
    : '(none)'

  return `You are the AI Chief of Staff for Ontop. Blunt, direct, no fluff.
You have access to OKR data, live business metrics, and strategic documents (board decks, investor updates). Use all of them when relevant.

DATA HIERARCHY — always follow this when sources conflict:
1. *Business Metrics* (labeled by month/year) — ground truth for all KPIs. Always use these for specific numbers.
2. *OKR updates* (labeled by date) — most recent qualitative signals: confidence, blockers, weekly progress.
3. *Strategic documents* (labeled by date) — strategic context only: priorities, narrative, commitments. Do NOT cite their metrics if Business Metrics has more recent data.
When a metric appears in both a document and Business Metrics, use the Business Metrics value and note the document's figure was from an earlier date if relevant.

Answer the question asked. Nothing more.

RULES:
- Max 5 lines. If the answer fits in 1-2 lines, do that.
- Slack format: *bold* with asterisks, no tables, no markdown headers
- No greetings, no sign-offs, no preamble
- Always cite the time period for any number (e.g. "MRR as of March 2026")
- Numbers and specifics over vague statements
- If everything is fine, say it in one sentence${calendarLine}

Strategic Documents:
${docsSection}

Q${quarter} ${year} OKR DATA:

Company Objectives:
${coList}

${metricsSection}

${atRiskSection}

${staleSection}

${missingSection}

Area Detail:
${areaDetail}`
}

// --- Route handler -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Slack URL verification handshake (one-time, during app setup)
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  // Verify signature on all non-verification requests
  if (!verifySlackSignature(request, rawBody)) {
    console.error('[slack/events] Signature verification failed')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const event = payload.event as Record<string, unknown> | undefined
  if (!event) return NextResponse.json({ ok: true })

  // Only handle app_mention (channel) and message.im (DM, non-bot)
  const isMention = event.type === 'app_mention'
  const isDM      = event.type === 'message' && event.channel_type === 'im' && !event.bot_id && !event.subtype

  if (!isMention && !isDM) return NextResponse.json({ ok: true })

  // Deduplicate by event_id
  const eventId = payload.event_id as string | undefined
  if (eventId) {
    if (processedEvents.has(eventId)) return NextResponse.json({ ok: true })
    processedEvents.add(eventId)
    // Clean up old entries after 5 minutes
    setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000)
  }

  // Extract question -- strip bot mention from text
  const authUserId = (payload.authorizations as { user_id?: string }[] | undefined)?.[0]?.user_id ?? ''
  const rawText    = (event.text as string ?? '').replace(`<@${authUserId}>`, '').trim()

  if (!rawText) return NextResponse.json({ ok: true })

  const channel  = event.channel  as string
  const threadTs = (event.thread_ts ?? event.ts) as string

  // Post "Thinking..." immediately so Slack feels responsive
  const thinkingTs = await slackPost(channel, '_Thinking..._', threadTs)

  // Process after response is sent (avoids Slack's 3s timeout)
  after(async () => {
    try {
      const context = await buildOKRContext()
      const client  = new Anthropic()

      const response = await client.messages.create({
        model:     'claude-sonnet-4-6',
        max_tokens: 400,
        system:    context,
        messages:  [{ role: 'user', content: rawText }],
      })

      const answer = response.content.find(b => b.type === 'text')?.text ?? '_No response generated._'

      if (thinkingTs) {
        await slackUpdate(channel, thinkingTs, answer)
      } else {
        await slackPost(channel, answer, threadTs)
      }

      console.log(`[slack/events] Answered "${rawText.slice(0, 60)}" in ${channel}`)
    } catch (err) {
      console.error('[slack/events] Processing error:', err)
      const errMsg = 'Something went wrong. Please try again in a moment.'
      if (thinkingTs) await slackUpdate(channel, thinkingTs, errMsg)
      else await slackPost(channel, errMsg, threadTs)
    }
  })

  return NextResponse.json({ ok: true })
}
