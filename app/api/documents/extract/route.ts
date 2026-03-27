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

// POST — accepts a PDF file (FormData) and returns an extracted summary
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  const MAX_SIZE = 20 * 1024 * 1024 // 20 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64  = buffer.toString('base64')

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
