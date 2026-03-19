'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Area, CompanyObjective } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronUp, Check, Loader2, PlusCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KR {
  id: string
  description: string
  target_value: number
  unit: string | null
  owner_id: string | null
}

interface Objective {
  id: string
  area_id: string
  title: string
  aligned_to: string | null
  key_results: KR[]
}

interface ProfileOption {
  id: string
  full_name: string | null
  email?: string | null
}

interface OKRManagerProps {
  initialObjectives: Objective[]
  areas: Area[]
  companyObjectives: CompanyObjective[]
  profiles: ProfileOption[]
  quarter: number
  year: number
}

const ALIGNMENT_COLORS = [
  'border-[#FF5A70]/40 text-[#FF5A70] bg-[#FF5A70]/10',
  'border-[#6364BF]/40 text-[#6364BF] bg-[#6364BF]/10',
  'border-[#883883]/40 text-[#883883] bg-[#883883]/10',
]

export default function OKRManager({
  initialObjectives, areas, companyObjectives, profiles, quarter, year,
}: OKRManagerProps) {
  const supabase = createClient()
  const [objectives, setObjectives] = useState<Objective[]>(initialObjectives)
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  function flash(id: string) {
    setSavedId(id)
    setTimeout(() => setSavedId(s => s === id ? null : s), 1800)
  }

  async function saveObjectiveField(id: string, updates: Record<string, unknown>) {
    setSavingId(id)
    await supabase.from('area_objectives').update(updates).eq('id', id)
    setSavingId(null)
    flash(id)
  }

  async function saveKRField(id: string, updates: Record<string, unknown>) {
    setSavingId(id)
    await supabase.from('area_key_results').update(updates).eq('id', id)
    setSavingId(null)
    flash(id)
  }

  function patchObjective(id: string, patch: Partial<Objective>) {
    setObjectives(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }

  function patchKR(objId: string, krId: string, patch: Partial<KR>) {
    setObjectives(prev => prev.map(o =>
      o.id !== objId ? o : { ...o, key_results: o.key_results.map(kr => kr.id === krId ? { ...kr, ...patch } : kr) }
    ))
  }

  async function addKR(objective: Objective) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('area_key_results').insert({
      objective_id: objective.id,
      description: '',
      target_value: 100,
      current_value: 0,
      unit: null,
      owner_id: user?.id ?? null,
    }).select('id, description, target_value, unit, owner_id').single()
    if (!error && data) {
      setObjectives(prev => prev.map(o =>
        o.id !== objective.id ? o : { ...o, key_results: [...o.key_results, data as KR] }
      ))
    }
  }

  async function deleteKR(objId: string, krId: string) {
    if (!confirm('Delete this key result?')) return
    await supabase.from('area_key_results').delete().eq('id', krId)
    setObjectives(prev => prev.map(o =>
      o.id !== objId ? o : { ...o, key_results: o.key_results.filter(kr => kr.id !== krId) }
    ))
  }

  async function reassignArea(objId: string, newAreaId: string) {
    patchObjective(objId, { area_id: newAreaId })
    await saveObjectiveField(objId, { area_id: newAreaId })
  }

  function toggleArea(areaId: string) {
    setCollapsedAreas(prev => {
      const next = new Set(prev)
      next.has(areaId) ? next.delete(areaId) : next.add(areaId)
      return next
    })
  }

  const byArea = areas
    .map(area => ({ area, objs: objectives.filter(o => o.area_id === area.id) }))
    .filter(g => g.objs.length > 0)

  const totalObjs = objectives.length
  const totalKRs = objectives.reduce((s, o) => s + o.key_results.length, 0)

  return (
    <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Manage OKRs — Q{quarter} {year}</h2>
        <p className="text-sm text-white/40 mt-0.5">
          {totalObjs} objectives · {totalKRs} key results — edit inline, changes save automatically
        </p>
      </div>

      {totalObjs === 0 ? (
        <p className="text-sm text-white/40 italic py-2">
          No OKRs for this quarter yet. Use Bulk Import above to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {byArea.map(({ area, objs }) => {
            const collapsed = collapsedAreas.has(area.id)
            return (
              <div key={area.id} className="rounded-xl border border-white/10 overflow-hidden">
                {/* Area header */}
                <button
                  onClick={() => toggleArea(area.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/2 hover:bg-white/4 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-sm font-semibold text-white">{area.name}</span>
                    <span className="text-xs text-white/30">
                      {objs.length} obj · {objs.reduce((s, o) => s + o.key_results.length, 0)} KRs
                    </span>
                  </div>
                  {collapsed
                    ? <ChevronDown size={14} className="text-white/40 shrink-0" />
                    : <ChevronUp size={14} className="text-white/40 shrink-0" />}
                </button>

                {/* Objectives */}
                {!collapsed && (
                  <div className="divide-y divide-white/6">
                    {objs.map((obj, objIdx) => {
                      const coIdx = companyObjectives.findIndex(co => co.id === obj.aligned_to)
                      const isSaving = savingId === obj.id
                      const isSaved = savedId === obj.id

                      return (
                        <div key={obj.id} className="px-4 py-4 space-y-3">
                          {/* Objective header */}
                          <div className="flex items-center gap-2 text-xs font-bold text-white/25 uppercase tracking-wider">
                            <span>Objective {objIdx + 1}</span>
                            {isSaving && <Loader2 size={11} className="animate-spin text-white/30" />}
                            {isSaved && !isSaving && <span className="flex items-center gap-0.5 text-emerald-400 font-normal normal-case tracking-normal"><Check size={11} /> Saved</span>}
                          </div>

                          {/* Title */}
                          <Textarea
                            value={obj.title}
                            rows={2}
                            onChange={e => patchObjective(obj.id, { title: e.target.value })}
                            onBlur={e => saveObjectiveField(obj.id, { title: e.target.value })}
                            className="text-sm resize-none bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50"
                            placeholder="Objective title..."
                          />

                          {/* Controls row */}
                          <div className="flex flex-wrap gap-2 items-center">
                            {/* Move to area */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs text-white/40 shrink-0">Area:</span>
                              <Select
                                value={obj.area_id}
                                onValueChange={val => reassignArea(obj.id, val)}
                              >
                                <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {areas.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <span className="text-white/15 text-xs">·</span>

                            {/* Aligned to */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs text-white/40 shrink-0">Aligned to:</span>
                              <Select
                                value={obj.aligned_to ?? 'none'}
                                onValueChange={val => {
                                  const v = val === 'none' ? null : val
                                  patchObjective(obj.id, { aligned_to: v })
                                  saveObjectiveField(obj.id, { aligned_to: v })
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white w-48">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Not aligned</SelectItem>
                                  {companyObjectives.map((co, i) => (
                                    <SelectItem key={co.id} value={co.id}>
                                      CO{i + 1}: {co.title.slice(0, 40)}{co.title.length > 40 ? '…' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {coIdx >= 0 && (
                                <span className={cn('text-xs px-1.5 py-0.5 rounded border font-bold shrink-0', ALIGNMENT_COLORS[coIdx])}>
                                  CO{coIdx + 1}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Key Results */}
                          <div className="space-y-2 pl-3 border-l border-white/8 mt-1">
                            {obj.key_results.map((kr, krIdx) => {
                              const krSaving = savingId === kr.id
                              const krSaved = savedId === kr.id
                              return (
                                <div key={kr.id} className="p-3 rounded-lg bg-white/3 border border-white/6 space-y-2">
                                  <div className="flex items-center gap-1.5 text-xs text-white/25 font-semibold">
                                    <span>KR {krIdx + 1}</span>
                                    {krSaving && <Loader2 size={10} className="animate-spin text-white/30" />}
                                    {krSaved && !krSaving && <span className="flex items-center gap-0.5 text-emerald-400 font-normal"><Check size={10} /> Saved</span>}
                                    <button
                                      onClick={() => deleteKR(obj.id, kr.id)}
                                      className="ml-auto text-white/15 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>

                                  <Textarea
                                    value={kr.description}
                                    rows={2}
                                    onChange={e => patchKR(obj.id, kr.id, { description: e.target.value })}
                                    onBlur={e => saveKRField(kr.id, { description: e.target.value })}
                                    className="text-xs resize-none bg-white/5 border-white/8 text-white focus:border-[#FF5A70]/50"
                                    placeholder="Key result description..."
                                  />

                                  <div className="flex gap-2 flex-wrap">
                                    <div className="flex-1 min-w-[90px]">
                                      <label className="text-xs text-white/30 mb-1 block">Target</label>
                                      <Input
                                        type="number"
                                        value={kr.target_value}
                                        onChange={e => patchKR(obj.id, kr.id, { target_value: parseFloat(e.target.value) || 0 })}
                                        onBlur={e => saveKRField(kr.id, { target_value: parseFloat(e.target.value) || 0 })}
                                        className="h-7 text-xs bg-white/5 border-white/8 text-white focus:border-[#FF5A70]/50"
                                      />
                                    </div>
                                    <div className="w-24">
                                      <label className="text-xs text-white/30 mb-1 block">Unit</label>
                                      <Input
                                        value={kr.unit ?? ''}
                                        onChange={e => patchKR(obj.id, kr.id, { unit: e.target.value || null })}
                                        onBlur={e => saveKRField(kr.id, { unit: e.target.value || null })}
                                        className="h-7 text-xs bg-white/5 border-white/8 text-white focus:border-[#FF5A70]/50"
                                        placeholder="%, $, …"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                      <label className="text-xs text-white/30 mb-1 block">Owner</label>
                                      <Select
                                        value={kr.owner_id ?? 'none'}
                                        onValueChange={val => {
                                          const v = val === 'none' ? null : val
                                          patchKR(obj.id, kr.id, { owner_id: v })
                                          saveKRField(kr.id, { owner_id: v })
                                        }}
                                      >
                                        <SelectTrigger className="h-7 text-xs bg-white/5 border-white/8 text-white">
                                          <SelectValue placeholder="Unassigned" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">Unassigned</SelectItem>
                                          {profiles.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                              {p.full_name ?? p.email ?? p.id.slice(0, 8)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}

                            <button
                              onClick={() => addKR(obj)}
                              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-[#FF5A70] transition-colors py-1"
                            >
                              <PlusCircle size={12} /> Add key result
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
