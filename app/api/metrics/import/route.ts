import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { METRIC_DEFINITIONS } from '@/lib/metrics'

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

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const metricIdx = header.indexOf('metric')
  const monthIdx  = header.indexOf('month')
  const yearIdx   = header.indexOf('year')
  const valueIdx  = header.indexOf('value')

  if ([metricIdx, monthIdx, yearIdx, valueIdx].includes(-1)) {
    return NextResponse.json({
      error: 'CSV must have exactly these columns: metric, month, year, value',
    }, { status: 400 })
  }

  // Build a lookup: lowercase name -> definition
  const defMap = new Map(METRIC_DEFINITIONS.map(m => [m.name.toLowerCase(), m]))

  const rows: { metric_name: string; category: string; month: number; year: number; value: number; updated_by: string }[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols       = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const metricRaw  = cols[metricIdx]
    const month      = parseInt(cols[monthIdx])
    const year       = parseInt(cols[yearIdx])
    const value      = parseFloat(cols[valueIdx])

    if (!metricRaw || isNaN(month) || isNaN(year) || isNaN(value)) {
      errors.push(`Row ${i + 1}: skipped — invalid or missing data`)
      continue
    }

    const def = defMap.get(metricRaw.toLowerCase())
    if (!def) {
      errors.push(`Row ${i + 1}: unknown metric "${metricRaw}"`)
      continue
    }

    rows.push({ metric_name: def.name, category: def.category, month, year, value, updated_by: user.id })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows found', details: errors }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: dbError } = await admin
    .from('business_metrics')
    .upsert(rows, { onConflict: 'metric_name,month,year' })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({
    imported: rows.length,
    skipped:  errors.length,
    errors:   errors.slice(0, 20),
  })
}
