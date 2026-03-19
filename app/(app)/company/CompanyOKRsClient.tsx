'use client'

import { useState } from 'react'
import { CompanyObjective, AreaObjective, Profile } from '@/types'
import { Button } from '@/components/ui/button'
import { PlusCircle, Target } from 'lucide-react'
import ObjectiveDialog from '@/components/okr/ObjectiveDialog'
import { useRouter } from 'next/navigation'
import CascadeObjectiveCard from '@/components/okr/CascadeObjectiveCard'

interface CompanyOKRsClientProps {
  objectives: CompanyObjective[]
  areaObjectives: AreaObjective[]
  profile: Profile
  quarter: number
  year: number
  isCurrentQuarter: boolean
}

export default function CompanyOKRsClient({
  objectives,
  areaObjectives,
  profile,
  quarter,
  year,
  isCurrentQuarter,
}: CompanyOKRsClientProps) {
  const [showDialog, setShowDialog] = useState(false)
  const router = useRouter()

  function handleRefresh() {
    router.refresh()
  }

  const areaObjByCompanyObj = areaObjectives.reduce<Record<string, AreaObjective[]>>((acc, ao) => {
    if (!ao.aligned_to) return acc
    if (!acc[ao.aligned_to]) acc[ao.aligned_to] = []
    acc[ao.aligned_to].push(ao)
    return acc
  }, {})

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-8">

      {/* Empty state for admins on current quarter */}
      {objectives.length === 0 && isAdmin && isCurrentQuarter && (
        <div className="rounded-2xl border border-dashed border-white/20 bg-gradient-to-br from-[#1c1540] to-[#291960] p-10 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[#FF5A70]/10 flex items-center justify-center mx-auto">
            <Target size={24} className="text-[#FF5A70]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Define this quarter's company objectives</h3>
            <p className="text-sm text-white/50 max-w-sm mx-auto">
              Start by setting 2–3 strategic objectives. Area teams will then align their own OKRs to these.
            </p>
          </div>
          <Button
            onClick={() => setShowDialog(true)}
            className="gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white px-6"
          >
            <PlusCircle size={15} />
            Add Company Objective
          </Button>
        </div>
      )}

      {/* Empty state for non-admins or past quarters */}
      {objectives.length === 0 && (!isAdmin || !isCurrentQuarter) && (
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-8 text-center">
          <p className="text-sm text-white/40">No company objectives for this quarter yet.</p>
        </div>
      )}

      {objectives.map((obj, i) => (
        <CascadeObjectiveCard
          key={obj.id}
          objective={obj}
          index={i}
          alignedAreaObjectives={areaObjByCompanyObj[obj.id] ?? []}
          profile={profile}
          onRefresh={handleRefresh}
          isCurrentQuarter={isCurrentQuarter}
        />
      ))}

      {isAdmin && isCurrentQuarter && objectives.length > 0 && (
        <Button
          variant="outline"
          className="gap-2 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
          onClick={() => setShowDialog(true)}
        >
          <PlusCircle size={16} />
          Add Company Objective
        </Button>
      )}

      <ObjectiveDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        type="company"
        onSuccess={handleRefresh}
      />
    </div>
  )
}
