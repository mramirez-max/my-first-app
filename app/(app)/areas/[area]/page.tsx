import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getCurrentQuarter, quarterLabel } from '@/types'
import AreaOKRsClient from './AreaOKRsClient'
import QuarterSelector from '@/components/layout/QuarterSelector'

function slugToName(slug: string): string {
  // Convert URL slug back to title case: "worker-journey" → "Worker Journey"
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default async function AreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>
  searchParams: Promise<{ q?: string; y?: string }>
}) {
  const { area: slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { quarter: currentQuarter, year: currentYear } = getCurrentQuarter()
  const sp = await searchParams
  const quarter = sp.q ? parseInt(sp.q) : currentQuarter
  const year = sp.y ? parseInt(sp.y) : currentYear
  const isFutureQuarter   = year > currentYear || (year === currentYear && quarter > currentQuarter)
  const isCurrentQuarter  = quarter === currentQuarter && year === currentYear
  const isEditable        = isCurrentQuarter || isFutureQuarter

  // Look up area by slug: try exact slug match first (e.g., stored slug), then derive from name
  const { data: allAreas } = await supabase.from('areas').select('*')
  const areaData = allAreas?.find(a =>
    a.name.toLowerCase().replace(/ /g, '-') === slug
  )
  if (!areaData) notFound()

  const areaName = areaData.name

  const [{ data: profile }, { data: companyObjectives }] = await Promise.all([
    supabase.from('profiles').select('*, area:areas(*)').eq('id', user.id).single(),
    supabase
      .from('company_objectives')
      .select('id, title')
      .eq('quarter', quarter)
      .eq('year', year),
  ])

  const { data: objectives } = await supabase
    .from('area_objectives')
    .select(`
      *,
      aligned_objective:company_objectives(id, title),
      key_results:area_key_results(
        *,
        updates:area_kr_updates(*, author:profiles(full_name))
      )
    `)
    .eq('area_id', areaData.id)
    .eq('quarter', quarter)
    .eq('year', year)
    .order('created_at')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#FF5A70] uppercase tracking-widest mb-1">
            {quarterLabel(quarter, year)}
          </p>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF5A70] to-[#4A268C] bg-clip-text text-transparent">
            {areaName}
          </h1>
          <p className="text-white/50 mt-1">OKRs for the {areaName} team</p>
        </div>
        <QuarterSelector
          currentQuarter={currentQuarter}
          currentYear={currentYear}
          selectedQuarter={quarter}
          selectedYear={year}
        />
      </div>

      <AreaOKRsClient
        objectives={objectives ?? []}
        profile={profile}
        area={areaData}
        companyObjectives={companyObjectives ?? []}
        quarter={quarter}
        year={year}
        isCurrentQuarter={isEditable}
        isPastQuarter={!isEditable}
      />
    </div>
  )
}
