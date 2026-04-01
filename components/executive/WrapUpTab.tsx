'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Wand2, ArrowRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'

export interface WrapUpUpdate {
  id: string
  confidence_score: number
  current_value: number
  week_date: string
}

export interface WrapUpKR {
  id: string
  description: string
  target_value: number
  current_value: number
  unit: string | null
  owner_id: string | null
  updates: WrapUpUpdate[]
}

export interface WrapUpObjective {
  id: string
  title: string
  area_id: string
  area: { name: string } | null
  key_results: WrapUpKR[]
}

type KRStatus = 'met' | 'partial' | 'missed'

function classify(kr: WrapUpKR): KRStatus {
  if ((kr.updates?.length ?? 0) === 0 || kr.target_value === 0) return 'missed'
  const p = kr.current_value / kr.target_value
  if (p >= 1) return 'met'
  if (p >= 0.5) return 'partial'
  return 'missed'
}

function pct(kr: WrapUpKR): number {
  if (kr.target_value === 0) return 0
  return Math.round((kr.current_value / kr.target_value) * 100)
}

const STATUS = {
  met:     { label: 'Met',     Icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', bar: 'bg-emerald-400' },
  partial: { label: 'Partial', Icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-400/10',   border: 'border-amber-400/20',   bar: 'bg-amber-400' },
  missed:  { label: 'Missed',  Icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-400/10',     border: 'border-red-400/20',     bar: 'bg-red-400/50' },
}

const MD: React.ComponentProps<typeof import('react-markdown').default>['components'] = {
  h1:     ({ children }) => <p className="font-bold text-white mb-2 mt-3">{children}</p>,
  h2:     ({ children }) => <p className="font-semibold text-white/90 mb-1.5 mt-3">{children}</p>,
  h3:     ({ children }) => <p className="font-semibold text-white/80 mb-1 mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  ul:     ({ children }) => <ul className="list-disc list-inside space-y-1 my-1.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal list-inside space-y-1 my-1.5">{children}</ol>,
  li:     ({ children }) => <li className="text-white/80">{children}</li>,
  p:      ({ children }) => <p className="mb-2 last:mb-0 text-white/80">{children}</p>,
}

interface WrapUpTabProps {
  quarter: number
  year: number
  nextQuarter: number
  nextYear: number
  isFutureQuarter: boolean
  objectives: WrapUpObjective[]
  isAdmin: boolean
}

export default function WrapUpTab({
  quarter, year, nextQuarter, nextYear, isFutureQuarter, objectives, isAdmin,
}: WrapUpTabProps) {
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set())
  const [selectedKRIds, setSelectedKRIds] = useState<Set<string>>(new Set())
  const [retroText, setRetroText]         = useState<string | null>(null)
  const [retroLoading, setRetroLoading]   = useState(false)
  const [retroError, setRetroError]       = useState<string | null>(null)
  const [carryLoading, setCarryLoading]   = useState(false)
  const [carryResult, setCarryResult]     = useState<{ objectivesCreated: number; krsCreated: number } | null>(null)
  const [carryError, setCarryError]       = useState<string | null>(null)

  // --- Locked state for future quarters ---
  if (isFutureQuarter) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/3 p-12 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
          <Lock size={18} className="text-white/30" />
        </div>
        <p className="text-white/60 font-medium">Q{quarter} {year} hasn't ended yet</p>
        <p className="text-sm text-white/30 max-w-xs">Come back at the end of Q{quarter} {year} to review performance and carry forward unmet goals into Q{nextQuarter} {nextYear}.</p>
      </div>
    )
  }

  // --- Compute totals ---
  const allKRs = objectives.flatMap(o => o.key_results ?? [])
  const counts = { met: 0, partial: 0, missed: 0 }
  for (const kr of allKRs) counts[classify(kr)]++
  const total = allKRs.length

  // --- Group by area ---
  const byArea = new Map<string, WrapUpObjective[]>()
  for (const obj of objectives) {
    const name = obj.area?.name ?? 'Unknown'
    if (!byArea.has(name)) byArea.set(name, [])
    byArea.get(name)!.push(obj)
  }

  function toggleArea(name: string) {
    setExpandedAreas(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function toggleKR(krId: string) {
    setSelectedKRIds(prev => {
      const next = new Set(prev)
      next.has(krId) ? next.delete(krId) : next.add(krId)
      return next
    })
  }

  async function generateRetro() {
    setRetroLoading(true)
    setRetroError(null)
    try {
      const res = await fetch('/api/okrs/retrospective', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ quarter, year }),
      })
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('application/json')) {
        throw new Error(`Server error (${res.status}) — please try again`)
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setRetroText(data.summary)
    } catch (e) {
      setRetroError(e instanceof Error ? e.message : 'Failed to generate')
    } finally {
      setRetroLoading(false)
    }
  }

  async function carryForward() {
    if (selectedKRIds.size === 0) return
    setCarryLoading(true)
    setCarryError(null)
    setCarryResult(null)
    try {
      const res = await fetch('/api/okrs/carry-forward', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          krIds:         Array.from(selectedKRIds),
          sourceQuarter: quarter,
          sourceYear:    year,
          targetQuarter: nextQuarter,
          targetYear:    nextYear,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setCarryResult(data)
      setSelectedKRIds(new Set())
    } catch (e) {
      setCarryError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCarryLoading(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Achievement Summary */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-5">
        <h3 className="text-sm font-medium text-white/60 mb-4">Q{quarter} {year} · Achievement Summary</h3>

        {total === 0 ? (
          <p className="text-sm text-white/30 italic">No OKR data found for Q{quarter} {year}.</p>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              {(['met', 'partial', 'missed'] as KRStatus[]).map(s => {
                const { label, Icon, color, bg, border } = STATUS[s]
                return (
                  <div key={s} className={cn('rounded-lg border p-4 flex flex-col gap-1', bg, border)}>
                    <div className="flex items-center gap-2">
                      <Icon size={15} className={color} />
                      <span className={cn('text-sm font-medium', color)}>{label}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{counts[s]}</p>
                    <p className="text-xs text-white/40">{Math.round((counts[s] / total) * 100)}% of KRs</p>
                  </div>
                )
              })}
            </div>

            {/* Per-area breakdown */}
            <div className="space-y-2">
              {Array.from(byArea.entries()).map(([areaName, areaObjs]) => {
                const areaKRs = areaObjs.flatMap(o => o.key_results ?? [])
                const ac = { met: 0, partial: 0, missed: 0 }
                for (const kr of areaKRs) ac[classify(kr)]++
                const expanded = expandedAreas.has(areaName)

                return (
                  <div key={areaName} className="rounded-lg border border-white/8 overflow-hidden">
                    <button onClick={() => toggleArea(areaName)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        {expanded
                          ? <ChevronDown size={14} className="text-white/40 shrink-0" />
                          : <ChevronRight size={14} className="text-white/40 shrink-0" />}
                        <span className="text-sm font-medium text-white/80">{areaName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ac.met     > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">{ac.met} met</span>}
                        {ac.partial > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">{ac.partial} partial</span>}
                        {ac.missed  > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400">{ac.missed} missed</span>}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-white/8 divide-y divide-white/5">
                        {areaObjs.map(obj => (
                          <div key={obj.id} className="px-4 py-3">
                            <p className="text-xs text-white/40 mb-2 font-medium">{obj.title}</p>
                            <div className="space-y-2">
                              {(obj.key_results ?? []).map(kr => {
                                const status    = classify(kr)
                                const { Icon, color, bg, border, bar } = STATUS[status]
                                const progress  = Math.min(pct(kr), 100)
                                const selectable = isAdmin && status !== 'met'
                                const selected  = selectedKRIds.has(kr.id)

                                return (
                                  <div key={kr.id}
                                    onClick={selectable ? () => toggleKR(kr.id) : undefined}
                                    className={cn(
                                      'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                                      selectable ? 'cursor-pointer hover:bg-white/3' : '',
                                      selected ? 'bg-[#4A268C]/15 ring-1 ring-[#4A268C]/30' : 'bg-white/2',
                                    )}>

                                    {/* Checkbox (admin + selectable KRs only) */}
                                    {isAdmin && (
                                      <div className={cn(
                                        'w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors',
                                        !selectable ? 'border-white/8 bg-transparent opacity-20 cursor-default' :
                                        selected    ? 'bg-[#4A268C] border-[#4A268C]' :
                                                      'border-white/20 bg-white/5',
                                      )}>
                                        {selected && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                                      </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm text-white/75 leading-snug flex-1">{kr.description}</p>
                                        <div className={cn('flex items-center gap-1 shrink-0 text-xs px-2 py-0.5 rounded-full border', bg, border, color)}>
                                          <Icon size={11} />
                                          <span>{pct(kr)}%</span>
                                        </div>
                                      </div>
                                      <div className="mt-1.5 h-1 rounded-full bg-white/8 overflow-hidden">
                                        <div className={cn('h-full rounded-full', bar)} style={{ width: `${progress}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* AI Retrospective */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-medium text-white/80">AI Retrospective</h3>
            <p className="text-xs text-white/40 mt-0.5">
              AI-generated Q{quarter} {year} review — wins, misses, patterns, and Q{nextQuarter} {nextYear} recommendations
            </p>
          </div>
          {!retroText && (
            <Button size="sm" onClick={generateRetro} disabled={retroLoading}
              className="gap-2 bg-gradient-to-br from-[#FF5A70]/80 to-[#4A268C]/80 text-white border-0 hover:opacity-90 shrink-0">
              {retroLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {retroLoading ? 'Generating…' : `Generate Q${quarter} Retrospective`}
            </Button>
          )}
        </div>

        {retroError && <p className="text-sm text-red-400">{retroError}</p>}

        {retroText ? (
          <div className="space-y-2">
            <div className="rounded-lg bg-white/3 border border-white/8 px-5 py-4 text-sm leading-relaxed">
              <ReactMarkdown components={MD}>{retroText}</ReactMarkdown>
            </div>
            <button onClick={() => { setRetroText(null); setRetroError(null) }}
              className="text-xs text-white/30 hover:text-white/50 transition-colors">
              Regenerate
            </button>
          </div>
        ) : !retroLoading && !retroError && (
          <p className="text-sm text-white/30 italic">
            Click to generate a retrospective based on Q{quarter} {year} performance data.
          </p>
        )}
      </div>

      {/* Carry Forward (admin only) */}
      {isAdmin && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-sm font-medium text-white/80">Carry Forward to Q{nextQuarter} {nextYear}</h3>
              <p className="text-xs text-white/40 mt-0.5">
                Select Partial or Missed KRs above, then carry them into the next quarter
              </p>
            </div>
            <Button size="sm" onClick={carryForward}
              disabled={selectedKRIds.size === 0 || carryLoading}
              className="gap-2 bg-white/8 text-white/70 hover:text-white hover:bg-white/15 border border-white/10 disabled:opacity-30 shrink-0">
              {carryLoading
                ? <Loader2 size={13} className="animate-spin" />
                : <ArrowRight size={13} />}
              {carryLoading
                ? 'Carrying forward…'
                : selectedKRIds.size > 0
                  ? `Carry Forward (${selectedKRIds.size})`
                  : 'Carry Forward'}
            </Button>
          </div>

          {carryResult && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={14} />
              {carryResult.krsCreated} KR{carryResult.krsCreated !== 1 ? 's' : ''} added to Q{nextQuarter} {nextYear}
              {carryResult.objectivesCreated > 0 && ` (${carryResult.objectivesCreated} new objective${carryResult.objectivesCreated !== 1 ? 's' : ''} created)`}
            </div>
          )}
          {carryError && <p className="text-sm text-red-400">{carryError}</p>}
        </div>
      )}
    </div>
  )
}
