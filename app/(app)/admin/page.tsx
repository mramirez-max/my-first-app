import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminClient from './AdminClient'
import { getCurrentQuarter } from '@/types'
import { ComputedInsight, AreaInsightData } from '@/components/admin/InsightsPanel'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  const { quarter, year } = getCurrentQuarter()

  const admin = createAdminClient()

  const [
    { data: profiles },
    { data: areas },
    { data: companyObjectives },
    { data: { users } },
    { data: areaObjectives },
  ] = await Promise.all([
    supabase.from('profiles').select('*, area:areas(name)').order('full_name'),
    supabase.from('areas').select('*').order('name'),
    supabase
      .from('company_objectives')
      .select('id, title, quarter, year, created_at, created_by')
      .eq('quarter', quarter)
      .eq('year', year)
      .order('created_at'),
    admin.auth.admin.listUsers(),
    supabase
      .from('area_objectives')
      .select('id, title, area_id, area:areas(name), key_results:area_key_results(id, description, updates:area_kr_updates(confidence_score, update_text, created_at))')
      .eq('quarter', quarter)
      .eq('year', year),
  ])

  // Merge emails into profiles
  const emailMap = Object.fromEntries((users ?? []).map(u => [u.id, u.email]))
  const profilesWithEmail = (profiles ?? []).map(p => ({ ...p, email: emailMap[p.id] ?? null }))

  // --- Compute insights ---
  const insights: ComputedInsight[] = []

  // 1. Areas with no OKRs this quarter
  const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => o.area_id))
  for (const area of areas ?? []) {
    if (!areaIdsWithOKRs.has(area.id)) {
      insights.push({ type: 'missing', area: area.name, message: `No OKRs set for Q${quarter} ${year}` })
    }
  }

  type KRRow = { id: string; description: string; updates: { confidence_score: number; update_text: string; created_at: string }[] }
  type ObjRow = { area_id: string; area: unknown; key_results: unknown }

  function getAreaName(obj: ObjRow): string {
    const a = obj.area as { name?: string } | null
    return a?.name ?? 'Unknown'
  }

  function getKRs(obj: ObjRow): KRRow[] {
    return (obj.key_results as KRRow[]) ?? []
  }

  // 2. KRs with no updates at all
  for (const obj of (areaObjectives ?? []) as ObjRow[]) {
    const areaName = getAreaName(obj)
    for (const kr of getKRs(obj)) {
      if (!kr.updates || kr.updates.length === 0) {
        const short = kr.description.length > 50 ? kr.description.slice(0, 50) + '…' : kr.description
        insights.push({ type: 'stale', area: areaName, message: `"${short}" — never updated` })
      }
    }
  }

  // 3. KRs with latest confidence ≤ 2
  for (const obj of (areaObjectives ?? []) as ObjRow[]) {
    const areaName = getAreaName(obj)
    for (const kr of getKRs(obj)) {
      if (!kr.updates || kr.updates.length === 0) continue
      const latest = [...kr.updates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      if (latest.confidence_score <= 2) {
        const short = kr.description.length > 50 ? kr.description.slice(0, 50) + '…' : kr.description
        insights.push({ type: 'at_risk', area: areaName, message: `"${short}" — confidence ${latest.confidence_score}/5` })
      }
    }
  }

  // --- Build AI scan payload ---
  const areaMap: Record<string, { krs: string[]; recentUpdates: string[] }> = {}
  for (const obj of (areaObjectives ?? []) as ObjRow[]) {
    const areaName = getAreaName(obj)
    if (!areaMap[areaName]) areaMap[areaName] = { krs: [], recentUpdates: [] }
    for (const kr of getKRs(obj)) {
      areaMap[areaName].krs.push(kr.description)
      const sorted = [...(kr.updates ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      sorted.slice(0, 2).forEach(u => {
        if (u.update_text) areaMap[areaName].recentUpdates.push(u.update_text)
      })
    }
  }
  const areaData: AreaInsightData[] = Object.entries(areaMap).map(([areaName, d]) => ({
    areaName,
    krs: d.krs,
    recentUpdates: d.recentUpdates,
  }))

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF5A70] to-[#4A268C] bg-clip-text text-transparent">Admin Panel</h1>
        <p className="text-white/50 mt-1">Manage users, roles, and areas</p>
      </div>
      <AdminClient
        profiles={profilesWithEmail}
        areas={areas ?? []}
        companyObjectives={companyObjectives ?? []}
        quarter={quarter}
        year={year}
        insights={insights}
        areaData={areaData}
      />
    </div>
  )
}
