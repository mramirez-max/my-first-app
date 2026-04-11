import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function MyTeamRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('area_id')
    .eq('id', user.id)
    .single()

  if (profile?.area_id) {
    redirect(`/team/${profile.area_id}`)
  }

  redirect('/')
}
