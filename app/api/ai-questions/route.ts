import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface AreaPayload {
  areaName: string
  krs: string[]
  recentUpdates: string[]
  companyObjectives: string[]
}

export async function POST(request: NextRequest) {
  const { areas } = await request.json() as { areas: AreaPayload[] }

  if (!areas || areas.length === 0) {
    return NextResponse.json({ questions: [] })
  }

  const areaBlocks = areas.map(a => {
    const krs = a.krs.length > 0 ? a.krs.map(k => `  - ${k}`).join('\n') : '  (none set)'
    const updates = a.recentUpdates.length > 0 ? a.recentUpdates.slice(0, 3).map(u => `  - ${u}`).join('\n') : '  (no recent updates)'
    const cos = a.companyObjectives.length > 0 ? a.companyObjectives.map(c => `  - ${c}`).join('\n') : '  (none)'
    return `### ${a.areaName}
Key Results:
${krs}
Recent Updates:
${updates}
Aligned Company Objectives:
${cos}`
  }).join('\n\n')

  const prompt = `You are an executive advisor helping a CEO/COO prepare for senior leadership check-ins.

For each business area below, generate exactly 3 sharp, specific follow-up questions that a CEO or COO should ask the area leader. Questions should:
- Probe gaps between stated OKRs and actual progress
- Challenge assumptions in recent updates
- Surface risks, blockers, or strategic misalignments
- Be direct and senior-leader appropriate (not generic)

${areaBlocks}

Return ONLY valid JSON in this exact format:
[
  { "area": "AreaName", "questions": ["Q1", "Q2", "Q3"] },
  ...
]`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    if (!text) {
      return NextResponse.json({ error: 'No text in Claude response', questions: [] }, { status: 500 })
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse JSON from response', raw: text.slice(0, 300), questions: [] }, { status: 500 })
    }

    const questions = JSON.parse(jsonMatch[0])
    return NextResponse.json({ questions })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, questions: [] }, { status: 500 })
  }
}
