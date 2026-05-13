import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentQuarter } from '@/types'
import MyTeamClient from '@/components/executive/MyTeamClient'
import QuarterSelector from '@/components/layout/QuarterSelector'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ areaId: string }>
  searchParams: Promise<{ q?: string; y?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { areaId } = await params

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, area_id, created_at')
    .eq('id', user.id)
    .single()

  // Fetch the area
  const { data: area } = await supabase
    .from('areas')
    .select('id, name')
    .eq('id', areaId)
    .single()

  if (!area) redirect('/')

  const isAdmin = profile?.role === 'admin'
  const isAreaMember = profile?.area_id === areaId

  // Only area members and admins who belong to this area can access
  if (!isAreaMember && !isAdmin) redirect('/')

  const { quarter: currentQ, year: currentY } = getCurrentQuarter()
  const p = await searchParams
  const quarter = p.q ? parseInt(p.q) : currentQ
  const year = p.y ? parseInt(p.y) : currentY

  // Fetch team objectives + KRs + all updates for the quarter
  const { data: objectives } = await supabase
    .from('team_objectives')
    .select(`
      id, title, area_id, aligned_to, created_at,
      aligned_objective:area_key_results(id, description),
      key_results:team_key_results(
        id, description, target_value, current_value, unit,
        updates:team_kr_updates(
          id, confidence_score, current_value, update_text, week_date, created_at,
          author:profiles(full_name)
        )
      )
    `)
    .eq('area_id', areaId)
    .eq('quarter', quarter)
    .eq('year', year)
    .order('created_at')

  // Fetch this area's objectives + their KRs as alignment options
  const { data: areaObjectivesWithKRs } = await supabase
    .from('area_objectives')
    .select('id, title, key_results:area_key_results(id, description)')
    .eq('area_id', areaId)
    .eq('quarter', quarter)
    .eq('year', year)

  // Flatten into { id, description, objectiveTitle }[]
  const areaKRs = (areaObjectivesWithKRs ?? []).flatMap(obj =>
    ((obj.key_results ?? []) as { id: string; description: string }[]).map(kr => ({
      id: kr.id,
      description: kr.description,
      objectiveTitle: obj.title,
    }))
  )

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
              My Team — {area.name}
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
        areaKRs={areaKRs}
        quarter={quarter}
        year={year}
        isAdmin={isAdmin}
        profile={profile as unknown as Parameters<typeof MyTeamClient>[0]['profile']}
        areaId={areaId}
        areaName={area.name}
      />
    </div>
  )
}
