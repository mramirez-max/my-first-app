import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { del } from '@vercel/blob'

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
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const blobUrl  = formData.get('blobUrl')  as string | null
    const pdfFile  = formData.get('pdf')      as File   | null
    const krsJson  = formData.get('krs')      as string | null
    const areaName = formData.get('areaName') as string | null

    if ((!blobUrl && !pdfFile) || !krsJson || !areaName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const krs: KRInput[] = JSON.parse(krsJson)
    if (krs.length === 0) {
      return NextResponse.json({ error: 'No key results found for this area' }, { status: 400 })
    }

    // Fetch PDF bytes — either from Vercel Blob URL or direct upload
    let pdfBase64: string
    if (blobUrl) {
      const blobRes = await fetch(blobUrl)
      pdfBase64 = Buffer.from(await blobRes.arrayBuffer()).toString('base64')
    } else {
      pdfBase64 = Buffer.from(await pdfFile!.arrayBuffer()).toString('base64')
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
                  },
                  required: [
                    'keyResultId',
                    'updateText',
                    'confidenceScore',
                    'currentValue',
                    'reasoning',
                  ],
                },
              },
            },
            required: ['updates'],
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

Here are the key results to update:

${krsText}

For each KR:
- Write a 2–4 sentence update describing what the document reveals about progress this week
- Assign a confidence score (1–5) based on the pace toward the target
- Estimate the current value based on evidence in the document
- If the document has no direct information about a KR, use the overall context and clearly note the uncertainty in the update text

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

    const result = toolUseBlock.input as { updates: KRUpdate[] }

    // Clean up the temporary blob now that we have the result
    if (blobUrl) {
      try { await del(blobUrl) } catch { /* non-fatal */ }
    }

    return NextResponse.json({ updates: result.updates })
  } catch (error) {
    console.error('AI update error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
