import { MEETING_AREA_MAP, MeetingConfig } from '@/config/meeting-area-map'

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

export interface CalendarFetchResult {
  titles: string[]
  timeMin: string
  timeMax: string
  rawItems: { summary?: string; start?: { date?: string; dateTime?: string } }[]
}

export async function getTodayMeetingTitles(): Promise<CalendarFetchResult> {
  const accessToken = await getAccessToken()

  // Compute "today" in Bogotá (UTC-5) so the window is correct regardless
  // of what time the serverless function runs (UTC).
  // Bogotá midnight = 05:00 UTC; Bogotá 23:59 = next day 04:59 UTC.
  const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000
  const nowUtc     = Date.now()
  const bogotaMs   = nowUtc + BOGOTA_OFFSET_MS
  const bogotaDate = new Date(bogotaMs)
  const y = bogotaDate.getUTCFullYear()
  const m = bogotaDate.getUTCMonth()
  const d = bogotaDate.getUTCDate()
  // Start = midnight Bogotá = 05:00 UTC same day
  const timeMin = new Date(Date.UTC(y, m, d, 5, 0, 0)).toISOString()
  // End = 23:59:59 Bogotá = 04:59:59 UTC next day
  const timeMax = new Date(Date.UTC(y, m, d + 1, 4, 59, 59)).toISOString()

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeZone: 'America/Bogota',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/mramirez%40getontop.com/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!data.items) throw new Error(`Calendar API error: ${JSON.stringify(data)}`)

  const rawItems = data.items as { summary?: string; start?: { date?: string; dateTime?: string } }[]

  // Only include timed events (start.dateTime), not all-day events (start.date only),
  // which Google Calendar can return even when they fall outside the intended day.
  const titles = rawItems
    .filter(e => !!e.start?.dateTime)
    .map(e => e.summary ?? '')
    .filter(Boolean)

  return { titles, timeMin, timeMax, rawItems }
}

export interface MatchedMeeting {
  keyword: string   // the matched keyword (e.g. "GTM", "CCO")
  config: MeetingConfig
}

/**
 * Returns true if a calendar event title is a genuine match for a meeting keyword.
 *
 * Valid patterns (keyword must be structurally prominent, not incidental):
 *   "CFO"                 → keyword is the entire title
 *   "CFO Weekly"          → keyword at start, followed by space/separator
 *   "1:1 CFO"             → keyword after a 1:1 prefix
 *   "Julian | CFO"        → keyword at end after an explicit separator (/ | &)
 *   "GTM Review"          → keyword phrase at start
 *
 * Rejected patterns:
 *   "COO- Ideation time"  → keyword at start but followed by hyphen (time block label)
 *   "Vibe Coding for GTM" → keyword at end but preceded only by a plain word, not a separator
 */
function titleMatchesKeyword(title: string, keyword: string): boolean {
  const kw = keyword.toLowerCase()
  // Strip leading emoji, dashes, colons, and whitespace
  const clean = title.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase()
  // Strip common "1:1 " or "1-1 " prefix
  const stripped = clean.replace(/^1[:\-]1\s+/, '').trim()

  // 1. Keyword equals the full (stripped) title
  if (stripped === kw) return true
  // 2. Keyword at the start, followed by space or explicit separator (not hyphen)
  if (new RegExp(`^${kw}(\\s|/|\\||:|,)`).test(stripped)) return true
  // 3. Keyword at the end, preceded by an explicit separator / | & (not a generic space/word)
  if (new RegExp(`(/|\\||&)\\s*${kw}$`).test(clean)) return true

  return false
}

/** Returns matched meeting configs for today's calendar titles. */
export function getMatchedMeetings(meetingTitles: string[]): MatchedMeeting[] {
  const matched: MatchedMeeting[] = []
  const seenKeywords = new Set<string>()

  for (const title of meetingTitles) {
    for (const [keyword, config] of Object.entries(MEETING_AREA_MAP)) {
      if (!seenKeywords.has(keyword) && titleMatchesKeyword(title, keyword)) {
        matched.push({ keyword, config })
        seenKeywords.add(keyword)
      }
    }
  }
  return matched
}

/** Returns unique area names across all matched meetings (used for data fetching). */
/** Returns unique area names across all matched meetings (used for data fetching). */
export function getAreasForMeetings(meetingTitles: string[]): string[] {
  const areas = new Set<string>()
  for (const { config } of getMatchedMeetings(meetingTitles)) {
    config.areas.forEach(a => areas.add(a))
  }
  return Array.from(areas)
}
