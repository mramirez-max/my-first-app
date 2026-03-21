import { MEETING_AREA_MAP } from '@/config/meeting-area-map'

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

  // Use America/Bogota timezone (Cami's calendar timezone)
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

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

  return (data.items as { summary?: string }[])
    .map(e => e.summary ?? '')
    .filter(Boolean)
}

export function getAreasForMeetings(meetingTitles: string[]): string[] {
  const areas = new Set<string>()
  for (const title of meetingTitles) {
    for (const [keyword, mappedAreas] of Object.entries(MEETING_AREA_MAP)) {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        mappedAreas.forEach(a => areas.add(a))
      }
    }
  }
  return Array.from(areas)
}
