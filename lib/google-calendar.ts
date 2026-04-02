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

export async function getTodayMeetingTitles(): Promise<string[]> {
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

  // Only include timed events (start.dateTime), not all-day events (start.date only),
  // which Google Calendar can return even when they fall outside the intended day.
  return (data.items as { summary?: string; start?: { date?: string; dateTime?: string } }[])
    .filter(e => !!e.start?.dateTime)
    .map(e => e.summary ?? '')
    .filter(Boolean)
}

export interface MatchedMeeting {
  keyword: string   // the matched keyword (e.g. "GTM", "CCO")
  config: MeetingConfig
}

/** Returns matched meeting configs for today's calendar titles. */
export function getMatchedMeetings(meetingTitles: string[]): MatchedMeeting[] {
  const matched: MatchedMeeting[] = []
  const seenKeywords = new Set<string>()

  for (const title of meetingTitles) {
    for (const [keyword, config] of Object.entries(MEETING_AREA_MAP)) {
      if (
        !seenKeywords.has(keyword) &&
        new RegExp(`\\b${keyword}\\b`, 'i').test(title)
      ) {
        matched.push({ keyword, config })
        seenKeywords.add(keyword)
      }
    }
  }
  return matched
}

/** Returns unique area names across all matched meetings (used for data fetching). */
export function getAreasForMeetings(meetingTitles: string[]): string[] {
  const areas = new Set<string>()
  for (const { config } of getMatchedMeetings(meetingTitles)) {
    config.areas.forEach(a => areas.add(a))
  }
  return Array.from(areas)
}
