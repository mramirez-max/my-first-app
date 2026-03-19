import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, area:areas(*)')
    .eq('id', user.id)
    .single()

  const { data: areas } = await supabase
    .from('areas')
    .select('*')
    .order('name')

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar profile={profile} areas={areas ?? []} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
