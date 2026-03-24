'use client'

import { useState } from 'react'
import { Area, AreaObjective, CompanyObjective, Profile } from '@/types'
import OKRCard from '@/components/okr/OKRCard'
import { Button } from '@/components/ui/button'
import { PlusCircle, Sparkles, Wand2, AlertCircle, Download } from 'lucide-react'
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
}

export default function AreaOKRsClient({
  objectives,
  profile,
  area,
  companyObjectives,
  quarter,
  year,
  isCurrentQuarter,
}: AreaOKRsClientProps) {
  const [showObjectiveDialog, setShowObjectiveDialog] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showAISetupModal, setShowAISetupModal] = useState(false)
  const router = useRouter()

  function handleRefresh() {
    router.refresh()
  }

  async function downloadTemplate() {
    const { Document, Packer, Paragraph, TextRun } = await import('docx')

    const LINE = '_______________________________________________'
    const LONG_LINE = '________________________________________________________________'

    const children: InstanceType<typeof Paragraph>[] = []

    const gap = (after = 160) => new Paragraph({ children: [new TextRun('')], spacing: { after } })
    const rule = () => new Paragraph({
      children: [new TextRun({ text: '─'.repeat(68), color: 'CCCCCC', size: 18 })],
      spacing: { before: 80, after: 200 },
    })

    // ── Header ──────────────────────────────────────────────
    children.push(new Paragraph({
      children: [new TextRun({ text: `${area.name}`, bold: true, size: 52, color: '1a1040' })],
      spacing: { after: 60 },
    }))
    children.push(new Paragraph({
      children: [new TextRun({ text: `Weekly OKR Update  ·  Q${quarter} ${year}`, size: 26, color: '888888' })],
      spacing: { after: 280 },
    }))

    // ── Fill-in header fields ────────────────────────────────
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'Week of:        ', bold: true, size: 22 }),
        new TextRun({ text: LINE, size: 22, color: 'AAAAAA' }),
      ],
      spacing: { after: 120 },
    }))
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'Reported by:  ', bold: true, size: 22 }),
        new TextRun({ text: LINE, size: 22, color: 'AAAAAA' }),
      ],
      spacing: { after: 320 },
    }))

    // ── Instructions ─────────────────────────────────────────
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'Instructions: Fill in every section below. Confidence score: 1 = Off track  |  2 = At risk  |  3 = Cautious  |  4 = Good  |  5 = On track. When done, save as PDF and upload via "AI Weekly Update" in the app.',
        italics: true, size: 18, color: '777777',
      })],
      spacing: { after: 320 },
    }))

    children.push(rule())

    // ── Objectives & KRs ─────────────────────────────────────
    objectives.forEach((obj, objIdx) => {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `OBJECTIVE ${objIdx + 1}:  ${obj.title}`,
          bold: true, size: 30, color: '1a1040',
        })],
        spacing: { before: 160, after: 100 },
      }))

      if (obj.aligned_objective?.title) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: `↳ Aligned to company objective: ${obj.aligned_objective.title}`,
            italics: true, size: 19, color: 'FF5A70',
          })],
          spacing: { after: 200 },
        }))
      }

      const krs = obj.key_results ?? []
      krs.forEach((kr, krIdx) => {
        const unitStr = kr.unit ? ` ${kr.unit}` : ''

        children.push(new Paragraph({
          children: [new TextRun({
            text: `KR ${objIdx + 1}.${krIdx + 1}  —  ${kr.description}`,
            bold: true, size: 23,
          })],
          spacing: { before: 240, after: 140 },
        }))

        // Current value
        children.push(new Paragraph({
          children: [
            new TextRun({ text: 'Current value:', bold: true, size: 21 }),
            new TextRun({ text: `   ________   /  ${kr.target_value}${unitStr}`, size: 21 }),
          ],
          spacing: { after: 100 },
        }))

        // Confidence
        children.push(new Paragraph({
          children: [
            new TextRun({ text: 'Confidence (1–5):', bold: true, size: 21 }),
            new TextRun({ text: '   ________', size: 21 }),
          ],
          spacing: { after: 180 },
        }))

        // Weekly update
        children.push(new Paragraph({
          children: [new TextRun({ text: 'What happened this week? (2–4 sentences)', bold: true, size: 21 })],
          spacing: { after: 80 },
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: LONG_LINE, size: 21, color: 'CCCCCC' })],
          spacing: { after: 80 },
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: LONG_LINE, size: 21, color: 'CCCCCC' })],
          spacing: { after: 80 },
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: LONG_LINE, size: 21, color: 'CCCCCC' })],
          spacing: { after: 160 },
        }))

        // Blockers
        children.push(new Paragraph({
          children: [new TextRun({ text: 'Key blockers or dependencies', bold: true, size: 21 })],
          spacing: { after: 80 },
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: LONG_LINE, size: 21, color: 'CCCCCC' })],
          spacing: { after: 80 },
        }))
        children.push(gap(200))
      })

      if (objIdx < objectives.length - 1) children.push(rule())
    })

    // ── Footer ───────────────────────────────────────────────
    children.push(rule())
    children.push(new Paragraph({
      children: [new TextRun({
        text: `Generated by Ontop OKR System  ·  Q${quarter} ${year}  ·  ${area.name}`,
        size: 16, color: 'BBBBBB', italics: true,
      })],
    }))

    const doc = new Document({ sections: [{ children }] })
    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${area.name.replace(/ /g, '-')}-OKR-Template-Q${quarter}-${year}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const canAddObjective = isCurrentQuarter && (
    profile?.role === 'admin' ||
    (profile?.role === 'area_lead' && profile.area_id === area.id)
  )

  const canUpdate = isCurrentQuarter && (
    profile?.role === 'admin' ||
    profile?.role === 'area_lead' ||
    (profile?.role === 'team_member' && profile.area_id === area.id)
  )

  const hasKRs = objectives.some(obj => (obj.key_results ?? []).length > 0)
  const noCompanyObjectives = companyObjectives.length === 0

  return (
    <div className="space-y-6">

      {/* Past quarter read-only banner */}
      {!isCurrentQuarter && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-gradient-to-r from-[#1c1540] to-[#23174B] px-4 py-2.5">
          <AlertCircle size={14} className="text-white/40 shrink-0" />
          <p className="text-xs text-white/50">Past quarter — read-only view</p>
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
              <Download size={15} />
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
          isCurrentQuarter={isCurrentQuarter}
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
        objectives={objectives}
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
