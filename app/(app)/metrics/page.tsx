import { createClient } from '@/lib/supabase/server'
import MetricsClient from '@/components/metrics/MetricsClient'

export default async function MetricsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return <MetricsClient isAdmin={isAdmin} />
}
