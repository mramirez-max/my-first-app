import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { areas } = await req.json()
    // areas: Array<{ areaName: string, krs: string[], recentUpdates: string[] }>

    const hasUpdates = areas.some((a: { recentUpdates: string[] }) => a.recentUpdates.length > 0)
    if (!hasUpdates) {
      return NextResponse.json({ insights: [] })
    }

    const context = areas
      .filter((a: { recentUpdates: string[] }) => a.recentUpdates.length > 0)
      .map((a: { areaName: string; krs: string[]; recentUpdates: string[] }) =>
        `**${a.areaName}**\nOKRs: ${a.krs.length ? a.krs.join(' | ') : '(none)'}\nUpdates: ${a.recentUpdates.join(' | ')}`
      )
      .join('\n\n')

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are reviewing weekly OKR updates. Find work mentioned in the updates that has NO matching OKR or key result — these are untracked projects or initiatives.

Return ONLY a JSON array. Max 5 items. Each under 12 words. Format: [{"area":"...","message":"..."}]
If nothing clearly stands out, return [].

${context}`,
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? '[]'
    const match = text.match(/\[[\s\S]*?\]/)
    const insights = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ insights })
  } catch (err) {
    console.error('ai-insights error:', err)
    return NextResponse.json({ insights: [] })
  }
}
