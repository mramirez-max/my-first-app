'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  METRIC_DEFINITIONS,
  METRIC_CATEGORIES,
  MONTH_NAMES,
  formatMetricValue,
  type MetricDefinition,
} from '@/lib/metrics'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Upload, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricRow {
  metric_name: string
  month: number
  year: number
  value: number
}

interface Props {
  isAdmin: boolean
}

export default function MetricsClient({ isAdmin }: Props) {
  const now = new Date()
  const [month, setMonth]         = useState(now.getMonth() + 1)
  const [year, setYear]           = useState(now.getFullYear())
  const [rows, setRows]           = useState<MetricRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving]       = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/metrics?month=${month}&year=${year}`)
      const json = await res.json()
      setRows(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  function getValue(name: string, m: number, y: number): number | null {
    return rows.find(r => r.metric_name === name && r.month === m && r.year === y)?.value ?? null
  }

  function navigate(direction: -1 | 1) {
    if (direction === -1) {
      if (month === 1) { setMonth(12); setYear(y => y - 1) }
      else setMonth(m => m - 1)
    } else {
      if (month === 12) { setMonth(1); setYear(y => y + 1) }
      else setMonth(m => m + 1)
    }
  }

  function startEdit(def: MetricDefinition) {
    if (!isAdmin) return
    const current = getValue(def.name, month, year)
    setEditingKey(def.name)
    setEditValue(current !== null ? String(current) : '')
  }

  async function commitEdit(def: MetricDefinition) {
    setSaving(true)
    const parsed = parseFloat(editValue.replace(/,/g, ''))
    const value  = isNaN(parsed) ? null : parsed
    try {
      await fetch('/api/metrics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ metric_name: def.name, month, year, value }),
      })
      await fetchData()
    } finally {
      setSaving(false)
      setEditingKey(null)
    }
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditValue('')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/metrics/import', { method: 'POST', body: fd })
      const json = await res.json()
      if (res.ok) {
        setImportResult({ imported: json.imported, skipped: json.skipped })
        await fetchData()
      } else {
        alert(json.error ?? 'Import failed')
      }
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function DeltaBadge({ current, prev, format }: { current: number | null; prev: number | null; format: MetricDefinition['format'] }) {
    if (current === null || prev === null || prev === 0) return null
    const delta   = current - prev
    const pct     = (delta / Math.abs(prev)) * 100
    const up      = delta > 0
    const neutral = Math.abs(pct) < 0.1

    if (neutral) return <span className="flex items-center gap-0.5 text-xs text-white/30"><Minus size={10} /> 0%</span>

    const formatted = format === 'percent'
      ? `${Math.abs(delta).toFixed(1)}pp`
      : `${Math.abs(pct).toFixed(1)}%`

    return (
      <span className={cn('flex items-center gap-0.5 text-xs font-medium', up ? 'text-emerald-400' : 'text-rose-400')}>
        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {formatted}
      </span>
    )
  }

  const byCategory = METRIC_CATEGORIES.map(cat => ({
    category: cat,
    metrics: METRIC_DEFINITIONS.filter(m => m.category === cat),
  }))

  const categoryColors: Record<string, string> = {
    'Revenue':             '#FF5A70',
    'Volume':              '#4A9EF8',
    'Growth':              '#34D399',
    'Network':             '#A78BFA',
    'Banking & Cards':     '#FBBF24',
    'People & Efficiency': '#FB923C',
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Metrics</h1>
          <p className="text-sm text-white/40 mt-0.5">Monthly operational data</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month navigator */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg px-1 py-1 border border-white/10">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-medium text-white px-3 min-w-[130px] text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Import */}
          {isAdmin && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImport}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="gap-2 border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
              >
                <Upload size={14} />
                {importing ? 'Importing…' : 'Import CSV'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Import result toast */}
      {importResult && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5">
          <p className="text-sm text-emerald-400">
            Imported <strong>{importResult.imported}</strong> rows
            {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
          </p>
          <button onClick={() => setImportResult(null)} className="text-white/40 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* CSV format hint for admins */}
      {isAdmin && (
        <div className="rounded-lg bg-white/3 border border-white/8 px-4 py-3">
          <p className="text-xs text-white/40">
            <span className="text-white/60 font-medium">CSV format:</span>{' '}
            columns must be{' '}
            <code className="text-[#FF5A70] bg-[#FF5A70]/10 px-1 rounded">metric, month, year, value</code>
            {' '}— metric names must match exactly (see list below).
          </p>
        </div>
      )}

      {/* Metric categories */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {METRIC_CATEGORIES.map(cat => (
            <div key={cat} className="rounded-2xl bg-white/3 border border-white/8 p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {byCategory.map(({ category, metrics }) => {
            const accent = categoryColors[category] ?? '#FF5A70'
            return (
              <div
                key={category}
                className="rounded-2xl bg-[#1a1040] border border-white/8 overflow-hidden"
              >
                {/* Category header */}
                <div className="px-5 py-3 border-b border-white/8 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                  <h2 className="text-sm font-semibold text-white">{category}</h2>
                </div>

                {/* Metric rows */}
                <div className="divide-y divide-white/5">
                  {metrics.map(def => {
                    const current  = getValue(def.name, month, year)
                    const prev     = getValue(def.name, prevMonth, prevYear)
                    const isEditing = editingKey === def.name

                    return (
                      <div
                        key={def.name}
                        className={cn(
                          'flex items-center justify-between px-5 py-3 group transition-colors',
                          isAdmin && !isEditing && 'cursor-pointer hover:bg-white/3',
                          isEditing && 'bg-white/5'
                        )}
                        onClick={() => !isEditing && startEdit(def)}
                      >
                        {/* Metric name */}
                        <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors flex-1 min-w-0 pr-4 truncate">
                          {def.name}
                        </span>

                        {/* Right side */}
                        <div className="flex items-center gap-3 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                type="number"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitEdit(def)
                                  if (e.key === 'Escape') cancelEdit()
                                }}
                                className="w-28 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-[#FF5A70]/60"
                                placeholder="0"
                              />
                              <button
                                onClick={() => commitEdit(def)}
                                disabled={saving}
                                className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1.5 rounded bg-white/8 text-white/50 hover:bg-white/15 transition-colors"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <DeltaBadge current={current} prev={prev} format={def.format} />
                              <span className={cn(
                                'text-sm font-semibold tabular-nums min-w-[72px] text-right',
                                current !== null ? 'text-white' : 'text-white/25'
                              )}>
                                {formatMetricValue(current, def.format)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Prev month label */}
      <p className="text-xs text-white/25 text-center">
        Delta vs {MONTH_NAMES[prevMonth - 1]} {prevYear}
        {isAdmin && '  ·  Click any value to edit'}
      </p>
    </div>
  )
}
