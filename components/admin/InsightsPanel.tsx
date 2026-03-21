'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AlertCircle, Clock, TrendingDown, Sparkles, CheckCircle2, ChevronLeft, ChevronRight, Pencil, BellOff, X } from 'lucide-react'
import { Area } from '@/types'

export interface ComputedInsight {
  type: 'missing' | 'stale' | 'at_risk'
  area: string
  areaId?: string
  krId?: string
  message: string
  detail?: string  // full KR description, shown on expand
}

export interface AreaInsightData {
  areaName: string
  krs: string[]
  recentUpdates: string[]
}

interface InsightsPanelProps {
  insights: ComputedInsight[]
  areaData: AreaInsightData[]
  areas: Area[]
  quarter: number
  year: number
}

const TYPE_CONFIG = {
  missing: { icon: AlertCircle,  color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  stale:   { icon: Clock,        color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  at_risk: { icon: TrendingDown, color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20'   },
  ai:      { icon: Sparkles,     color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20'  },
}

const SNOOZE_OPTIONS = [
  { label: '3 days',         days: 3  },
  { label: '1 week',         days: 7  },
  { label: '2 weeks',        days: 14 },
  { label: 'End of quarter', days: 90 },
]

const PAGE_SIZE = 10

type AnyInsight = ComputedInsight | { type: 'ai'; area: string; message: string; krId?: string }

function insightKey(ins: { type: string; area: string; krId?: string; message: string }) {
  return `${ins.type}:${ins.area}:${ins.krId ?? ins.message.slice(0, 40)}`
}

export default function InsightsPanel({ insights, areaData, areas, quarter, year }: InsightsPanelProps) {
  const [aiInsights, setAiInsights] = useState<{ area: string; message: string }[]>([])
  const [scanning, setScanning]     = useState(false)
  const [scanned, setScanned]       = useState(false)
  const [filterArea, setFilterArea] = useState<string>('all')
  const [page, setPage]             = useState(0)

  // Triage state
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [hidden, setHidden]         = useState<Set<string>>(new Set())
  const [resolved, setResolved]     = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [activeAction, setActiveAction] = useState<Record<string, 'update' | 'snooze' | 'dismiss' | null>>({})
  const [updateForms, setUpdateForms]   = useState<Record<string, {
    text: string; score: number; value: string; submitting: boolean; error: string | null
  }>>({})

  // Load snooze / dismiss from localStorage on mount
  useEffect(() => {
    const now = Date.now()
    const hiddenKeys = new Set<string>()
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)!
      if (lsKey.startsWith('okr_snooze:')) {
        const key = lsKey.slice('okr_snooze:'.length)
        const val = JSON.parse(localStorage.getItem(lsKey) ?? 'null')
        if (val?.until > now) hiddenKeys.add(key)
        else localStorage.removeItem(lsKey)
      } else if (lsKey.startsWith('okr_dismiss:')) {
        hiddenKeys.add(lsKey.slice('okr_dismiss:'.length))
      }
    }
    setHidden(hiddenKeys)
  }, [])

  function openAction(key: string, action: 'update' | 'snooze' | 'dismiss') {
    setActiveAction(prev => {
      const next: Record<string, 'update' | 'snooze' | 'dismiss' | null> = {}
      Object.keys(prev).forEach(k => { next[k] = null })
      next[key] = prev[key] === action ? null : action
      return next
    })
  }

  function closeAction(key: string) {
    setActiveAction(prev => ({ ...prev, [key]: null }))
  }

  function snoozeInsight(ins: AnyInsight, days: number) {
    const key = insightKey(ins)
    const until = Date.now() + days * 24 * 60 * 60 * 1000
    localStorage.setItem(`okr_snooze:${key}`, JSON.stringify({ until }))
    setHidden(prev => new Set([...prev, key]))
    closeAction(key)
  }

  function dismissInsight(ins: AnyInsight) {
    const key = insightKey(ins)
    localStorage.setItem(`okr_dismiss:${key}`, '1')
    setHidden(prev => new Set([...prev, key]))
    closeAction(key)
  }

  function unhideAll() {
    allInsights.forEach(ins => {
      const key = insightKey(ins)
      localStorage.removeItem(`okr_snooze:${key}`)
      localStorage.removeItem(`okr_dismiss:${key}`)
    })
    setHidden(new Set())
    setShowHidden(false)
  }

  async function submitUpdate(ins: ComputedInsight) {
    const key  = insightKey(ins)
    const form = updateForms[key]
    if (!form || !ins.krId) return

    setUpdateForms(prev => ({ ...prev, [key]: { ...prev[key], submitting: true, error: null } }))

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const today    = new Date()
      const weekDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())

      const { error } = await supabase.from('area_kr_updates').insert({
        key_result_id:    ins.krId,
        update_text:      form.text,
        confidence_score: form.score,
        current_value:    form.value ? parseFloat(form.value) : null,
        created_by:       user?.id,
        week_date:        weekDate.toISOString().split('T')[0],
      })

      if (error) throw error

      setResolved(prev => new Set([...prev, key]))
      closeAction(key)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      setUpdateForms(prev => ({ ...prev, [key]: { ...prev[key], submitting: false, error: msg } }))
    }
  }

  async function runAIScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areas: areaData }),
      })
      const data = await res.json()
      setAiInsights(data.insights ?? [])
    } finally {
      setScanning(false)
      setScanned(true)
    }
  }

  const allInsights: AnyInsight[] = [
    ...insights,
    ...aiInsights.map(i => ({ ...i, type: 'ai' as const })),
  ]

  const visibleInsights = showHidden
    ? allInsights
    : allInsights.filter(i => !hidden.has(insightKey(i)) && !resolved.has(insightKey(i)))

  const hiddenCount = allInsights.filter(i =>
    hidden.has(insightKey(i)) || resolved.has(insightKey(i))
  ).length

  const filtered = filterArea === 'all'
    ? visibleInsights
    : visibleInsights.filter(i => i.area === filterArea)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function changeArea(area: string) {
    setFilterArea(area)
    setPage(0)
  }

  return (
    <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Executive Insights — Q{quarter} {year}</h2>
          <p className="text-sm text-white/40 mt-0.5">OKRs needing attention · update, snooze, or dismiss each item</p>
        </div>
        <div className="flex items-center gap-3">
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              className="text-xs text-white/30 hover:text-white/60 underline"
            >
              {showHidden ? 'Hide snoozed' : `${hiddenCount} hidden`}
            </button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={runAIScan}
            disabled={scanning}
            className="gap-2 border-white/15 text-white/70 hover:text-white hover:bg-white/5 shrink-0"
          >
            <Sparkles size={13} className={scanning ? 'animate-pulse text-blue-400' : ''} />
            {scanning ? 'Scanning…' : scanned ? 'Rescan' : 'Scan for untracked work'}
          </Button>
        </div>
      </div>

      {/* Area filter pills */}
      {allInsights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => changeArea('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterArea === 'all'
                ? 'bg-white/15 border-white/20 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
            }`}
          >
            All ({visibleInsights.length})
          </button>
          {areas
            .filter(a => visibleInsights.some(i => i.area === a.name))
            .map(a => {
              const count = visibleInsights.filter(i => i.area === a.name).length
              return (
                <button
                  key={a.id}
                  onClick={() => changeArea(a.name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterArea === a.name
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                  }`}
                >
                  {a.name} ({count})
                </button>
              )
            })}
        </div>
      )}

      {/* Insights list */}
      {filtered.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-white/40 py-2">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {scanned || insights.length === 0
            ? 'No issues detected for this area.'
            : 'No flagged items. Run a scan to detect untracked work.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {paginated.map((ins, i) => {
            const cfg        = TYPE_CONFIG[ins.type]
            const Icon       = cfg.icon
            const key        = insightKey(ins)
            const action     = activeAction[key] ?? null
            const isResolved = resolved.has(key)
            const isHidden   = hidden.has(key)
            const isExpanded = expanded.has(key)
            const canUpdate  = (ins.type === 'stale' || ins.type === 'at_risk') && 'krId' in ins && !!ins.krId
            const form       = updateForms[key] ?? { text: '', score: ins.type === 'at_risk' ? 2 : 3, value: '', submitting: false, error: null }
            const hasDetail  = 'detail' in ins && !!ins.detail

            return (
              <li key={i} className={`rounded-lg border overflow-hidden transition-opacity ${cfg.bg} ${cfg.border} ${isHidden ? 'opacity-40' : ''}`}>

                {/* Main row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Icon size={14} className={`shrink-0 ${cfg.color}`} />
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs font-medium ${cfg.color} mr-2`}>{ins.area}</span>
                    <button
                      onClick={() => hasDetail
                        ? setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
                        : undefined
                      }
                      className={`text-sm text-left transition-colors ${
                        isResolved ? 'line-through text-white/30' : 'text-white/70'
                      } ${hasDetail ? 'hover:text-white cursor-pointer' : 'cursor-default'}`}
                    >
                      {isExpanded && hasDetail
                        ? (ins as ComputedInsight).detail
                        : ins.message}
                      {hasDetail && !isExpanded && (
                        <span className={`ml-1 text-xs ${cfg.color} opacity-60`}>· see full</span>
                      )}
                      {hasDetail && isExpanded && (
                        <span className={`ml-1 text-xs ${cfg.color} opacity-60`}>· collapse</span>
                      )}
                    </button>
                  </div>

                  {isResolved ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                      <CheckCircle2 size={12} /> Updated
                    </span>
                  ) : (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {canUpdate && (
                        <button
                          onClick={() => {
                            openAction(key, 'update')
                            setUpdateForms(prev => ({
                              ...prev,
                              [key]: prev[key] ?? { text: '', score: ins.type === 'at_risk' ? 2 : 3, value: '', submitting: false, error: null },
                            }))
                          }}
                          title="Add update"
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                            action === 'update'
                              ? 'bg-white/15 text-white'
                              : 'text-white/35 hover:text-white/80 hover:bg-white/8'
                          }`}
                        >
                          <Pencil size={11} /><span>Update</span>
                        </button>
                      )}
                      <button
                        onClick={() => openAction(key, 'snooze')}
                        title="Snooze"
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          action === 'snooze'
                            ? 'bg-white/15 text-white'
                            : 'text-white/35 hover:text-white/80 hover:bg-white/8'
                        }`}
                      >
                        <BellOff size={11} /><span>Snooze</span>
                      </button>
                      <button
                        onClick={() => openAction(key, 'dismiss')}
                        title="Dismiss"
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          action === 'dismiss'
                            ? 'bg-white/15 text-white'
                            : 'text-white/35 hover:text-white/80 hover:bg-white/8'
                        }`}
                      >
                        <X size={11} /><span>Dismiss</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline update form */}
                {action === 'update' && canUpdate && !isResolved && (
                  <div className="px-3 pb-3 pt-2 border-t border-white/8 bg-black/10 space-y-3">
                    <p className="text-xs text-white/40">Add a progress update — include the specific metric if possible.</p>
                    <textarea
                      value={form.text}
                      onChange={e => setUpdateForms(prev => ({ ...prev, [key]: { ...prev[key], text: e.target.value } }))}
                      placeholder="e.g. Closed 2 of 5 expansion accounts. Pipeline at $280K vs $400K target."
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/30"
                    />
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40">Confidence:</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => setUpdateForms(prev => ({ ...prev, [key]: { ...prev[key], score: n } }))}
                              className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
                                form.score === n
                                  ? n <= 2 ? 'bg-red-500 text-white' : n === 3 ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-white'
                                  : 'bg-white/8 text-white/40 hover:bg-white/15 hover:text-white'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40">Metric value:</span>
                        <input
                          type="number"
                          value={form.value}
                          onChange={e => setUpdateForms(prev => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                          placeholder="e.g. 42"
                          className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                    {form.error && <p className="text-xs text-red-400">{form.error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitUpdate(ins as ComputedInsight)}
                        disabled={form.submitting || !form.text.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/15 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
                      >
                        {form.submitting ? 'Saving…' : 'Save update'}
                      </button>
                      <button
                        onClick={() => closeAction(key)}
                        className="px-3 py-1.5 rounded-lg text-xs text-white/35 hover:text-white/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Snooze picker */}
                {action === 'snooze' && !isResolved && (
                  <div className="px-3 pb-3 pt-2 border-t border-white/8 bg-black/10">
                    <p className="text-xs text-white/40 mb-2">Snooze this insight for:</p>
                    <div className="flex flex-wrap gap-2">
                      {SNOOZE_OPTIONS.map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => snoozeInsight(ins, opt.days)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        onClick={() => closeAction(key)}
                        className="px-3 py-1.5 rounded-lg text-xs text-white/35 hover:text-white/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Dismiss confirmation */}
                {action === 'dismiss' && !isResolved && (
                  <div className="px-3 pb-3 pt-2 border-t border-white/8 bg-black/10">
                    <p className="text-xs text-white/50 mb-2">Hide this insight for the rest of the quarter?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => dismissInsight(ins)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Yes, dismiss
                      </button>
                      <button
                        onClick={() => closeAction(key)}
                        className="px-3 py-1.5 rounded-lg text-xs text-white/35 hover:text-white/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-white/30">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="p-1 rounded text-white/40 hover:text-white disabled:opacity-30">
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="p-1 rounded text-white/40 hover:text-white disabled:opacity-30">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Hidden items footer */}
      {hiddenCount > 0 && !showHidden && (
        <p className="text-xs text-white/25 text-center pt-1">
          {hiddenCount} item{hiddenCount !== 1 ? 's' : ''} hidden ·{' '}
          <button onClick={() => setShowHidden(true)} className="underline hover:text-white/50">show</button>
          {' · '}
          <button onClick={unhideAll} className="underline hover:text-white/50">clear all</button>
        </p>
      )}
    </section>
  )
}
