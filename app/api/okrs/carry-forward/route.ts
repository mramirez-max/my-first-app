import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { krIds, sourceQuarter, sourceYear, targetQuarter, targetYear } = await req.json()
  if (!krIds?.length || !targetQuarter || !targetYear) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch selected KRs with their parent objectives
  const { data: krs, error: krsError } = await supabase
    .from('area_key_results')
    .select('id, description, target_value, unit, owner_id, objective_id, objective:area_objectives(id, title, area_id)')
    .in('id', krIds)

  if (krsError) return NextResponse.json({ error: krsError.message }, { status: 500 })

  // Group KRs by objective
  const byObjective = new Map<string, {
    objective: { id: string; title: string; area_id: string }
    krs: { id: string; description: string; target_value: number; unit: string | null; owner_id: string | null }[]
  }>()

  for (const kr of krs ?? []) {
    const obj = kr.objective as unknown as { id: string; title: string; area_id: string } | null
    if (!obj) continue
    if (!byObjective.has(kr.objective_id)) {
      byObjective.set(kr.objective_id, { objective: obj, krs: [] })
    }
    byObjective.get(kr.objective_id)!.krs.push({
      id: kr.id,
      description: kr.description,
      target_value: kr.target_value,
      unit: kr.unit,
      owner_id: kr.owner_id,
    })
  }

  const sourceLabel = `Q${sourceQuarter} ${sourceYear}`
  let objectivesCreated = 0
  let krsCreated = 0

  for (const { objective, krs: objKRs } of byObjective.values()) {
    const { title, area_id } = objective

    // Find existing objective in target quarter with same title and area, or create one
    const { data: existing } = await supabase
      .from('area_objectives')
      .select('id')
      .eq('area_id', area_id)
      .eq('quarter', targetQuarter)
      .eq('year', targetYear)
      .eq('title', title)
      .maybeSingle()

    let targetObjectiveId: string

    if (existing) {
      targetObjectiveId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase
        .from('area_objectives')
        .insert({ title, area_id, quarter: targetQuarter, year: targetYear, created_by: user.id })
        .select('id')
        .single()
      if (createErr || !created) continue
      targetObjectiveId = created.id
      objectivesCreated++
    }

    // Insert the KRs, prefixing description with source quarter label
    const krInserts = objKRs.map(kr => ({
      objective_id:  targetObjectiveId,
      description:   `↻ ${sourceLabel}: ${kr.description}`,
      target_value:  kr.target_value,
      current_value: 0,
      unit:          kr.unit,
      owner_id:      kr.owner_id,
    }))

    const { error: insertErr } = await supabase.from('area_key_results').insert(krInserts)
    if (!insertErr) krsCreated += krInserts.length
  }

  return NextResponse.json({ objectivesCreated, krsCreated })
}
