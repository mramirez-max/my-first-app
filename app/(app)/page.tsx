import { createClient } from '@/lib/supabase/server'
import { getCurrentQuarter, quarterLabel } from '@/types'
import CompanyOKRSummary from '@/components/dashboard/CompanyOKRSummary'
import AreaGrid from '@/components/dashboard/AreaGrid'
import QuarterSelector from '@/components/layout/QuarterSelector'
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; y?: string }>
}) {
  const supabase = await createClient()
  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarter()
  const params = await searchParams
  const quarter = params.q ? parseInt(params.q) : currentQuarter
  const year = params.y ? parseInt(params.y) : currentYear
  const isCurrentQuarter = quarter === currentQuarter && year === currentYear

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  // Fetch company objectives
  const { data: objectives } = await supabase
    .from('company_objectives')
    .select('id, title, quarter, year, created_at')
    .eq('quarter', quarter)
    .eq('year', year)
    .order('created_at')

  // Fetch all areas
  const { data: areas } = await supabase
    .from('areas')
    .select('*')
    .order('name')

  // Fetch area objectives with alignment + KR ids
  const { data: areaObjData } = await supabase
    .from('area_objectives')
    .select('id, area_id, aligned_to, key_results:area_key_results(id)')
    .eq('quarter', quarter)
    .eq('year', year)

  // Fetch latest updates per KR for confidence
  const allKRIds = areaObjData?.flatMap(obj =>
    (obj.key_results as { id: string }[]).map(kr => kr.id)
  ) ?? []

  let krConfidence: Record<string, number> = {}
  if (allKRIds.length > 0) {
    const { data: updates } = await supabase
      .from('area_kr_updates')
      .select('key_result_id, confidence_score, week_date')
      .in('key_result_id', allKRIds)
      .order('week_date', { ascending: false })

    const seenKRs = new Set<string>()
    for (const u of updates ?? []) {
      if (!seenKRs.has(u.key_result_id)) {
        seenKRs.add(u.key_result_id)
        krConfidence[u.key_result_id] = u.confidence_score
      }
    }
  }

  // Per-area health
  const areaObjectiveMap: Record<string, { krIds: string[] }[]> = {}
  for (const obj of areaObjData ?? []) {
    if (!areaObjectiveMap[obj.area_id]) areaObjectiveMap[obj.area_id] = []
    areaObjectiveMap[obj.area_id].push({
      krIds: (obj.key_results as { id: string }[]).map(kr => kr.id),
    })
  }

  const areaHealthData = (areas ?? []).map(area => {
    const areaObjs = areaObjectiveMap[area.id] ?? []
    const krIds = areaObjs.flatMap(o => o.krIds)
    const confidences = krIds.map(id => krConfidence[id]).filter(Boolean)
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null
    return { area, avgConfidence, objectiveCount: areaObjs.length }
  })

  // Contributing area count per company objective
  const areaCountByObjective: Record<string, number> = {}
  for (const ao of areaObjData ?? []) {
    if (ao.aligned_to) {
      areaCountByObjective[ao.aligned_to] = (areaCountByObjective[ao.aligned_to] ?? 0) + 1
    }
  }

  // Admin setup checklist data
  const areasWithOKRs = areaHealthData.filter(a => a.objectiveCount > 0).length
  const areasWithUpdates = areaHealthData.filter(a => a.avgConfidence !== null).length
  const setupComplete =
    (objectives?.length ?? 0) > 0 && areasWithOKRs >= 3 && areasWithUpdates >= 3

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF5A70] to-[#4A268C] bg-clip-text text-transparent">
            OKR Dashboard
          </h1>
          <p className="text-white/50 mt-1">Company-wide progress at a glance</p>
        </div>
        <QuarterSelector
          currentQuarter={currentQuarter}
          currentYear={currentYear}
          selectedQuarter={quarter}
          selectedYear={year}
        />
      </div>

      {/* Admin setup checklist — only current quarter, only when incomplete */}
      {isAdmin && isCurrentQuarter && !setupComplete && (
        <div className="rounded-xl border border-white/10 bg-gradient-to-r from-[#1c1540] to-[#291960] p-5">
          <p className="text-sm font-semibold text-white mb-1">Quarter Setup</p>
          <p className="text-xs text-white/50 mb-4">Complete these steps to get {quarterLabel(quarter, year)} running</p>
          <div className="space-y-2">
            {[
              {
                done: (objectives?.length ?? 0) > 0,
                label: 'Define company objectives',
                hint: 'Go to Company OKRs → Add Objective',
              },
              {
                done: areasWithOKRs >= 3,
                label: `Area teams set their OKRs (${areasWithOKRs}/10 areas done)`,
                hint: 'Each area lead generates or adds their objectives',
              },
              {
                done: areasWithUpdates >= 3,
                label: 'First weekly updates submitted',
                hint: 'Area leads submit their first KR update',
              },
            ].map(({ done, label, hint }) => (
              <div key={label} className="flex items-start gap-3">
                {done
                  ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  : <Circle size={16} className="text-white/20 shrink-0 mt-0.5" />}
                <div>
                  <p className={`text-sm ${done ? 'text-white/50 line-through' : 'text-white/80'}`}>{label}</p>
                  {!done && <p className="text-xs text-white/30 mt-0.5">{hint}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past quarter banner */}
      {!isCurrentQuarter && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-gradient-to-r from-[#1c1540] to-[#23174B] px-4 py-2.5">
          <AlertCircle size={14} className="text-white/40 shrink-0" />
          <p className="text-xs text-white/50">
            You're viewing <span className="text-white/70 font-medium">{quarterLabel(quarter, year)}</span> — read-only
          </p>
        </div>
      )}

      {/* Company OKRs */}
      <section>
        <h2 className="text-lg font-semibold text-white/80 mb-4">Company Objectives</h2>
        {objectives && objectives.length > 0 ? (
          <CompanyOKRSummary objectives={objectives} areaCountByObjective={areaCountByObjective} />
        ) : (
          <p className="text-sm text-white/40">No company objectives for {quarterLabel(quarter, year)} yet.</p>
        )}
      </section>

      {/* Area Health Grid */}
      <section>
        <h2 className="text-lg font-semibold text-white/80 mb-4">Area Health</h2>
        <AreaGrid areaHealthData={areaHealthData} />
      </section>
    </div>
  )
}
