'use client'

import { useState } from 'react'
import { Area, AreaObjective, CompanyObjective, Profile } from '@/types'
import OKRCard from '@/components/okr/OKRCard'
import { Button } from '@/components/ui/button'
import { PlusCircle, Sparkles, Wand2, AlertCircle, FileSpreadsheet, History } from 'lucide-react'
import ObjectiveDialog from '@/components/okr/ObjectiveDialog'
import AIUpdateModal from '@/components/okr/AIUpdateModal'
import AISetupModal from '@/components/okr/AISetupModal'
import { useRouter } from 'next/navigation'

interface AreaOKRsClientProps {
  objectives: AreaObjective[]
  profile: Profile
  area: Area
  companyObjectives: Pick<CompanyObjective, 'id' | 'title'>[]
  quarter: number
  year: number
  isCurrentQuarter: boolean
  isPastQuarter?: boolean
}

export default function AreaOKRsClient({
  objectives,
  profile,
  area,
  companyObjectives,
  quarter,
  year,
  isCurrentQuarter,
  isPastQuarter = false,
}: AreaOKRsClientProps) {
  const [showObjectiveDialog, setShowObjectiveDialog] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showAISetupModal, setShowAISetupModal] = useState(false)
  const [adminPastConfirmed, setAdminPastConfirmed] = useState(false)
  const router = useRouter()

  const isAdmin = profile?.role === 'admin'
  // Admins can edit past quarters after confirming
  const effectivelyEditable = isCurrentQuarter || (isPastQuarter && isAdmin && adminPastConfirmed)

  function handleRefresh() {
    router.refresh()
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx')

    // Header row
    const headers = [
      'Objective',
      'Key Result',
      'Target',
      'Current Value',
      'Confidence (1–5)',
      'What happened this week?',
      'Blockers / Dependencies',
    ]

    // One row per KR
    const rows: string[][] = []
    objectives.forEach(obj => {
      const krs = obj.key_results ?? []
      krs.forEach(kr => {
        const unitStr = kr.unit ? ` ${kr.unit}` : ''
        rows.push([
          obj.title,
          kr.description,
          `${kr.target_value}${unitStr}`,
          '',  // Current Value — to be filled
          '',  // Confidence — to be filled
          '',  // What happened — to be filled
          '',  // Blockers — to be filled
        ])
      })
    })

    const wsData = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Column widths
    ws['!cols'] = [
      { wch: 40 }, // Objective
      { wch: 45 }, // Key Result
      { wch: 16 }, // Target
      { wch: 18 }, // Current Value
      { wch: 20 }, // Confidence
      { wch: 45 }, // What happened
      { wch: 35 }, // Blockers
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Q${quarter} ${year}`)

    XLSX.writeFile(wb, `${area.name.replace(/ /g, '-')}-OKR-Template-Q${quarter}-${year}.xlsx`)
  }

  const canAddObjective = effectivelyEditable && (
    profile?.role === 'admin' ||
    (profile?.role === 'area_lead' && profile.area_id === area.id)
  )

  const canUpdate = effectivelyEditable && (
    profile?.role === 'admin' ||
    profile?.role === 'area_lead' ||
    (profile?.role === 'team_member' && profile.area_id === area.id)
  )

  const hasKRs = objectives.some(obj => (obj.key_results ?? []).length > 0)
  const noCompanyObjectives = companyObjectives.length === 0

  return (
    <div className="space-y-6">

      {/* Past quarter banners */}
      {isPastQuarter && !isAdmin && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-gradient-to-r from-[#1c1540] to-[#23174B] px-4 py-2.5">
          <AlertCircle size={14} className="text-white/40 shrink-0" />
          <p className="text-xs text-white/50">Past quarter — read-only view</p>
        </div>
      )}
      {isPastQuarter && isAdmin && !adminPastConfirmed && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <History size={14} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              <span className="font-medium">Q{quarter} {year} is a past quarter.</span> Updates here will be retroactive. Are you sure you want to edit?
            </p>
          </div>
          <Button size="sm" onClick={() => setAdminPastConfirmed(true)}
            className="shrink-0 bg-amber-400/15 text-amber-300 border border-amber-400/30 hover:bg-amber-400/25 text-xs h-7 px-3">
            Yes, let me edit
          </Button>
        </div>
      )}
      {isPastQuarter && isAdmin && adminPastConfirmed && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
          <History size={14} className="text-amber-400/60 shrink-0" />
          <p className="text-xs text-amber-400/60">Editing past quarter Q{quarter} {year} — changes are retroactive</p>
        </div>
      )}

      {/* Action buttons row */}
      {(canAddObjective || hasKRs) && (
        <div className="flex items-center justify-end gap-2">
          {hasKRs && (
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="gap-2 border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
            >
              <FileSpreadsheet size={15} />
              Download Template
            </Button>
          )}
          {canAddObjective && (
            <Button
              onClick={() => setShowAISetupModal(true)}
              className="gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
            >
              <Wand2 size={15} />
              Generate OKRs with AI
            </Button>
          )}
          {canUpdate && hasKRs && (
            <Button
              onClick={() => setShowAIModal(true)}
              className="gap-2 bg-[#4A268C] hover:bg-[#3d1f77] text-white"
            >
              <Sparkles size={15} />
              AI Weekly Update
            </Button>
          )}
        </div>
      )}

      {/* Guided empty state — current quarter, can edit, no objectives yet */}
      {objectives.length === 0 && canAddObjective && (
        <div className="rounded-2xl border border-dashed border-white/20 bg-gradient-to-br from-[#1c1540] to-[#291960] p-10 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[#FF5A70]/10 flex items-center justify-center mx-auto">
            <Wand2 size={24} className="text-[#FF5A70]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Set up {area.name} OKRs</h3>
            <p className="text-sm text-white/50 max-w-sm mx-auto">
              Define what your team will focus on this quarter. You can describe your goals in plain text and let AI structure them for you.
            </p>
          </div>

          {noCompanyObjectives && (
            <p className="text-xs text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 inline-block">
              No company objectives have been set yet — you can still add your OKRs and align them later.
            </p>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={() => setShowAISetupModal(true)}
              className="gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white px-6"
            >
              <Wand2 size={15} />
              Generate with AI
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowObjectiveDialog(true)}
              className="gap-2 border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
            >
              <PlusCircle size={15} />
              Add manually
            </Button>
          </div>
        </div>
      )}

      {/* Past quarter empty state */}
      {objectives.length === 0 && !canAddObjective && (
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-8 text-center">
          <p className="text-sm text-white/40">No OKRs were recorded for this quarter.</p>
        </div>
      )}

      {/* Objectives */}
      {objectives.map(obj => (
        <OKRCard
          key={obj.id}
          objective={obj}
          type="area"
          profile={profile}
          companyObjectives={companyObjectives as CompanyObjective[]}
          onRefresh={handleRefresh}
          isCurrentQuarter={effectivelyEditable}
        />
      ))}

      {/* Add manually button — shown when objectives already exist */}
      {canAddObjective && objectives.length > 0 && (
        <Button
          variant="outline"
          className="gap-2 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
          onClick={() => setShowObjectiveDialog(true)}
        >
          <PlusCircle size={16} />
          Add Objective
        </Button>
      )}

      <ObjectiveDialog
        open={showObjectiveDialog}
        onClose={() => setShowObjectiveDialog(false)}
        type="area"
        companyObjectives={companyObjectives as CompanyObjective[]}
        areaId={area.id}
        onSuccess={handleRefresh}
      />

      <AIUpdateModal
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        areaName={area.name}
        areaId={area.id}
        objectives={objectives}
        companyObjectives={companyObjectives}
        onSuccess={handleRefresh}
      />

      <AISetupModal
        open={showAISetupModal}
        onClose={() => setShowAISetupModal(false)}
        areaId={area.id}
        areaName={area.name}
        companyObjectives={companyObjectives}
        quarter={quarter}
        year={year}
        onSuccess={handleRefresh}
      />
    </div>
  )
}
