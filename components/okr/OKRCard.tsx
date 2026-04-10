'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AreaObjective, CompanyObjective, AreaKeyResult, CompanyKeyResult, calcProgress, Profile } from '@/types'
import KeyResultRow from './KeyResultRow'
import { PlusCircle, Pencil, Trash2 } from 'lucide-react'
import KRDialog from './KRDialog'
import ObjectiveDialog from './ObjectiveDialog'
import { createClient } from '@/lib/supabase/client'

interface OKRCardProps {
  objective: AreaObjective | CompanyObjective
  type: 'area' | 'company' | 'team'
  profile: Profile
  companyObjectives?: CompanyObjective[]
  onRefresh: () => void
  isCurrentQuarter?: boolean
}

function isAreaObjective(obj: AreaObjective | CompanyObjective): obj is AreaObjective {
  return 'area_id' in obj
}

export default function OKRCard({ objective, type, profile, companyObjectives, onRefresh, isCurrentQuarter = true }: OKRCardProps) {
  const supabase = createClient()
  const [showKRDialog, setShowKRDialog] = useState(false)
  const [showObjDialog, setShowObjDialog] = useState(false)
  const [editingKR, setEditingKR] = useState<AreaKeyResult | CompanyKeyResult | undefined>(undefined)
  const [deletingObj, setDeletingObj] = useState(false)

  async function handleDeleteObjective() {
    if (!confirm('Delete this objective and all its key results? This cannot be undone.')) return
    setDeletingObj(true)
    const table = type === 'area' ? 'area_objectives' : type === 'team' ? 'team_objectives' : 'company_objectives'
    await supabase.from(table).delete().eq('id', objective.id)
    setDeletingObj(false)
    onRefresh()
  }

  const krs = objective.key_results ?? []
  const totalProgress = krs.length > 0
    ? Math.round(krs.reduce((sum, kr) => sum + calcProgress(kr.current_value, kr.target_value), 0) / krs.length)
    : 0

  const canEdit = isCurrentQuarter && (
    profile.role === 'admin' ||
    (profile.role === 'area_lead' && (type === 'area' || type === 'team') && isAreaObjective(objective) && objective.area_id === profile.area_id)
  )

  const canUpdate = isCurrentQuarter && (canEdit || (
    profile.role === 'team_member' && (type === 'area' || type === 'team') &&
    isAreaObjective(objective) && objective.area_id === profile.area_id
  ))

  const alignedObj = isAreaObjective(objective) && objective.aligned_objective
    ? objective.aligned_objective
    : null

  return (
    <Card className="w-full bg-[#140e2e] border-white/8">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-xs border-white/15 text-white/60">
                {totalProgress}% complete
              </Badge>
              {alignedObj && (
                <Badge variant="secondary" className="text-xs max-w-xs truncate bg-white/8 text-white/70">
                  Aligned: {alignedObj.title}
                </Badge>
              )}
            </div>
            <h3 className="text-base font-semibold text-white leading-snug">
              {objective.title}
            </h3>
          </div>
          {canEdit && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setShowObjDialog(true)} className="text-white/50 hover:text-white hover:bg-white/6">
                <Pencil size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteObjective}
                disabled={deletingObj}
                className="text-white/50 hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
                onClick={() => setShowKRDialog(true)}
              >
                <PlusCircle size={12} />
                Add KR
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {krs.length === 0 ? (
          <p className="text-sm text-white/40 italic">No key results yet.</p>
        ) : (
          krs.map(kr => (
            <KeyResultRow
              key={kr.id}
              keyResult={kr}
              type={type}
              canUpdate={canUpdate}
              canEdit={canEdit}
              onEdit={() => { setEditingKR(kr); setShowKRDialog(true) }}
              onDeleted={onRefresh}
            />
          ))
        )}
      </CardContent>

      <KRDialog
        open={showKRDialog}
        onClose={() => { setShowKRDialog(false); setEditingKR(undefined) }}
        objectiveId={objective.id}
        type={type}
        existing={editingKR}
        onSuccess={onRefresh}
      />

      <ObjectiveDialog
        open={showObjDialog}
        onClose={() => setShowObjDialog(false)}
        type={type}
        existing={objective}
        companyObjectives={companyObjectives}
        areaId={isAreaObjective(objective) ? objective.area_id : undefined}
        onSuccess={onRefresh}
      />
    </Card>
  )
}
