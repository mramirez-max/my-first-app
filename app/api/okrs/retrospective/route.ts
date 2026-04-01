import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { formatAnthropicError } from '@/lib/anthropic-error'

export const maxDuration = 60

const client = new Anthropic({ maxRetries: 5 })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { quarter, year } = await req.json()
    if (!quarter || !year) return NextResponse.json({ error: 'quarter and year are required' }, { status: 400 })

    // Fetch objectives + KRs + updates directly — avoids sending large payload from client
    const { data: objectives, error: dbError } = await supabase
      .from('area_objectives')
      .select('title, area:areas(name), key_results:area_key_results(description, target_value, current_value, updates:area_kr_updates(confidence_score, week_date))')
      .eq('quarter', quarter)
      .eq('year', year)
      .order('created_at')

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    const nextQ = quarter === 4 ? 1 : quarter + 1
    const nextY = quarter === 4 ? year + 1 : year

    const perfSummary = (objectives ?? []).map((obj) => {
      const area = obj.area as unknown as { name: string } | null
      const areaName = area?.name ?? 'Unknown'
      const krs = (obj.key_results as {
        description: string
        target_value: number
        current_value: number
        updates: { confidence_score: number; week_date: string }[]
      }[] ?? []).map(kr => {
        const p = kr.target_value > 0 ? Math.round((kr.current_value / kr.target_value) * 100) : 0
        const status = p >= 100 ? 'Met' : p >= 50 ? 'Partial' : 'Missed'
        const latestConf = kr.updates?.length > 0
          ? [...kr.updates].sort((a, b) => new Date(b.week_date).getTime() - new Date(a.week_date).getTime())[0].confidence_score
          : null
        return `    - ${kr.description}: ${p}% (${status})${latestConf !== null ? ` | confidence ${latestConf}/5` : ' | never updated'}`
      }).join('\n') || '    (no KRs defined)'
      return `  ${areaName} — ${obj.title}:\n${krs}`
    }).join('\n\n')

    const prompt = `You are analyzing Q${quarter} ${year} OKR performance for Ontop, a global payroll and workforce platform.

Here is the full performance data by area:
${perfSummary}

Write a concise executive retrospective covering exactly these four sections:
## What we achieved
Highlight standout wins — Met KRs and areas that executed well. Be specific.

## What fell short
Honest assessment of Missed and Partial KRs. Name them. Identify likely root causes where evident.

## Cross-area patterns
Any themes that appear across multiple areas (e.g., metric-tracking gaps, common blocker types, execution vs. goal-setting issues). Skip if no patterns are evident.

## Recommendations for Q${nextQ} ${nextY}
3–5 specific, actionable items directly tied to the Q${quarter} misses. Not generic advice — name the areas and KRs.

Be direct. No preamble. No sign-off. No padding.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ summary })
  } catch (err) {
    return NextResponse.json({ error: formatAnthropicError(err) }, { status: 500 })
  }
}
