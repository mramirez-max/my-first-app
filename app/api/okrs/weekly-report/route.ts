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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { quarter, year } = await req.json()
    if (!quarter || !year) return NextResponse.json({ error: 'quarter and year are required' }, { status: 400 })

    // Find Operations area
    const { data: operationsArea } = await supabase
      .from('areas')
      .select('id')
      .eq('name', 'Operations')
      .single()

    if (!operationsArea) return NextResponse.json({ error: 'Operations area not found' }, { status: 404 })

    // Fetch team OKRs with all updates for the quarter (independent from area_objectives)
    const { data: objectives, error: dbError } = await supabase
      .from('team_objectives')
      .select(`
        title, aligned_to,
        aligned_objective:company_objectives(title),
        key_results:team_key_results(
          id, description, target_value, current_value, unit,
          updates:team_kr_updates(confidence_score, update_text, week_date, created_at)
        )
      `)
      .eq('area_id', operationsArea.id)
      .eq('quarter', quarter)
      .eq('year', year)
      .order('created_at')

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

    // Get current week's Monday
    const today = new Date()
    const dayOfWeek = today.getDay()
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const currentWeekStr = currentMonday.toISOString().split('T')[0]

    // Build summary for Claude
    const objSummaries = (objectives ?? []).map(obj => {
      const alignedTitle = (obj.aligned_objective as { title?: string } | null)?.title
      const header = alignedTitle
        ? `Objective: "${obj.title}" (aligned to company OKR: "${alignedTitle}")`
        : `Objective: "${obj.title}"`

      const krs = (obj.key_results as {
        id: string
        description: string
        target_value: number
        current_value: number
        unit: string | null
        updates: { confidence_score: number; update_text: string; week_date: string; created_at: string }[]
      }[] ?? []).map(kr => {
        const sortedUpdates = [...(kr.updates ?? [])].sort(
          (a, b) => new Date(b.week_date).getTime() - new Date(a.week_date).getTime()
        )
        const latest = sortedUpdates[0]
        const prev = sortedUpdates[1]

        const progress = kr.target_value > 0
          ? Math.round((kr.current_value / kr.target_value) * 100)
          : 0
        const hasUpdateThisWeek = latest?.week_date === currentWeekStr

        const confidenceDelta = latest && prev
          ? latest.confidence_score - prev.confidence_score
          : null

        const trendLabel = confidenceDelta === null
          ? 'no prior data'
          : confidenceDelta > 0 ? `↑ improved +${confidenceDelta}`
          : confidenceDelta < 0 ? `↓ declined ${confidenceDelta}`
          : '= stable'

        const lines = [
          `  KR: "${kr.description}"`,
          `  Progress: ${kr.current_value}/${kr.target_value}${kr.unit ? ' ' + kr.unit : ''} (${progress}%)`,
          latest
            ? `  Latest confidence: ${latest.confidence_score}/5 (${trendLabel})`
            : '  Latest confidence: no updates yet',
          hasUpdateThisWeek
            ? `  This week's update: "${latest?.update_text}"`
            : '  ⚠ No update submitted this week',
        ]
        return lines.join('\n')
      }).join('\n\n')

      return `${header}\n${krs}`
    }).join('\n\n---\n\n')

    const prompt = `You are helping Cami, COO of Ontop, track her Operations team's weekly OKR progress.

Today is ${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
Quarter: Q${quarter} ${year}

Here is the Operations team's OKR data:

${objSummaries || 'No OKRs set for this quarter.'}

Write a concise weekly status report for Cami. Cover exactly these five sections:

## Team Health
Quick summary: how many KRs are on track (confidence 4-5), cautious (3), at risk (1-2), and missing updates this week.

## Highlights
Wins or improvements this week — KRs that gained confidence or hit milestones. Be specific.

## Needs Attention
KRs that are declining, stalled, or at risk (confidence ≤ 2). Name them and include the latest update context.

## Missing Updates
List KRs with no update submitted this week. These are gaps Cami should follow up on.

## Actions for Cami
2–3 specific, actionable next steps based on what you see. Name the KRs. Not generic advice.

Be direct. No preamble. No sign-off. No padding.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const report = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ report })
  } catch (err) {
    return NextResponse.json({ error: formatAnthropicError(err) }, { status: 500 })
  }
}
