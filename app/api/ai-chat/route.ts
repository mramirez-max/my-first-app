import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getNotionMeetingNotes } from '@/lib/notion'

const client = new Anthropic({ maxRetries: 5 })

export async function POST(request: NextRequest) {
  const { messages, systemContext } = await request.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    systemContext: string
  }

  // Fetch live Notion meeting notes and append to context (5-min cache)
  const notionNotes = await getNotionMeetingNotes()
  const fullContext = notionNotes
    ? `${systemContext}\n\nNotion Meeting Notes (live, fetched now):\n${notionNotes}`
    : systemContext

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: fullContext,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      } catch (err) {
        // Stream an error message so the client shows something meaningful
        const msg = err instanceof Error ? err.message : 'Unknown error'
        controller.enqueue(encoder.encode(`⚠️ Error: ${msg}`))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
