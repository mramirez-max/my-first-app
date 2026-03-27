import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

export const maxDuration = 60

export interface KRProposal {
  description: string
  target_value: number
  unit: string | null
}

export interface ObjectiveProposal {
  title: string
  aligned_to: string | null
  reasoning: string
  key_results: KRProposal[]
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, areaName, companyObjectives } = await req.json()

    if (!prompt || !areaName) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 5 })

    const coList = (companyObjectives ?? [])
      .map((co: { id: string; title: string }, i: number) => `${i + 1}. ID: "${co.id}" — ${co.title}`)
      .join('\n')

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      tools: [
        {
          name: 'submit_okr_structure',
          description: 'Submit the structured OKR plan for the area',
          input_schema: {
            type: 'object' as const,
            properties: {
              objectives: {
                type: 'array',
                description: 'List of area objectives',
                items: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Objective title — strong verb, ambitious, qualitative',
                    },
                    aligned_to: {
                      type: ['string', 'null'],
                      description: 'Exact ID of the company objective this supports, or null',
                    },
                    reasoning: {
                      type: 'string',
                      description: 'One sentence explaining why this aligns to that company objective',
                    },
                    key_results: {
                      type: 'array',
                      description: '2–4 measurable key results',
                      items: {
                        type: 'object',
                        properties: {
                          description: { type: 'string' },
                          target_value: { type: 'number' },
                          unit: { type: ['string', 'null'] },
                        },
                        required: ['description', 'target_value', 'unit'],
                      },
                    },
                  },
                  required: ['title', 'aligned_to', 'reasoning', 'key_results'],
                },
              },
            },
            required: ['objectives'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_okr_structure' },
      messages: [
        {
          role: 'user',
          content: `You are an OKR expert helping structure quarterly OKRs for the ${areaName} area of a borderless workforce company.

Company objectives available for alignment (use their exact IDs):
${coList || '(none defined yet)'}

Input from the area lead:
---
${prompt}
---

Instructions:
- Extract or infer objectives from the input. If the input is rough notes, shape them into proper OKR format.
- Each objective: starts with a strong action verb, is ambitious but achievable in one quarter.
- For aligned_to: pick the best matching company objective ID. Use null only if truly unrelated.
- Key results: specific, numeric, with units (e.g., "$", "%", "workers", "days", "NPS points").
- Target values must be realistic numbers based on context in the input.`,
        },
      ],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return Response.json({ error: 'No structured output from AI' }, { status: 500 })
    }

    return Response.json(toolUse.input)
  } catch (err) {
    console.error('ai-okr error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
