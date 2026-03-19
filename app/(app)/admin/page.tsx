import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminClient from './AdminClient'
import { getCurrentQuarter } from '@/types'

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

  const [{ data: profiles }, { data: areas }, { data: companyObjectives }, { data: { users } }] = await Promise.all([
    supabase.from('profiles').select('*, area:areas(name)').order('full_name'),
    supabase.from('areas').select('*').order('name'),
    supabase
      .from('company_objectives')
      .select('id, title, quarter, year, created_at, created_by')
      .eq('quarter', quarter)
      .eq('year', year)
      .order('created_at'),
    admin.auth.admin.listUsers(),
  ])

  // Merge emails into profiles
  const emailMap = Object.fromEntries((users ?? []).map(u => [u.id, u.email]))
  const profilesWithEmail = (profiles ?? []).map(p => ({ ...p, email: emailMap[p.id] ?? null }))

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
      />
    </div>
  )
}
