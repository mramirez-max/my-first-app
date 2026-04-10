import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentQuarter } from '@/types'
import MyTeamClient from '@/components/executive/MyTeamClient'
import QuarterSelector from '@/components/layout/QuarterSelector'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function MyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; y?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, area_id, created_at')
    .eq('id', user.id)
    .single()

  // Find Operations area first so we can check membership
  const { data: operationsAreaCheck } = await supabase
    .from('areas')
    .select('id')
    .eq('name', 'Operations')
    .single()

  const isAdmin = profile?.role === 'admin'
  const isOperationsMember = profile?.area_id === operationsAreaCheck?.id
  // Only Operations area members get access (admins must also be assigned to Operations)
  if (!isOperationsMember) redirect('/')

  const { quarter: currentQ, year: currentY } = getCurrentQuarter()
  const params = await searchParams
  const quarter = params.q ? parseInt(params.q) : currentQ
  const year = params.y ? parseInt(params.y) : currentY

  const operationsArea = operationsAreaCheck
  if (!operationsArea) redirect('/executive')

  // Fetch team objectives + KRs + all updates for the quarter (independent from area_objectives)
  const { data: objectives } = await supabase
    .from('team_objectives')
    .select(`
      id, title, aligned_to, created_at,
      aligned_objective:company_objectives(id, title),
      key_results:team_key_results(
        id, description, target_value, current_value, unit,
        updates:team_kr_updates(
          id, confidence_score, current_value, update_text, week_date, created_at,
          author:profiles(full_name)
        )
      )
    `)
    .eq('area_id', operationsArea.id)
    .eq('quarter', quarter)
    .eq('year', year)
    .order('created_at')

  // Fetch company objectives for context
  const { data: companyObjectives } = await supabase
    .from('company_objectives')
    .select('id, title')
    .eq('quarter', quarter)
    .eq('year', year)

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 print:p-0 print:max-w-none">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-start gap-4">
          <Link
            href="/executive"
            className="mt-1 p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF5A70] to-[#4A268C] bg-clip-text text-transparent">
              My Team — Operations
            </h1>
            <p className="text-white/50 mt-1">
              Q{quarter} {year} · Week-over-week OKR progress
            </p>
          </div>
        </div>
        <QuarterSelector
          currentQuarter={currentQ}
          currentYear={currentY}
          selectedQuarter={quarter}
          selectedYear={year}
        />
      </div>

      <MyTeamClient
        objectives={(objectives ?? []) as unknown as Parameters<typeof MyTeamClient>[0]['objectives']}
        companyObjectives={(companyObjectives ?? []) as unknown as Parameters<typeof MyTeamClient>[0]['companyObjectives']}
        quarter={quarter}
        year={year}
        isAdmin={isAdmin}
        profile={profile as unknown as Parameters<typeof MyTeamClient>[0]['profile']}
        operationsAreaId={operationsArea.id}
      />
    </div>
  )
}
