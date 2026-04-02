import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { formatAnthropicError } from '@/lib/anthropic-error'

export const maxDuration = 120 // 2 minutes for large PDFs

export interface KRInput {
  id: string
  description: string
  current_value: number
  target_value: number
  unit: string | null
  objective_title: string
}

export interface KRUpdate {
  keyResultId: string
  updateText: string
  confidenceScore: number
  currentValue: number
  reasoning: string
  matchConfidence: 'high' | 'low' | 'none'
}

export interface UnmatchedTopic {
  title: string
  summary: string
  suggestedQuestion: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const pdfFile  = formData.get('pdf')      as File   | null
    const krsJson  = formData.get('krs')      as string | null
    const areaName = formData.get('areaName') as string | null

    if (!pdfFile || !krsJson || !areaName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const krs: KRInput[] = JSON.parse(krsJson)
    if (krs.length === 0) {
      return NextResponse.json({ error: 'No key results found for this area' }, { status: 400 })
    }

    const pdfBase64 = Buffer.from(await pdfFile.arrayBuffer()).toString('base64')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 5 })

    const krsText = krs
      .map(
        (kr, i) =>
          `KR ${i + 1}:
  ID: ${kr.id}
  Objective: "${kr.objective_title}"
  Key Result: "${kr.description}"
  Current value: ${kr.current_value}${kr.unit ? ' ' + kr.unit : ''}
  Target: ${kr.target_value}${kr.unit ? ' ' + kr.unit : ''}`
      )
      .join('\n\n')

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      tool_choice: { type: 'tool', name: 'submit_okr_updates' },
      tools: [
        {
          name: 'submit_okr_updates',
          description:
            'Submit weekly OKR progress updates generated from analyzing the provided document.',
          input_schema: {
            type: 'object' as const,
            properties: {
              updates: {
                type: 'array',
                description: 'One update object per key result',
                items: {
                  type: 'object',
                  properties: {
                    keyResultId: {
                      type: 'string',
                      description: 'The exact KR ID as provided',
                    },
                    updateText: {
                      type: 'string',
                      description:
                        '2–4 sentence narrative update on progress this week based on the document',
                    },
                    confidenceScore: {
                      type: 'integer',
                      description:
                        'Confidence that this KR will be achieved: 1=Off track, 2=At risk, 3=Cautious, 4=Good, 5=On track',
                    },
                    currentValue: {
                      type: 'number',
                      description:
                        'Best estimate of the current value for this KR based on the document',
                    },
                    reasoning: {
                      type: 'string',
                      description: '1–2 sentences explaining the confidence score',
                    },
                    matchConfidence: {
                      type: 'string',
                      enum: ['high', 'low', 'none'],
                      description:
                        'How well the document covers this KR: "high" = document directly addresses it with specific data, "low" = tangential mention or weak signal, "none" = topic entirely absent from the document',
                    },
                  },
                  required: [
                    'keyResultId',
                    'updateText',
                    'confidenceScore',
                    'currentValue',
                    'reasoning',
                    'matchConfidence',
                  ],
                },
              },
              unmatchedTopics: {
                type: 'array',
                description: 'Topics the document covers that do not correspond to any stored KR',
                items: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Short name of the topic (e.g. "SMB pipeline velocity")',
                    },
                    summary: {
                      type: 'string',
                      description: '1–2 sentences describing what the document says about this topic',
                    },
                    suggestedQuestion: {
                      type: 'string',
                      description: 'A specific question leadership (CEO/COO) should ask the area lead about this topic — e.g. whether it should become a formal KR, what the target would be, or whether it replaces an existing KR',
                    },
                  },
                  required: ['title', 'summary', 'suggestedQuestion'],
                },
              },
            },
            required: ['updates', 'unmatchedTopics'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: `You are an OKR coach. Analyze the document above and generate weekly progress updates for the **${areaName}** team's key results.

Here are the stored key results to update:

${krsText}

**Step 1 — Update each stored KR:**
For each KR, generate an update and rate your match confidence:
- "high": the document directly addresses this KR with specific data or a clear status
- "low": the document tangentially mentions the topic or you're inferring from related context
- "none": this KR topic is entirely absent from the document — the team did not report on it

For "none" KRs: still generate an update, but be explicit that the document contained no information on this KR. Keep the current_value unchanged from the provided value. Set confidence to the existing trend if known, otherwise 2.

**Step 2 — Identify unmatched topics:**
After processing all stored KRs, scan the document for significant initiatives, metrics, or results that the team reported on but that do NOT correspond to any stored KR. For each unmatched topic:
- Write a 1–2 sentence summary of what was reported
- Write a specific, direct question that the CEO or COO should ask the area lead — e.g. whether this should become a formal KR, what the target would be, whether it replaces an existing KR, or why it wasn't originally included

If the document perfectly matches all stored KRs with no extra topics, return an empty array for unmatchedTopics.

Generate one update per KR. Use the exact KR IDs provided.`,
            },
          ],
        },
      ],
    })

    // Extract tool use result
    const toolUseBlock = response.content.find(b => b.type === 'tool_use')
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'AI did not return structured updates' }, { status: 500 })
    }

    const result = toolUseBlock.input as { updates: KRUpdate[]; unmatchedTopics: UnmatchedTopic[] }

    return NextResponse.json({ updates: result.updates, unmatchedTopics: result.unmatchedTopics ?? [] })
  } catch (error) {
    console.error('AI update error:', error)
    return NextResponse.json({ error: formatAnthropicError(error) }, { status: 500 })
  }
}
