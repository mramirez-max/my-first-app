import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentQuarter, quarterLabel } from '@/types'
import CompanyOKRsClient from './CompanyOKRsClient'
import QuarterSelector from '@/components/layout/QuarterSelector'

export default async function CompanyOKRsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; y?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarter()
  const params = await searchParams
  const quarter = params.q ? parseInt(params.q) : currentQuarter
  const year = params.y ? parseInt(params.y) : currentYear
  const isCurrentQuarter = quarter === currentQuarter && year === currentYear

  const [{ data: profile }, { data: objectives }, { data: areaObjectives }] = await Promise.all([
    supabase.from('profiles').select('*, area:areas(*)').eq('id', user.id).single(),
    supabase
      .from('company_objectives')
      .select('id, title, quarter, year, created_at, created_by')
      .eq('quarter', quarter)
      .eq('year', year)
      .order('created_at'),
    supabase
      .from('area_objectives')
      .select(`
        *,
        area:areas(id, name),
        key_results:area_key_results(
          id, description, target_value, current_value, unit,
          updates:area_kr_updates(confidence_score, week_date)
        )
      `)
      .eq('quarter', quarter)
      .eq('year', year)
      .not('aligned_to', 'is', null),
  ])

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#FF5A70] uppercase tracking-widest mb-1">
            {quarterLabel(quarter, year)}
          </p>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF5A70] to-[#4A268C] bg-clip-text text-transparent">
            Company OKRs
          </h1>
          <p className="text-white/50 mt-1">
            Strategic objectives and how each area is contributing
          </p>
        </div>
        <QuarterSelector
          currentQuarter={currentQuarter}
          currentYear={currentYear}
          selectedQuarter={quarter}
          selectedYear={year}
        />
      </div>

      <CompanyOKRsClient
        objectives={objectives ?? []}
        areaObjectives={areaObjectives ?? []}
        profile={profile}
        quarter={quarter}
        year={year}
        isCurrentQuarter={isCurrentQuarter}
      />
    </div>
  )
}
