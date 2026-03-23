import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

const client = new Anthropic()

export interface BulkKRInput {
  description: string
  targetValue: number
  currentValue: number
  unit: string
}

export interface BulkObjectiveInput {
  title: string
  alignedToIndex: number | null // 0, 1, 2 maps to company objective
  keyResults: BulkKRInput[]
}

export interface BulkAreaInput {
  areaName: string
  objectives: BulkObjectiveInput[]
}

export interface BulkImportResult {
  areas: BulkAreaInput[]
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const pdfFile = formData.get('pdf') as File | null
    const pastedText = formData.get('text') as string | null
    const areasJson = formData.get('areas') as string
    const companyObjectivesJson = formData.get('companyObjectives') as string
    const quarter = formData.get('quarter') as string
    const year = formData.get('year') as string

    const areas: string[] = JSON.parse(areasJson)
    const companyObjectives: string[] = JSON.parse(companyObjectivesJson)

    if (!pdfFile && !pastedText) {
      return NextResponse.json({ error: 'Provide a PDF or paste text' }, { status: 400 })
    }

    const companyObjList = companyObjectives
      .map((title, i) => `${i}. ${title}`)
      .join('\n')

    const systemPrompt = `You are an OKR specialist helping a company import their Q${quarter} ${year} OKRs.

Company Objectives (use index 0, 1, or 2 for alignment, or null if not aligned):
${companyObjList}

Areas in this company:
${areas.join(', ')}

Extract structured OKRs for each area from the provided document. Rules:
- Each area can have 1–3 objectives
- Each objective should have 2–5 key results
- Key results must have a numeric target value and a unit (e.g., "customers", "%", "$", "NPS points", "days", "tickets")
- currentValue should be 0 unless the document specifies a starting baseline
- alignedToIndex must be 0, 1, or 2 (matching the company objectives above), or null
- If an area is not mentioned, include it with an empty objectives array
- Keep objective titles concise but specific
- Keep KR descriptions action-oriented and measurable`

    const messages: Anthropic.MessageParam[] = []

    if (pdfFile) {
      const arrayBuffer = await pdfFile.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      messages.push({
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: `Extract and structure the OKRs for all areas from this document for Q${quarter} ${year}.`,
          },
        ],
      })
    } else {
      messages.push({
        role: 'user',
        content: `Here are the OKRs to import for Q${quarter} ${year}:\n\n${pastedText}\n\nExtract and structure them for all areas.`,
      })
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages,
      tools: [
        {
          name: 'submit_bulk_okrs',
          description: 'Submit structured OKRs for all company areas',
          input_schema: {
            type: 'object' as const,
            properties: {
              areas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    areaName: { type: 'string' },
                    objectives: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          alignedToIndex: { type: ['integer', 'null'] },
                          keyResults: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                description: { type: 'string' },
                                targetValue: { type: 'number' },
                                currentValue: { type: 'number' },
                                unit: { type: 'string' },
                              },
                              required: ['description', 'targetValue', 'currentValue', 'unit'],
                            },
                          },
                        },
                        required: ['title', 'alignedToIndex', 'keyResults'],
                      },
                    },
                  },
                  required: ['areaName', 'objectives'],
                },
              },
            },
            required: ['areas'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_bulk_okrs' },
    }, {
      headers: { 'anthropic-beta': 'pdfs-2024-09-25' },
    })

    const toolBlock = response.content.find(b => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'AI did not return structured data' }, { status: 500 })
    }

    const result = toolBlock.input as BulkImportResult
    return NextResponse.json(result)
  } catch (err) {
    console.error('Bulk import error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process' },
      { status: 500 }
    )
  }
}
