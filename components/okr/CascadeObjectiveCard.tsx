'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CompanyObjective, AreaObjective, Profile, calcProgress } from '@/types'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, ArrowRight } from 'lucide-react'
import ObjectiveDialog from './ObjectiveDialog'

interface CascadeObjectiveCardProps {
  objective: CompanyObjective
  index: number
  alignedAreaObjectives: AreaObjective[]
  profile: Profile
  onRefresh: () => void
  isCurrentQuarter?: boolean
}

const GRADIENT_COLORS = [
  { from: 'from-[#FF5A70]', to: 'to-[#4A268C]', light: 'bg-[#FF5A70]/10', border: 'border-[#FF5A70]/20', text: 'text-[#FF5A70]' },
  { from: 'from-[#6364BF]', to: 'to-[#4A268C]', light: 'bg-[#6364BF]/10', border: 'border-[#6364BF]/25', text: 'text-[#6364BF]' },
  { from: 'from-[#883883]', to: 'to-[#4A268C]', light: 'bg-[#883883]/10', border: 'border-[#883883]/25', text: 'text-[#883883]' },
]

const AREA_SLUGS: Record<string, string> = {
  'Operations': 'operations', 'Revenue': 'revenue', 'Marketing': 'marketing',
  'Customer Success': 'customer-success', 'Finance': 'finance', 'Legal': 'legal',
  'Compliance': 'compliance', 'People': 'people', 'Tech': 'tech', 'Product': 'product',
  'Worker Journey': 'worker-journey', 'Sales': 'sales',
}

export default function CascadeObjectiveCard({
  objective,
  index,
  alignedAreaObjectives,
  profile,
  onRefresh,
  isCurrentQuarter = true,
}: CascadeObjectiveCardProps) {
  const [showObjDialog, setShowObjDialog] = useState(false)

  const color = GRADIENT_COLORS[index % GRADIENT_COLORS.length]
  const isAdmin = profile.role === 'admin' && isCurrentQuarter

  // Progress rolls up from all aligned area KRs
  const allAreaKRs = alignedAreaObjectives.flatMap(ao => ao.key_results ?? [])
  const overallProgress = allAreaKRs.length > 0
    ? Math.round(allAreaKRs.reduce((sum, kr) => sum + calcProgress(kr.current_value, kr.target_value), 0) / allAreaKRs.length)
    : null

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden shadow-sm">
      {/* Header */}
      <div className={`bg-gradient-to-r ${color.from} ${color.to} p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
              Company Objective {index + 1}
            </p>
            <h2 className="text-xl font-bold text-white leading-snug">{objective.title}</h2>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white hover:bg-white/10 shrink-0"
              onClick={() => setShowObjDialog(true)}
            >
              <Pencil size={14} />
            </Button>
          )}
        </div>

        {/* Progress from area rollup */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-white/70">
            <span>Progress across contributing areas</span>
            <span className="font-bold text-white">
              {overallProgress !== null ? `${overallProgress}%` : '—'}
            </span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${overallProgress ?? 0}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-4 text-xs text-white/70">
          <span>{alignedAreaObjectives.length} area{alignedAreaObjectives.length !== 1 ? 's' : ''} contributing</span>
          {allAreaKRs.length > 0 && (
            <>
              <span>·</span>
              <span>{allAreaKRs.length} key results tracked</span>
            </>
          )}
        </div>
      </div>

      {/* Contributing Areas */}
      <div className="bg-[#140e2e] px-6 py-5">
        <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">
          Contributing Areas
        </p>

        {alignedAreaObjectives.length === 0 ? (
          <p className="text-sm text-white/30 italic">
            No area objectives aligned to this yet. Area leads can align their objectives from their area page.
          </p>
        ) : (
          <div className="space-y-4">
            {alignedAreaObjectives.map(ao => {
              const aoKRs = ao.key_results ?? []
              const aoProgress = aoKRs.length > 0
                ? Math.round(aoKRs.reduce((sum, kr) => sum + calcProgress(kr.current_value, kr.target_value), 0) / aoKRs.length)
                : 0
              const areaName = (ao.area as { name: string } | undefined)?.name ?? 'Unknown'
              const slug = AREA_SLUGS[areaName] ?? areaName.toLowerCase().replace(/ /g, '-')

              const latestConfidences = aoKRs.flatMap(kr =>
                (kr.updates as { confidence_score: number; week_date: string }[] | undefined ?? [])
                  .sort((a, b) => b.week_date.localeCompare(a.week_date))
                  .slice(0, 1)
                  .map(u => u.confidence_score)
              )
              const avgConfidence = latestConfidences.length > 0
                ? latestConfidences.reduce((a, b) => a + b, 0) / latestConfidences.length
                : null

              const confidenceColor =
                avgConfidence === null ? 'bg-white/20'
                : avgConfidence >= 4 ? 'bg-emerald-400'
                : avgConfidence >= 3 ? 'bg-yellow-400'
                : 'bg-red-400'

              return (
                <div key={ao.id} className="border border-white/10 bg-gradient-to-br from-[#1c1540] to-[#23174B] rounded-xl p-4 hover:brightness-110 transition-all">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${confidenceColor}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">{areaName}</p>
                        <p className="text-sm font-semibold text-white leading-snug mt-0.5">{ao.title}</p>
                      </div>
                    </div>
                    <Link
                      href={`/areas/${slug}`}
                      className="shrink-0 flex items-center gap-1 text-xs text-[#FF5A70] hover:text-[#ff3f58] font-medium"
                    >
                      View <ArrowRight size={12} />
                    </Link>
                  </div>

                  {aoKRs.length > 0 ? (
                    <div className="space-y-2">
                      {aoKRs.map(kr => {
                        const p = calcProgress(kr.current_value, kr.target_value)
                        return (
                          <div key={kr.id}>
                            <div className="flex justify-between text-xs text-white/40 mb-1">
                              <span className="truncate pr-4">{kr.description}</span>
                              <span className="font-medium shrink-0">{p}%</span>
                            </div>
                            <Progress value={p} className="h-1.5" />
                          </div>
                        )
                      })}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/8">
                        <span className="text-xs text-white/40">{aoKRs.length} key result{aoKRs.length !== 1 ? 's' : ''}</span>
                        <Badge variant="outline" className="text-xs border-white/15 text-white/60">{aoProgress}% complete</Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-white/30 italic">No key results added yet.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ObjectiveDialog
        open={showObjDialog}
        onClose={() => setShowObjDialog(false)}
        type="company"
        existing={objective}
        onSuccess={onRefresh}
      />
    </div>
  )
}
