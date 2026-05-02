'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PlusCircle, Pencil, Loader2, TrendingUp, TrendingDown, Minus, AlertCircle, X, Trash2 } from 'lucide-react'

interface Profile {
  id: string
  full_name: string | null
}

interface TeamMetric {
  id: string
  area_id: string
  metric_name: string
  unit: string | null
  is_active: boolean
  owner_id: string | null
  higher_is_better: boolean
  owner?: Profile | null
}

interface TeamMetricValue {
  id: string
  metric_id: string
  value: number
  week_date: string
}

function getLastNWeeks(n: number): string[] {
  const weeks: string[] = []
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  for (let i = 0; i < n; i++) {
    weeks.push(monday.toISOString().split('T')[0])
    monday.setDate(monday.getDate() - 7)
  }
  return weeks.reverse()
}

function getCurrentWeekMonday(): string {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return monday.toISOString().split('T')[0]
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatValue(value: number, unit: string | null): string {
  if (unit === '%') return `${value}%`
  if (unit) return `${value} ${unit}`
  return String(value)
}

function isStagnant(vals: (number | null)[]): boolean {
  const last3 = vals.slice(-3)
  if (last3.some(v => v === null)) return false
  return last3[0] === last3[1] && last3[1] === last3[2]
}

// ── Metric dialog (add + edit) ───────────────────────────────────

interface MetricDialogProps {
  areaId: string
  members: Profile[]
  existing?: TeamMetric
  onClose: () => void
  onSuccess: () => void
}

function MetricDialog({ areaId, members, existing, onClose, onSuccess }: MetricDialogProps) {
  const [name, setName] = useState(existing?.metric_name ?? '')
  const [unit, setUnit] = useState(existing?.unit ?? '')
  const [ownerId, setOwnerId] = useState<string>(existing?.owner_id ?? '')
  const [higherIsBetter, setHigherIsBetter] = useState(existing?.higher_is_better ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const isEdit = !!existing

  useEffect(() => { nameRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const payload = {
      metric_name: name.trim(),
      unit: unit.trim() || null,
      owner_id: ownerId || null,
      higher_is_better: higherIsBetter,
    }
    const { error: err } = isEdit
      ? await supabase.from('team_metrics').update(payload).eq('id', existing!.id)
      : await supabase.from('team_metrics').insert({
          ...payload,
          area_id: areaId,
          metric_type: 'input',
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSuccess()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1335] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">{isEdit ? 'Edit Metric' : 'Add Metric'}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Metric name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Demos booked"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">
              Unit <span className="text-white/25">(optional)</span>
            </label>
            <input
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="e.g. %, deals, leads"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">
              Owner <span className="text-white/25">(optional)</span>
            </label>
            <select
              value={ownerId}
              onChange={e => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/25 appearance-none"
            >
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Direction</label>
            <div className="flex gap-2">
              {([true, false] as const).map(val => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setHigherIsBetter(val)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    higherIsBetter === val
                      ? 'bg-white/10 border-white/20 text-white'
                      : 'bg-transparent border-white/8 text-white/40 hover:text-white/60'
                  }`}
                >
                  {val ? '↑ Higher is better' : '↓ Lower is better'}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-medium border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? <Loader2 size={12} className="animate-spin mx-auto" /> : isEdit ? 'Save' : 'Add Metric'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Inline value input ───────────────────────────────────────────

interface InlineValueInputProps {
  metricId: string
  weekDate: string
  unit: string | null
  existingValue: number | null
  onSaved: (value: number) => void
  onCancel: () => void
}

function InlineValueInput({ metricId, weekDate, unit, existingValue, onSaved, onCancel }: InlineValueInputProps) {
  const [val, setVal] = useState(existingValue !== null ? String(existingValue) : '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function save() {
    const num = parseFloat(val)
    if (isNaN(num)) { onCancel(); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('team_metric_values').upsert(
      { metric_id: metricId, week_date: weekDate, value: num, created_by: user?.id },
      { onConflict: 'metric_id,week_date' }
    )
    setSaving(false)
    if (!error) onSaved(num)
    else onCancel()
  }

  if (saving) return <Loader2 size={12} className="animate-spin text-white/40 ml-auto" />

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        ref={inputRef}
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
        onBlur={save}
        className="w-16 px-1.5 py-0.5 rounded bg-white/8 border border-white/15 text-xs text-white focus:outline-none focus:border-white/30 text-right"
      />
      {unit && <span className="text-[10px] text-white/30">{unit}</span>}
    </div>
  )
}

// ── Main section ─────────────────────────────────────────────────

interface TeamMetricsSectionProps {
  areaId: string
  canEdit: boolean
}

const WEEKS = getLastNWeeks(8)
const CURRENT_WEEK = getCurrentWeekMonday()

export default function TeamMetricsSection({ areaId, canEdit }: TeamMetricsSectionProps) {
  const [metrics, setMetrics] = useState<TeamMetric[]>([])
  const [values, setValues] = useState<TeamMetricValue[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogMetric, setDialogMetric] = useState<TeamMetric | 'new' | null>(null)
  const [editingCell, setEditingCell] = useState<{ metricId: string; weekDate: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [{ data: m }, { data: prof }] = await Promise.all([
      supabase
        .from('team_metrics')
        .select('*')
        .eq('area_id', areaId)
        .eq('is_active', true)
        .order('created_at'),
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('area_id', areaId),
    ])

    const membersData = (prof ?? []) as Profile[]
    setMembers(membersData)

    const metricsData = ((m ?? []) as TeamMetric[]).map(metric => ({
      ...metric,
      owner: membersData.find(p => p.id === metric.owner_id) ?? null,
    }))
    setMetrics(metricsData)

    if (metricsData.length > 0) {
      const { data: vals } = await supabase
        .from('team_metric_values')
        .select('*')
        .in('metric_id', metricsData.map(x => x.id))
        .in('week_date', WEEKS)
      setValues((vals ?? []) as TeamMetricValue[])
    } else {
      setValues([])
    }
    setLoading(false)
  }, [areaId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(metricId: string) {
    setDeletingId(metricId)
    const supabase = createClient()
    await supabase.from('team_metrics').update({ is_active: false }).eq('id', metricId)
    setMetrics(prev => prev.filter(m => m.id !== metricId))
    setDeletingId(null)
  }

  function getValueForCell(metricId: string, weekDate: string): number | null {
    return values.find(v => v.metric_id === metricId && v.week_date === weekDate)?.value ?? null
  }

  function handleValueSaved(metricId: string, weekDate: string, value: number) {
    setValues(prev => {
      const filtered = prev.filter(v => !(v.metric_id === metricId && v.week_date === weekDate))
      return [...filtered, { id: '', metric_id: metricId, week_date: weekDate, value }]
    })
    setEditingCell(null)
  }

  function getDelta(metricId: string, weekIdx: number): number | null {
    if (weekIdx === 0) return null
    const cur = getValueForCell(metricId, WEEKS[weekIdx])
    const prev = getValueForCell(metricId, WEEKS[weekIdx - 1])
    if (cur === null || prev === null) return null
    return cur - prev
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-5">
        <div className="flex items-center gap-2 text-sm text-white/30">
          <Loader2 size={14} className="animate-spin" /> Loading metrics…
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">Team Metrics</h3>
            <p className="text-xs text-white/40 mt-0.5">Week-over-week metric tracking</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setDialogMetric('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              <PlusCircle size={13} />
              Add Metric
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {metrics.length === 0 ? (
            <div className="px-5 py-8 text-center space-y-3">
              <p className="text-sm text-white/30 italic">No metrics tracked yet.</p>
              {canEdit && (
                <button
                  onClick={() => setDialogMetric('new')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 transition-opacity"
                >
                  <PlusCircle size={14} />
                  Add your first metric
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-white/30 uppercase tracking-wide min-w-[160px]">Metric</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-white/30 uppercase tracking-wide min-w-[100px]">Owner</th>
                  {WEEKS.map((w, i) => (
                    <th
                      key={w}
                      className={`text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap min-w-[64px] ${
                        i === WEEKS.length - 1 ? 'text-white/60' : 'text-white/25'
                      }`}
                    >
                      {formatWeekLabel(w)}
                    </th>
                  ))}
                  {canEdit && <th className="w-16" />}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric, mi) => {
                  const weekVals = WEEKS.map(w => getValueForCell(metric.id, w))
                  const stagnant = isStagnant(weekVals)
                  const ownerName = metric.owner?.full_name ?? null

                  return (
                    <tr key={metric.id} className={`border-b border-white/4 group ${mi % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                      {/* Metric name */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white/80 font-medium">{metric.metric_name}</span>
                          {stagnant && (
                            <span title="No change in last 3 weeks" className="inline-flex items-center gap-0.5 text-yellow-400/70 text-[10px]">
                              <AlertCircle size={10} />
                              flat
                            </span>
                          )}
                        </div>
                        {metric.unit && <span className="text-white/25 text-[10px]">{metric.unit}</span>}
                      </td>
                      {/* Owner */}
                      <td className="px-3 py-3">
                        <span className="text-white/40 text-[11px]">
                          {ownerName ?? <span className="text-white/20 italic">Unassigned</span>}
                        </span>
                      </td>
                      {/* Week value cells */}
                      {WEEKS.map((week, wi) => {
                        const value = getValueForCell(metric.id, week)
                        const delta = getDelta(metric.id, wi)
                        const isCurrentWeek = week === CURRENT_WEEK
                        const isEditing = editingCell?.metricId === metric.id && editingCell?.weekDate === week

                        let DeltaIcon = null
                        let valueColor = 'text-white/50'
                        if (delta !== null) {
                          const isGood = delta === 0 ? null : (delta > 0) === metric.higher_is_better
                          if (delta === 0) {
                            DeltaIcon = <Minus size={9} className="text-white/25" />; valueColor = 'text-white/40'
                          } else if (isGood) {
                            DeltaIcon = metric.higher_is_better
                              ? <TrendingUp size={9} className="text-emerald-400" />
                              : <TrendingDown size={9} className="text-emerald-400" />
                            valueColor = 'text-emerald-400'
                          } else {
                            DeltaIcon = metric.higher_is_better
                              ? <TrendingDown size={9} className="text-red-400" />
                              : <TrendingUp size={9} className="text-red-400" />
                            valueColor = 'text-red-400'
                          }
                        }

                        return (
                          <td key={week} className={`px-3 py-3 ${isCurrentWeek ? 'bg-white/[0.02]' : ''}`}>
                            {isEditing ? (
                              <InlineValueInput
                                metricId={metric.id}
                                weekDate={week}
                                unit={metric.unit}
                                existingValue={value}
                                onSaved={v => handleValueSaved(metric.id, week, v)}
                                onCancel={() => setEditingCell(null)}
                              />
                            ) : value !== null ? (
                              <div className="flex items-center justify-end gap-1">
                                {DeltaIcon}
                                <span
                                  className={`${valueColor} ${canEdit ? 'cursor-pointer hover:text-white transition-colors' : ''}`}
                                  onClick={canEdit ? () => setEditingCell({ metricId: metric.id, weekDate: week }) : undefined}
                                  title={canEdit ? 'Click to edit' : undefined}
                                >
                                  {formatValue(value, metric.unit)}
                                </span>
                              </div>
                            ) : canEdit ? (
                              <button
                                onClick={() => setEditingCell({ metricId: metric.id, weekDate: week })}
                                className="flex items-center justify-end gap-1 w-full text-white/20 hover:text-white/50 transition-colors group/cell"
                                title="Enter value"
                              >
                                <span className="text-white/15 group-hover/cell:text-white/40">—</span>
                                <Pencil size={9} className="opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                              </button>
                            ) : (
                              <span className="flex justify-end text-white/15">—</span>
                            )}
                          </td>
                        )
                      })}
                      {/* Row actions */}
                      {canEdit && (
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setDialogMetric(metric)}
                              className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
                              title="Edit metric"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(metric.id)}
                              disabled={deletingId === metric.id}
                              className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
                              title="Remove metric"
                            >
                              {deletingId === metric.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Trash2 size={12} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {dialogMetric !== null && (
        <MetricDialog
          areaId={areaId}
          members={members}
          existing={dialogMetric !== 'new' ? dialogMetric : undefined}
          onClose={() => setDialogMetric(null)}
          onSuccess={fetchData}
        />
      )}
    </>
  )
}
