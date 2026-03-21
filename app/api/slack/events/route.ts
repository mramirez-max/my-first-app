import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentQuarter } from '@/types'
import { getTodayMeetingTitles, getAreasForMeetings } from '@/lib/google-calendar'

// ─── Deduplication (in-memory, sufficient for serverless retries) ─────────────
const processedEvents = new Set<string>()

// ─── Slack signature verification ────────────────────────────────────────────
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

// ─── Slack API helpers ────────────────────────────────────────────────────────
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

// ─── OKR context fetcher ──────────────────────────────────────────────────────
async function buildOKRContext(): Promise<string> {
  const supabase            = createAdminClient()
  const { quarter, year }   = getCurrentQuarter()

  const [
    { data: areas },
    { data: companyObjectives },
    { data: areaObjectives },
  ] = await Promise.all([
    supabase.from('areas').select('id, name').order('name'),
    supabase.from('company_objectives').select('title').eq('quarter', quarter).eq('year', year),
    supabase
      .from('area_objectives')
      .select('area_id, area:areas(name), key_results:area_key_results(description, updates:area_kr_updates(confidence_score, update_text, created_at))')
      .eq('quarter', quarter)
      .eq('year', year),
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
      const sorted  = (kr.updates ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest  = sorted[0]
      if (!latest) {
        stale.push(`${area}: "${kr.description}"`)
      } else if (latest.confidence_score <= 2) {
        atRisk.push(`${area}: "${kr.description}" (confidence ${latest.confidence_score}/5 — ${latest.update_text?.slice(0, 120) ?? 'no note'})`)
      }
    }
  }

  // Area detail blocks
  const areaBlocks = (areaObjectives ?? []).reduce<Record<string, string[]>>((acc, obj) => {
    const o    = obj as unknown as ObjRow
    const name = getAreaName(o)
    if (!acc[name]) acc[name] = []
    for (const kr of getKRs(o)) {
      const sorted  = (kr.updates ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest  = sorted[0]
      const status  = latest
        ? `confidence ${latest.confidence_score}/5 — "${latest.update_text?.slice(0, 100) ?? ''}"`
        : 'never updated'
      acc[name].push(`  • ${kr.description} [${status}]`)
    }
    return acc
  }, {})

  // Calendar context
  let calendarLine = ''
  try {
    const titles   = await getTodayMeetingTitles()
    const todayAreas = getAreasForMeetings(titles)
    if (todayAreas.length > 0) calendarLine = `\nToday's scheduled reviews: ${todayAreas.join(', ')}`
  } catch { /* calendar optional */ }

  const coList = (companyObjectives ?? []).map(c => `  - ${c.title}`).join('\n') || '  (none set)'

  const areaDetail = Object.entries(areaBlocks)
    .map(([name, krs]) => `*${name}*\n${krs.join('\n')}`)
    .join('\n\n') || '(No area OKRs set this quarter.)'

return `You are the AI Chief of Staff for Ontop.

You answer questions about company execution, OKRs, risks, and performance.

STYLE:
- Sound like a COO / operator, not an analyst
- Be sharp, direct, and decision-oriented
- No fluff, no generic consulting language

FORMATTING (STRICT — Slack format):
- Use Slack bold with single asterisks only
- Never use double-asterisk markdown
- Use clean spacing (no --- dividers)
- Max 3–5 sections
- Each section = 3 lines max

STRUCTURE (MANDATORY):

For each area:

*<Area Name>*

🔥 *At risk:* one sharp sentence (what will break + why)

👀 *Missing:* one key blind spot or execution gap

❓ *Ask:* one direct question leadership should ask

(Optional)
📊 *Key signal:* only if there's a critical number

RULES:
- One sentence per line (no paragraphs)
- Prioritize what matters most — ignore noise
- If everything looks fine, say it in one sentence
- Do not restate everything — assume leadership saw prior messages
- Focus only on what's new or most relevant to the question

## Company Objectives — Q${quarter} ${year}
${coList}

## Flagged Items
🔴 At-Risk KRs (${atRisk.length}):
${atRisk.length > 0 ? atRisk.map(r => `  - ${r}`).join('\n') : '  None'}

🟠 Never Updated KRs (${stale.length}):
${stale.length > 0 ? stale.map(s => `  - ${s}`).join('\n') : '  None'}

🟡 No OKRs Set (${missingAreas.length}):
${missingAreas.length > 0 ? missingAreas.map(a => `  - ${a}`).join('\n') : '  None'}

## Area OKR Detail
${areaDetail}`

// ─── Route handler ────────────────────────────────────────────────────────────
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
  const isDM       = event.type === 'message' && event.channel_type === 'im' && !event.bot_id && !event.subtype

  if (!isMention && !isDM) return NextResponse.json({ ok: true })

  // Deduplicate by event_id
  const eventId = payload.event_id as string | undefined
  if (eventId) {
    if (processedEvents.has(eventId)) return NextResponse.json({ ok: true })
    processedEvents.add(eventId)
    // Clean up old entries after 5 minutes
    setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000)
  }

  // Extract question — strip bot mention from text
  const authUserId = (payload.authorizations as { user_id?: string }[] | undefined)?.[0]?.user_id ?? ''
  const rawText    = (event.text as string ?? '').replace(`<@${authUserId}>`, '').trim()

  if (!rawText) return NextResponse.json({ ok: true })

  const channel  = event.channel  as string
  const threadTs = (event.thread_ts ?? event.ts) as string

  // Post "Thinking…" immediately so Slack feels responsive
  const thinkingTs = await slackPost(channel, '_Thinking…_', threadTs)

  // Process after response is sent (avoids Slack's 3s timeout)
  after(async () => {
    try {
      const [context] = await Promise.all([buildOKRContext()])
      const client    = new Anthropic()

      const response = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        system:     context,
        messages:   [{ role: 'user', content: rawText }],
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
      const errMsg = '⚠️ Something went wrong. Please try again in a moment.'
      if (thinkingTs) await slackUpdate(channel, thinkingTs, errMsg)
      else await slackPost(channel, errMsg, threadTs)
    }
  })

  return NextResponse.json({ ok: true })
}
