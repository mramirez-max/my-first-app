import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { METRIC_DEFINITIONS } from '@/lib/metrics'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = parseInt(searchParams.get('month') ?? '0')
  const year  = parseInt(searchParams.get('year')  ?? '0')

  if (!month || !year) {
    return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
  }

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('business_metrics')
    .select('metric_name, month, year, value')
    .or(
      `and(month.eq.${month},year.eq.${year}),and(month.eq.${prevMonth},year.eq.${prevYear})`
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { metric_name, month, year, value } = body

  const def = METRIC_DEFINITIONS.find(m => m.name === metric_name)
  if (!def) return NextResponse.json({ error: 'Unknown metric' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('business_metrics')
    .upsert(
      { metric_name, category: def.category, month, year, value: value ?? null, updated_by: user.id },
      { onConflict: 'metric_name,month,year' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
