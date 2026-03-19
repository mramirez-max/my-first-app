'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getCurrentQuarter } from '@/types'
import { useRouter } from 'next/navigation'

const COMPANY_OBJECTIVES = [
  'Scale the Borderless Workforce Ecosystem to 25K+ Workers & $27.2M ARR',
  'Become a Full-Stack Financial Infrastructure Company',
  'Deliver the World\'s Best Borderless Work Experience Through AI-Powered Automation',
]

export default function SeedCompanyOKRsButton() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSeed() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { quarter, year } = getCurrentQuarter()

    // Check if already seeded
    const { data: existing } = await supabase
      .from('company_objectives')
      .select('id')
      .eq('quarter', quarter)
      .eq('year', year)

    if (existing && existing.length > 0) {
      alert('Company objectives already exist for this quarter.')
      setLoading(false)
      return
    }

    for (const title of COMPANY_OBJECTIVES) {
      await supabase.from('company_objectives').insert({
        title,
        quarter,
        year,
        created_by: user.id,
      })
    }

    setLoading(false)
    setDone(true)
    router.refresh()
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSeed}
      disabled={loading || done}
    >
      {done ? 'Objectives Seeded!' : loading ? 'Seeding...' : 'Seed Company OKRs'}
    </Button>
  )
}
