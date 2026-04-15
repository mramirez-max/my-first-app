const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

let cache: { notes: string; fetchedAt: number } | null = null

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

function richTextToString(richText: Array<{ plain_text: string }>): string {
  return (richText ?? []).map(t => t.plain_text).join('')
}

function blockToText(block: Record<string, unknown>): string {
  const type = block.type as string
  const content = block[type] as Record<string, unknown> | undefined
  if (!content) return ''

  const rt = content.rich_text as Array<{ plain_text: string }> | undefined
  const text = rt ? richTextToString(rt) : ''

  switch (type) {
    case 'heading_1':           return `# ${text}`
    case 'heading_2':           return `## ${text}`
    case 'heading_3':           return `### ${text}`
    case 'bulleted_list_item':  return `• ${text}`
    case 'numbered_list_item':  return `- ${text}`
    case 'to_do':               return `${content.checked ? '✓' : '☐'} ${text}`
    case 'quote':               return `> ${text}`
    case 'callout':             return `[!] ${text}`
    case 'code':                return `\`${text}\``
    case 'divider':             return '---'
    case 'paragraph':           return text
    default:                    return text
  }
}

async function fetchPageBlocks(pageId: string): Promise<string> {
  try {
    const res = await fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
      headers: headers(),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return (data.results as Record<string, unknown>[])
      .map(blockToText)
      .filter(Boolean)
      .join('\n')
  } catch {
    return ''
  }
}

function getPageTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, Record<string, unknown>> | undefined
  if (!props) return 'Untitled'
  for (const key of Object.keys(props)) {
    const prop = props[key]
    if (prop?.type === 'title') {
      const titleArr = prop.title as Array<{ plain_text: string }>
      const text = (titleArr ?? []).map(t => t.plain_text).join('').trim()
      if (text) return text
    }
  }
  return 'Untitled'
}

export async function getNotionMeetingNotes(): Promise<string> {
  const apiKey = process.env.NOTION_API_KEY
  const dbId   = process.env.NOTION_DATABASE_ID

  if (!apiKey || !dbId) return ''

  // Return cached result if still fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.notes
  }

  try {
    const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify({
        sorts:     [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: 20,
      }),
    })

    if (!res.ok) return ''

    const data  = await res.json()
    const pages = (data.results ?? []) as Record<string, unknown>[]

    if (!pages.length) return ''

    const pageContents = await Promise.all(
      pages.map(async page => {
        const title   = getPageTitle(page)
        const created = page.created_time as string
        const date    = new Date(created).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
        const content = await fetchPageBlocks(page.id as string)
        return `[Notion Meeting Notes: ${title} · ${date}]\n${content || '(no content extracted)'}`
      })
    )

    const notes = pageContents.join('\n\n---\n\n')
    cache = { notes, fetchedAt: Date.now() }
    return notes
  } catch {
    return ''
  }
}
