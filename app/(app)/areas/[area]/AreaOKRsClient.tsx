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
    const {
      Document, Packer, Paragraph, TextRun,
      Table, TableRow, TableCell,
      WidthType, BorderStyle, AlignmentType,
    } = await import('docx')

    const F = 'Poppins'
    const RED    = 'FF5A70'
    const PURPLE = '4A268C'
    const DARK   = '1A1040'
    const MID    = '6B7280'
    const MUTED  = 'AAAAAA'
    const RULE   = 'E5E7EB'
    const PILL_BG = 'FFF1F3'   // light pink for objective pill
    const KR_BG   = 'F9F8FF'   // very light purple for KR block

    // ── Helpers ──────────────────────────────────────────────

    // Invisible border (removes default table cell borders)
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }

    // Thin bottom border for fill-in lines
    const fillBorder = { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB' }, top: noBorder, left: noBorder, right: noBorder }

    // Empty spacer paragraph
    const sp = (after = 160) => new Paragraph({ children: [new TextRun({ text: ' ', font: F, size: 18 })], spacing: { after } })

    // Thin full-width rule
    const hr = (color = RULE, after = 240) => new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color } },
      children: [new TextRun({ text: ' ', font: F, size: 4 })],
      spacing: { after },
    })

    // Label above a fill-in line
    const fieldLabel = (text: string) => new Paragraph({
      children: [new TextRun({ text, font: F, size: 17, color: MID, bold: true, allCaps: true })],
      spacing: { before: 160, after: 60 },
    })

    // Actual fill-in line (bottom border)
    const fieldLine = () => new Paragraph({
      children: [new TextRun({ text: ' ', font: F, size: 24 })],
      border: fillBorder,
      spacing: { after: 0 },
    })

    // Section label (e.g. "WHAT HAPPENED THIS WEEK")
    const sectionLabel = (text: string, after = 80) => new Paragraph({
      children: [new TextRun({ text, font: F, size: 17, color: MID, bold: true, allCaps: true })],
      spacing: { before: 200, after },
    })

    // Multiple fill-in lines
    const fillLines = (count: number, after = 120) =>
      Array.from({ length: count }, (_, i) => new Paragraph({
        children: [new TextRun({ text: ' ', font: F, size: 26 })],
        border: fillBorder,
        spacing: { after: i < count - 1 ? 100 : after },
      }))

    // ── Build document ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = []

    // ── HEADER ───────────────────────────────────────────────
    children.push(new Paragraph({
      children: [
        new TextRun({ text: area.name, font: F, size: 56, bold: true, color: DARK }),
      ],
      spacing: { after: 80 },
    }))
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'Weekly OKR Update', font: F, size: 26, color: RED }),
        new TextRun({ text: `   ·   Q${quarter} ${year}`, font: F, size: 26, color: MUTED }),
      ],
      spacing: { after: 320 },
    }))

    // ── META FIELDS (two-column table) ───────────────────────
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: 'fixed' as never,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              margins: { right: 400 },
              children: [
                fieldLabel('Week of'),
                fieldLine(),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [
                fieldLabel('Reported by'),
                fieldLine(),
              ],
            }),
          ],
        }),
      ],
    }))

    children.push(sp(320))
    children.push(hr(RULE, 320))

    // ── INSTRUCTIONS ─────────────────────────────────────────
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'How to fill this in: ', font: F, size: 18, bold: true, color: PURPLE }),
        new TextRun({
          text: 'Complete every field for each key result. For confidence, use: 1 = Off track  ·  2 = At risk  ·  3 = Cautious  ·  4 = Good  ·  5 = On track. Save as PDF when done and upload via ',
          font: F, size: 18, color: MID,
        }),
        new TextRun({ text: 'AI Weekly Update', font: F, size: 18, bold: true, color: PURPLE }),
        new TextRun({ text: ' in the app.', font: F, size: 18, color: MID }),
      ],
      spacing: { after: 400 },
    }))

    // ── OBJECTIVES & KRs ─────────────────────────────────────
    objectives.forEach((obj, objIdx) => {

      // Objective pill header
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `OBJECTIVE ${objIdx + 1}`, font: F, size: 17, bold: true, color: RED, allCaps: true }),
          new TextRun({ text: '   ', font: F, size: 17 }),
        ],
        spacing: { before: 80, after: 100 },
        shading: { type: 'clear' as never, fill: PILL_BG },
        border: {
          left: { style: BorderStyle.SINGLE, size: 16, color: RED },
          top: noBorder, bottom: noBorder, right: noBorder,
        },
        indent: { left: 160 },
      }))
      children.push(new Paragraph({
        children: [new TextRun({ text: obj.title, font: F, size: 28, bold: true, color: DARK })],
        indent: { left: 180 },
        spacing: { after: 80 },
        shading: { type: 'clear' as never, fill: PILL_BG },
        border: {
          left: { style: BorderStyle.SINGLE, size: 16, color: RED },
          top: noBorder, bottom: noBorder, right: noBorder,
        },
      }))

      if (obj.aligned_objective?.title) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: '↳ Aligned to: ', font: F, size: 18, color: MUTED }),
            new TextRun({ text: obj.aligned_objective.title, font: F, size: 18, color: PURPLE, italics: true }),
          ],
          indent: { left: 180 },
          spacing: { before: 60, after: 0 },
          shading: { type: 'clear' as never, fill: PILL_BG },
          border: {
            left: { style: BorderStyle.SINGLE, size: 16, color: RED },
            top: noBorder, bottom: noBorder, right: noBorder,
          },
        }))
      }

      children.push(sp(240))

      const krs = obj.key_results ?? []
      krs.forEach((kr, krIdx) => {
        const unitStr = kr.unit ? ` ${kr.unit}` : ''

        // KR number badge + description
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `KR ${objIdx + 1}.${krIdx + 1}`, font: F, size: 18, bold: true, color: PURPLE, allCaps: true }),
          ],
          spacing: { before: 80, after: 60 },
          shading: { type: 'clear' as never, fill: KR_BG },
          border: {
            left: { style: BorderStyle.SINGLE, size: 10, color: PURPLE },
            top: noBorder, bottom: noBorder, right: noBorder,
          },
          indent: { left: 160 },
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: kr.description, font: F, size: 23, bold: true, color: DARK })],
          indent: { left: 180 },
          shading: { type: 'clear' as never, fill: KR_BG },
          border: {
            left: { style: BorderStyle.SINGLE, size: 10, color: PURPLE },
            top: noBorder, bottom: noBorder, right: noBorder,
          },
          spacing: { after: 60 },
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: `Target: ${kr.target_value}${unitStr}`, font: F, size: 18, color: MUTED })],
          indent: { left: 180 },
          shading: { type: 'clear' as never, fill: KR_BG },
          border: {
            left: { style: BorderStyle.SINGLE, size: 10, color: PURPLE },
            top: noBorder, bottom: noBorder, right: noBorder,
          },
          spacing: { after: 0 },
        }))

        children.push(sp(200))

        // Current value + Confidence (two-column)
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: 'fixed' as never,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: noBorders,
                  margins: { right: 400 },
                  children: [
                    fieldLabel(`Current value  /  target: ${kr.target_value}${unitStr}`),
                    fieldLine(),
                  ],
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: noBorders,
                  children: [
                    fieldLabel('Confidence score (1 – 5)'),
                    fieldLine(),
                  ],
                }),
              ],
            }),
          ],
        }))

        children.push(sp(80))

        // Confidence legend
        children.push(new Paragraph({
          children: [new TextRun({
            text: '1 = Off track   ·   2 = At risk   ·   3 = Cautious   ·   4 = Good   ·   5 = On track',
            font: F, size: 16, color: MUTED, italics: true,
          })],
          spacing: { after: 40 },
          alignment: AlignmentType.CENTER,
        }))

        children.push(sp(80))

        // Weekly update
        children.push(sectionLabel('What happened this week? (2–4 sentences)'))
        children.push(...fillLines(3, 160))

        // Blockers
        children.push(sectionLabel('Key blockers or dependencies'))
        children.push(...fillLines(2, 60))

        children.push(sp(280))
        children.push(hr('E5E7EB', 280))
      })
    })

    // ── FOOTER ───────────────────────────────────────────────
    children.push(new Paragraph({
      children: [new TextRun({
        text: `Ontop OKR System  ·  ${area.name}  ·  Q${quarter} ${year}`,
        font: F, size: 16, color: MUTED, italics: true,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 160 },
    }))

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: F, size: 22, color: DARK },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            margin: { top: 800, bottom: 800, left: 900, right: 900 },
          },
        },
        children,
      }],
    })

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
