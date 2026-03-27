import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentQuarter } from '@/types'
import { ComputedInsight, AreaInsightData } from '@/components/admin/InsightsPanel'
import ExecutiveClient from '@/components/executive/ExecutiveClient'
import { METRIC_DEFINITIONS, formatMetricValue } from '@/lib/metrics'

export default async function ExecutivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  const { quarter, year } = getCurrentQuarter()

  const now        = new Date()
  const latestMonth = now.getMonth() + 1
  const latestYear  = now.getFullYear()
  const prevMonth   = latestMonth === 1 ? 12 : latestMonth - 1
  const prevYear    = latestMonth === 1 ? latestYear - 1 : latestYear

  const [
    { data: areas },
    { data: companyObjectives },
    { data: areaObjectives },
    { data: metricsRaw },
    { data: documents },
  ] = await Promise.all([
    supabase.from('areas').select('*').order('name'),
    supabase
      .from('company_objectives')
      .select('id, title')
      .eq('quarter', quarter)
      .eq('year', year),
    supabase
      .from('area_objectives')
      .select('id, title, area_id, aligned_to, area:areas(name), key_results:area_key_results(id, description, updates:area_kr_updates(confidence_score, update_text, created_at))')
      .eq('quarter', quarter)
      .eq('year', year),
    supabase
      .from('business_metrics')
      .select('metric_name, month, year, value')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase
      .from('company_documents')
      .select('id, title, doc_type, doc_date, blob_url, summary, created_at')
      .order('doc_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ])

  type KRRow = { id: string; description: string; updates: { confidence_score: number; update_text: string; created_at: string }[] }
  type ObjRow = { area_id: string; aligned_to: string | null; area: unknown; key_results: unknown }

  function getAreaName(obj: ObjRow): string {
    const a = obj.area as { name?: string } | null
    return a?.name ?? 'Unknown'
  }

  function getKRs(obj: ObjRow): KRRow[] {
    return (obj.key_results as KRRow[]) ?? []
  }

  // --- Compute insights ---
  const insights: ComputedInsight[] = []

  const areaIdsWithOKRs = new Set((areaObjectives ?? []).map(o => (o as unknown as ObjRow).area_id))
  for (const area of areas ?? []) {
    if (!areaIdsWithOKRs.has(area.id)) {
      insights.push({ type: 'missing', area: area.name, message: `No OKRs set for Q${quarter} ${year}` })
    }
  }

  for (const obj of (areaObjectives ?? []) as unknown as ObjRow[]) {
    const areaName = getAreaName(obj)
    for (const kr of getKRs(obj)) {
      if (!kr.updates || kr.updates.length === 0) {
        const short = kr.description.length > 60 ? kr.description.slice(0, 60) + '…' : kr.description
        insights.push({ type: 'stale', area: areaName, krId: kr.id, message: `"${short}" — never updated`, detail: kr.description })
      }
    }
  }

  for (const obj of (areaObjectives ?? []) as unknown as ObjRow[]) {
    const areaName = getAreaName(obj)
    for (const kr of getKRs(obj)) {
      if (!kr.updates || kr.updates.length === 0) continue
      const latest = [...kr.updates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      if (latest.confidence_score <= 2) {
        const short = kr.description.length > 60 ? kr.description.slice(0, 60) + '…' : kr.description
        insights.push({ type: 'at_risk', area: areaName, krId: kr.id, message: `"${short}" — confidence ${latest.confidence_score}/5`, detail: kr.description })
      }
    }
  }

  // --- Build areaData for InsightsPanel AI scan + areasPayload for AI chat ---
  const coMap = Object.fromEntries((companyObjectives ?? []).map(co => [co.id, co.title]))

  type ObjWithAlignment = ObjRow & { id: string }

  const areaMap: Record<string, {
    krs: string[]
    recentUpdates: string[]
    krDetails: { description: string; latestUpdate: string | null; confidence: number | null; updatedAt: string | null; neverUpdated: boolean }[]
    companyObjectives: Set<string>
  }> = {}

  for (const obj of (areaObjectives ?? []) as unknown as ObjWithAlignment[]) {
    const areaName = getAreaName(obj)
    if (!areaMap[areaName]) areaMap[areaName] = { krs: [], recentUpdates: [], krDetails: [], companyObjectives: new Set() }

    if (obj.aligned_to && coMap[obj.aligned_to]) {
      areaMap[areaName].companyObjectives.add(coMap[obj.aligned_to])
    }

    for (const kr of getKRs(obj)) {
      areaMap[areaName].krs.push(kr.description)

      const sorted = [...(kr.updates ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      const latest = sorted[0] ?? null

      // For InsightsPanel (flat list)
      sorted.slice(0, 2).forEach(u => {
        if (u.update_text) areaMap[areaName].recentUpdates.push(u.update_text)
      })

      // For AI chat (structured, per-KR)
      areaMap[areaName].krDetails.push({
        description:  kr.description,
        latestUpdate: latest?.update_text ?? null,
        confidence:   latest?.confidence_score ?? null,
        updatedAt:    latest?.created_at ?? null,
        neverUpdated: !latest,
      })
    }
  }

  const areaData: AreaInsightData[] = Object.entries(areaMap).map(([areaName, d]) => ({
    areaName, krs: d.krs, recentUpdates: d.recentUpdates,
  }))

  const areasPayload = Object.entries(areaMap).map(([areaName, d]) => ({
    areaName,
    krs:              d.krs,
    recentUpdates:    d.recentUpdates,
    krDetails:        d.krDetails,
    companyObjectives: Array.from(d.companyObjectives),
  }))

  // --- Build metrics context string (all historical data, grouped by month) ---
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  // Group all rows by "Month Year"
  const byPeriod = new Map<string, typeof metricsRaw>()
  for (const row of metricsRaw ?? []) {
    const key = `${MONTH_NAMES[row.month - 1]} ${row.year}`
    if (!byPeriod.has(key)) byPeriod.set(key, [])
    byPeriod.get(key)!.push(row)
  }

  const metricsContext = byPeriod.size === 0
    ? 'Business Metrics: no data entered yet.'
    : Array.from(byPeriod.entries()).map(([period, rows]) => {
        const lines = METRIC_DEFINITIONS
          .map(def => {
            const row = (rows ?? []).find(r => r.metric_name === def.name)
            if (!row || row.value === null) return null
            return `  ${def.name}: ${formatMetricValue(row.value, def.format)}`
          })
          .filter(Boolean)
          .join('\n')
        return lines ? `${period}:\n${lines}` : null
      })
      .filter(Boolean)
      .join('\n\n')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF5A70] to-[#4A268C] bg-clip-text text-transparent">
          Executive View
        </h1>
        <p className="text-white/50 mt-1">
          Q{quarter} {year} · OKR health, risks, and leadership check-in questions
        </p>
      </div>

      <ExecutiveClient
        insights={insights}
        areaData={areaData}
        areasPayload={areasPayload}
        areas={areas ?? []}
        quarter={quarter}
        year={year}
        metricsContext={metricsContext}
        documents={documents ?? []}
        isAdmin={profile?.role === 'admin'}
      />
    </div>
  )
}
