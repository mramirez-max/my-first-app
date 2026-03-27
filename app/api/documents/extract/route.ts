import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const EXTRACTION_PROMPT = `You are extracting structured intelligence from a company document for use by an AI Chief of Staff.

Extract a concise, factual summary covering ALL of the following that are present in the document:

**Document type and date** — What kind of document is this and when does it cover?

**Key metrics** — Any specific numbers: ARR, MRR, TPV, growth rates, headcount, burn, runway, etc. Include the exact figures and the period they refer to.

**Strategic priorities** — What are the top initiatives or bets the company is making?

**Decisions made** — Any significant decisions, pivots, or commitments stated.

**Investor questions / concerns** — If this is a board or investor deck, what questions or concerns were raised or anticipated?

**Commitments and next steps** — What was promised to whom, and by when?

**Key narrative** — The central story or argument the document is making (1–2 sentences).

Format as clean markdown with ## headers for each section. Be specific — use actual names, numbers, and dates from the document. Skip any section that has no relevant content.`

// POST — accepts { blobUrl: string }, fetches the PDF, and returns an extracted summary.
// The file is uploaded client-side to Vercel Blob first (bypassing the 4.5MB serverless limit),
// so this endpoint only receives a small JSON body.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { blobUrl } = await request.json()
  if (!blobUrl) return NextResponse.json({ error: 'blobUrl is required' }, { status: 400 })

  // Fetch the PDF from Vercel Blob (server-to-server, no payload limit)
  let pdfBuffer: Buffer
  try {
    const res = await fetch(blobUrl)
    if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`)
    pdfBuffer = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch PDF: ${(err as Error).message}` }, { status: 400 })
  }

  const base64 = pdfBuffer.toString('base64')

  const client = new Anthropic()
  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type:   'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          } as Anthropic.DocumentBlockParam,
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  })

  const summary = response.content.find(b => b.type === 'text')?.text ?? ''
  return NextResponse.json({ summary })
}
