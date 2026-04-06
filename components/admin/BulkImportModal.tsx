'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Area, CompanyObjective } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { BulkAreaInput, BulkObjectiveInput, BulkImportResult } from '@/app/api/ai-bulk-import/route'
import {
  Upload, FileText, Sparkles, Check, AlertCircle,
  Loader2, ChevronDown, ChevronUp, PlusCircle, Trash2, GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BulkImportModalProps {
  open: boolean
  onClose: () => void
  areas: Area[]
  companyObjectives: CompanyObjective[]
  quarter: number
  year: number
  onSuccess: () => void
}

type Step = 'input' | 'generating' | 'preview' | 'saving' | 'done'
type InputMode = 'pdf' | 'text'

const ALIGNMENT_COLORS = [
  'border-[#FF5A70]/40 text-[#FF5A70] bg-[#FF5A70]/10',
  'border-[#6364BF]/40 text-[#6364BF] bg-[#6364BF]/10',
  'border-[#883883]/40 text-[#883883] bg-[#883883]/10',
]

export default function BulkImportModal({
  open,
  onClose,
  areas,
  companyObjectives,
  quarter,
  year,
  onSuccess,
}: BulkImportModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('input')
  const [inputMode, setInputMode] = useState<InputMode>('text')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [importData, setImportData] = useState<BulkAreaInput[]>([])
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [dragging, setDragging] = useState<{ areaIdx: number; objIdx: number } | null>(null)
  const [dragOverArea, setDragOverArea] = useState<number | null>(null)

  const areaNames = areas.map(a => a.name)
  const coTitles = companyObjectives.map(o => o.title)

  function handleFileSelect(file: File) {
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return }
    setError(null)
    setPdfFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  function toggleArea(areaName: string) {
    setExpandedAreas(prev => {
      const next = new Set(prev)
      next.has(areaName) ? next.delete(areaName) : next.add(areaName)
      return next
    })
  }

  function expandAll() {
    setExpandedAreas(new Set(importData.map(a => a.areaName)))
  }

  function collapseAll() {
    setExpandedAreas(new Set())
  }

  function updateObjectiveTitle(areaIdx: number, objIdx: number, title: string) {
    setImportData(prev => prev.map((area, ai) =>
      ai !== areaIdx ? area : {
        ...area,
        objectives: area.objectives.map((obj, oi) => oi !== objIdx ? obj : { ...obj, title }),
      }
    ))
  }

  function updateObjectiveAlignment(areaIdx: number, objIdx: number, val: string) {
    const alignedToIndex = val === 'none' ? null : parseInt(val)
    setImportData(prev => prev.map((area, ai) =>
      ai !== areaIdx ? area : {
        ...area,
        objectives: area.objectives.map((obj, oi) => oi !== objIdx ? obj : { ...obj, alignedToIndex }),
      }
    ))
  }

  function updateKR(areaIdx: number, objIdx: number, krIdx: number, field: string, value: string | number) {
    setImportData(prev => prev.map((area, ai) =>
      ai !== areaIdx ? area : {
        ...area,
        objectives: area.objectives.map((obj, oi) =>
          oi !== objIdx ? obj : {
            ...obj,
            keyResults: obj.keyResults.map((kr, ki) =>
              ki !== krIdx ? kr : { ...kr, [field]: value }
            ),
          }
        ),
      }
    ))
  }

  function removeKR(areaIdx: number, objIdx: number, krIdx: number) {
    setImportData(prev => prev.map((area, ai) =>
      ai !== areaIdx ? area : {
        ...area,
        objectives: area.objectives.map((obj, oi) =>
          oi !== objIdx ? obj : {
            ...obj,
            keyResults: obj.keyResults.filter((_, ki) => ki !== krIdx),
          }
        ),
      }
    ))
  }

  function addKR(areaIdx: number, objIdx: number) {
    setImportData(prev => prev.map((area, ai) =>
      ai !== areaIdx ? area : {
        ...area,
        objectives: area.objectives.map((obj, oi) =>
          oi !== objIdx ? obj : {
            ...obj,
            keyResults: [
              ...obj.keyResults,
              { description: '', originalDescription: '', targetValue: 100, currentValue: 0, unit: '' },
            ],
          }
        ),
      }
    ))
  }

  function moveObjective(fromAreaIdx: number, objIdx: number, toAreaName: string) {
    if (importData[fromAreaIdx].areaName === toAreaName) return
    setImportData(prev => {
      const next = prev.map(a => ({ ...a, objectives: [...a.objectives] }))
      const [obj] = next[fromAreaIdx].objectives.splice(objIdx, 1)
      const toIdx = next.findIndex(a => a.areaName === toAreaName)
      if (toIdx >= 0) {
        next[toIdx].objectives.push(obj)
        setExpandedAreas(e => new Set([...e, toAreaName]))
      }
      return next
    })
  }

  function handleDragStart(areaIdx: number, objIdx: number) {
    setDragging({ areaIdx, objIdx })
  }

  function handleDropOnArea(toAreaIdx: number) {
    if (dragging) moveObjective(dragging.areaIdx, dragging.objIdx, importData[toAreaIdx].areaName)
    setDragging(null)
    setDragOverArea(null)
  }

  async function handleGenerate() {
    if (inputMode === 'pdf' && !pdfFile) return
    if (inputMode === 'text' && !pastedText.trim()) return
    setStep('generating')
    setError(null)

    const formData = new FormData()
    if (inputMode === 'pdf' && pdfFile) formData.append('pdf', pdfFile)
    if (inputMode === 'text') formData.append('text', pastedText)
    formData.append('areas', JSON.stringify(areaNames))
    formData.append('companyObjectives', JSON.stringify(coTitles))
    formData.append('quarter', String(quarter))
    formData.append('year', String(year))

    try {
      const res = await fetch('/api/ai-bulk-import', { method: 'POST', body: formData })
      const data: BulkImportResult = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed')

      // Merge with all areas (some may be missing from the doc)
      const byName = Object.fromEntries(data.areas.map(a => [a.areaName, a]))
      const merged = areas.map(area => byName[area.name] ?? { areaName: area.name, objectives: [] })
      setImportData(merged)
      setExpandedAreas(new Set(merged.filter(a => a.objectives.length > 0).map(a => a.areaName)))
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('input')
    }
  }

  async function handleSave() {
    setStep('saving')
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setStep('preview'); return }

    let count = 0
    try {
      for (const areaData of importData) {
        if (areaData.objectives.length === 0) continue

        const area = areas.find(a => a.name === areaData.areaName)
        if (!area) continue

        for (const obj of areaData.objectives) {
          if (!obj.title.trim()) continue

          const alignedTo = obj.alignedToIndex !== null
            ? companyObjectives[obj.alignedToIndex]?.id ?? null
            : null

          const { data: createdObj, error: objErr } = await supabase
            .from('area_objectives')
            .insert({
              area_id: area.id,
              title: obj.title,
              quarter,
              year,
              aligned_to: alignedTo,
              created_by: user.id,
            })
            .select('id')
            .single()

          if (objErr || !createdObj) continue

          for (const kr of obj.keyResults) {
            if (!kr.description.trim()) continue
            await supabase.from('area_key_results').insert({
              objective_id: createdObj.id,
              description: kr.description,
              target_value: kr.targetValue,
              current_value: kr.currentValue,
              unit: kr.unit || null,
              owner_id: user.id,
            })
          }

          count++
        }
      }
      setSavedCount(count)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setStep('preview')
    }
  }

  function handleClose() {
    if (step === 'done') onSuccess()
    setStep('input')
    setPdfFile(null)
    setPastedText('')
    setImportData([])
    setExpandedAreas(new Set())
    setError(null)
    onClose()
  }

  const totalObjectives = importData.reduce((s, a) => s + a.objectives.length, 0)
  const totalKRs = importData.reduce((s, a) => s + a.objectives.reduce((ss, o) => ss + o.keyResults.length, 0), 0)
  const areasWithData = importData.filter(a => a.objectives.length > 0).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl w-full max-h-[92vh] overflow-y-auto overflow-x-hidden bg-[#1c1540] border-white/10 p-8">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF5A70]/15 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-[#FF5A70]" />
            </div>
            <div>
              <DialogTitle className="text-white">Bulk Import Area OKRs</DialogTitle>
              <DialogDescription className="text-xs text-white/50 mt-0.5">
                Q{quarter} {year} · Claude will structure OKRs for all {areas.length} areas
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── INPUT STEP ── */}
        {step === 'input' && (
          <div className="space-y-6 mt-2">
            {/* Mode toggle */}
            <div className="flex gap-2 p-1.5 bg-white/5 rounded-xl">
              <button
                onClick={() => setInputMode('text')}
                className={cn('flex-1 text-sm py-2.5 rounded-lg font-medium transition-colors',
                  inputMode === 'text' ? 'bg-[#FF5A70] text-white' : 'text-white/50 hover:text-white')}
              >
                Paste Text
              </button>
              <button
                onClick={() => setInputMode('pdf')}
                className={cn('flex-1 text-sm py-2.5 rounded-lg font-medium transition-colors',
                  inputMode === 'pdf' ? 'bg-[#FF5A70] text-white' : 'text-white/50 hover:text-white')}
              >
                Upload PDF
              </button>
            </div>

            {inputMode === 'text' ? (
              <div className="space-y-3">
                <p className="text-sm text-white/50 leading-relaxed">
                  Paste your OKR document — Notion export, Google Doc text, meeting notes, spreadsheet content, etc.
                  Include area names and Claude will figure out the structure.
                </p>
                <Textarea
                  placeholder={`Example:\n\nOperations\n- Objective: Improve delivery efficiency\n  KR1: Reduce average delivery time to 3 days (currently 5)\n  KR2: Achieve 95% on-time rate\n\nRevenue\n- Objective: Hit $27.2M ARR...`}
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  rows={14}
                  className="w-full text-sm resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
                />
              </div>
            ) : (
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                  dragOver ? 'border-[#FF5A70] bg-[#FF5A70]/10' : 'border-white/15 hover:border-[#FF5A70]/50 hover:bg-white/4',
                  pdfFile ? 'border-[#FF5A70] bg-[#FF5A70]/10' : ''
                )}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                {pdfFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={32} className="text-[#FF5A70]" />
                    <p className="text-sm font-medium text-[#FF5A70]">{pdfFile.name}</p>
                    <p className="text-xs text-[#FF5A70]/70">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={32} className="text-white/20" />
                    <p className="text-sm font-medium text-white/60">Drop your OKR document here</p>
                    <p className="text-xs text-white/40">PDF · Strategic plan, OKR doc, quarterly review</p>
                  </div>
                )}
              </div>
            )}

            {/* Company OKR reference */}
            <div className="rounded-xl bg-white/4 border border-white/8 p-5 space-y-3">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                Claude will align areas to these company objectives
              </p>
              {coTitles.map((title, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded border font-bold shrink-0 mt-0.5', ALIGNMENT_COLORS[i])}>
                    CO{i + 1}
                  </span>
                  <span className="text-sm text-white/60 leading-relaxed">{title}</span>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2.5 rounded flex items-center gap-1.5">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1 h-11">Cancel</Button>
              <Button
                onClick={handleGenerate}
                disabled={inputMode === 'pdf' ? !pdfFile : !pastedText.trim()}
                className="flex-1 h-11 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
              >
                <Sparkles size={14} /> Generate with AI
              </Button>
            </div>
          </div>
        )}

        {/* ── GENERATING ── */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-14 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FF5A70]/15 flex items-center justify-center">
              <Loader2 size={28} className="text-[#FF5A70] animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Structuring OKRs for all areas...</p>
              <p className="text-sm text-white/50 mt-1">Claude is reading your document and organizing it by area</p>
            </div>
            <p className="text-xs text-white/30">This usually takes 20–40 seconds</p>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {step === 'preview' && (
          <div className="space-y-5 mt-2">
            {/* Summary bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1 text-xs bg-[#FF5A70]/10 text-[#FF5A70] border-0">
                  <Sparkles size={10} /> AI Generated
                </Badge>
                <span className="text-xs text-white/50">
                  {areasWithData} areas · {totalObjectives} objectives · {totalKRs} key results
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={expandAll} className="text-xs text-white/40 hover:text-white transition-colors">
                  Expand all
                </button>
                <span className="text-white/20">·</span>
                <button onClick={collapseAll} className="text-xs text-white/40 hover:text-white transition-colors">
                  Collapse all
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {importData.map((areaData, areaIdx) => {
                const isExpanded = expandedAreas.has(areaData.areaName)
                const hasData = areaData.objectives.length > 0
                const isDropTarget = dragOverArea === areaIdx && dragging?.areaIdx !== areaIdx

                return (
                  <div
                    key={areaData.areaName}
                    onDragOver={e => { e.preventDefault(); setDragOverArea(areaIdx) }}
                    onDragLeave={() => setDragOverArea(null)}
                    onDrop={() => handleDropOnArea(areaIdx)}
                    className={cn(
                      'rounded-xl border overflow-hidden transition-colors',
                      isDropTarget ? 'border-[#FF5A70]/50 bg-[#FF5A70]/5' :
                      hasData ? 'border-white/10 bg-gradient-to-br from-[#1c1540] to-[#23174B]' : 'border-white/5 bg-white/2'
                    )}
                  >
                    {/* Area header */}
                    <button
                      onClick={() => toggleArea(areaData.areaName)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/4 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          hasData ? 'bg-emerald-400' : 'bg-white/20'
                        )} />
                        <span className={cn('text-sm font-semibold', hasData ? 'text-white' : 'text-white/40')}>
                          {areaData.areaName}
                        </span>
                        {hasData && (
                          <span className="text-xs text-white/30">
                            {areaData.objectives.length} obj · {areaData.objectives.reduce((s, o) => s + o.keyResults.length, 0)} KRs
                          </span>
                        )}
                        {!hasData && <span className="text-xs text-white/25 italic">No OKRs found</span>}
                      </div>
                      {hasData && (isExpanded ? <ChevronUp size={14} className="text-white/40 shrink-0" /> : <ChevronDown size={14} className="text-white/40 shrink-0" />)}
                    </button>

                    {/* Area content */}
                    {isExpanded && hasData && (
                      <div className="px-4 pb-4 space-y-4 border-t border-white/8">
                        {areaData.objectives.map((obj, objIdx) => (
                          <div
                            key={objIdx}
                            draggable
                            onDragStart={() => handleDragStart(areaIdx, objIdx)}
                            onDragEnd={() => { setDragging(null); setDragOverArea(null) }}
                            className="pt-4 space-y-3"
                          >
                            {/* Objective row */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <GripVertical size={13} className="text-white/20 cursor-grab shrink-0" />
                                <span className="text-xs font-bold text-white/30 uppercase tracking-wider">
                                  Objective {objIdx + 1}
                                </span>
                              </div>
                              <Textarea
                                value={obj.title}
                                onChange={e => updateObjectiveTitle(areaIdx, objIdx, e.target.value)}
                                rows={2}
                                className="text-sm resize-none bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50"
                                placeholder="Objective title..."
                              />
                              {obj.originalTitle && obj.originalTitle !== obj.title && (
                                <div className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/3 border border-white/6">
                                  <span className="text-xs text-white/30 shrink-0 mt-0.5">Original:</span>
                                  <span className="text-xs text-white/40 flex-1 leading-relaxed">{obj.originalTitle}</span>
                                  <button
                                    onClick={() => updateObjectiveTitle(areaIdx, objIdx, obj.originalTitle)}
                                    className="text-xs text-white/30 hover:text-white shrink-0 underline underline-offset-2 transition-colors"
                                  >
                                    Use
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-white/40 shrink-0">Aligned to:</span>
                                <Select
                                  value={obj.alignedToIndex !== null ? String(obj.alignedToIndex) : 'none'}
                                  onValueChange={val => updateObjectiveAlignment(areaIdx, objIdx, val)}
                                >
                                  <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white flex-1 min-w-[140px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Not aligned</SelectItem>
                                    {companyObjectives.map((co, i) => (
                                      <SelectItem key={co.id} value={String(i)}>
                                        CO{i + 1}: {co.title.slice(0, 50)}{co.title.length > 50 ? '…' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {obj.alignedToIndex !== null && (
                                  <span className={cn('text-xs px-1.5 py-0.5 rounded border font-bold shrink-0', ALIGNMENT_COLORS[obj.alignedToIndex])}>
                                    CO{obj.alignedToIndex + 1}
                                  </span>
                                )}
                                <span className="text-xs text-white/20 shrink-0">·</span>
                                <span className="text-xs text-white/40 shrink-0">Move to:</span>
                                <Select
                                  value={areaData.areaName}
                                  onValueChange={toAreaName => moveObjective(areaIdx, objIdx, toAreaName)}
                                >
                                  <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white flex-1 min-w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {importData.map(a => (
                                      <SelectItem key={a.areaName} value={a.areaName}>
                                        {a.areaName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* KRs */}
                            <div className="space-y-2 pl-3 border-l border-white/8">
                              {obj.keyResults.map((kr, krIdx) => (
                                <div key={krIdx} className="space-y-2 p-3 rounded-lg bg-gradient-to-br from-[#1c1540] to-[#23174B] border border-white/8">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 space-y-1.5">
                                      <Label className="text-xs text-white/40">Key Result {krIdx + 1}</Label>
                                      <Textarea
                                        value={kr.description}
                                        onChange={e => updateKR(areaIdx, objIdx, krIdx, 'description', e.target.value)}
                                        rows={2}
                                        className="text-xs resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
                                        placeholder="KR description..."
                                      />
                                      {kr.originalDescription && kr.originalDescription !== kr.description && (
                                        <div className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/3 border border-white/6">
                                          <span className="text-xs text-white/30 shrink-0 mt-0.5">Original:</span>
                                          <span className="text-xs text-white/40 flex-1 leading-relaxed">{kr.originalDescription}</span>
                                          <button
                                            onClick={() => updateKR(areaIdx, objIdx, krIdx, 'description', kr.originalDescription)}
                                            className="text-xs text-white/30 hover:text-white shrink-0 underline underline-offset-2 transition-colors"
                                          >
                                            Use
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => removeKR(areaIdx, objIdx, krIdx)}
                                      className="text-white/20 hover:text-red-400 transition-colors shrink-0 mt-5"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="flex-1 space-y-1">
                                      <Label className="text-xs text-white/40">Target value</Label>
                                      <Input
                                        type="number"
                                        value={kr.targetValue}
                                        onChange={e => updateKR(areaIdx, objIdx, krIdx, 'targetValue', parseFloat(e.target.value) || 0)}
                                        className="h-8 text-xs bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50"
                                        placeholder="e.g. 1000"
                                      />
                                    </div>
                                    <div className="w-32 space-y-1">
                                      <Label className="text-xs text-white/40">Unit</Label>
                                      <Input
                                        value={kr.unit}
                                        onChange={e => updateKR(areaIdx, objIdx, krIdx, 'unit', e.target.value)}
                                        className="h-8 text-xs bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50"
                                        placeholder="e.g. %, $, users"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button
                                onClick={() => addKR(areaIdx, objIdx)}
                                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-[#FF5A70] transition-colors py-1"
                              >
                                <PlusCircle size={12} /> Add key result
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2.5 rounded flex items-center gap-1.5">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <div className="flex gap-3 pt-3 border-t border-white/8">
              <Button variant="outline" onClick={() => setStep('input')} className="flex-1 h-11">
                Start over
              </Button>
              <Button
                onClick={handleSave}
                disabled={totalObjectives === 0}
                className="flex-1 h-11 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
              >
                <Check size={14} />
                Save {totalObjectives} Objective{totalObjectives !== 1 ? 's' : ''} to DB
              </Button>
            </div>
          </div>
        )}

        {/* ── SAVING ── */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center py-14 space-y-3">
            <Loader2 size={28} className="text-[#FF5A70] animate-spin" />
            <p className="text-sm text-white/60">Saving to database...</p>
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
              <Check size={28} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">OKRs imported successfully!</p>
              <p className="text-sm text-white/50 mt-1">
                {savedCount} objective{savedCount !== 1 ? 's' : ''} saved across {areasWithData} area{areasWithData !== 1 ? 's' : ''} for Q{quarter} {year}
              </p>
            </div>
            <p className="text-xs text-white/40 max-w-sm">
              Area leads can now go into their respective pages to review, adjust, and add weekly updates.
            </p>
            <Button onClick={handleClose} className="bg-[#FF5A70] hover:bg-[#ff3f58] text-white px-8">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
