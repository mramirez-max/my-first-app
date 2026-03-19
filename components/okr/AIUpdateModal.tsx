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
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AreaObjective, calcProgress } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { KRInput, KRUpdate } from '@/app/api/ai-update/route'
import { Upload, FileText, Sparkles, Check, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIUpdateModalProps {
  open: boolean
  onClose: () => void
  areaName: string
  objectives: AreaObjective[]
  onSuccess: () => void
}

type Step = 'upload' | 'generating' | 'preview' | 'saving'

const CONFIDENCE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Off track', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  2: { label: 'At risk', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  3: { label: 'Cautious', color: 'text-yellow-300 bg-yellow-400/10 border-yellow-400/30' },
  4: { label: 'Good', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  5: { label: 'On track', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
}

export default function AIUpdateModal({
  open,
  onClose,
  areaName,
  objectives,
  onSuccess,
}: AIUpdateModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [updates, setUpdates] = useState<KRUpdate[]>([])
  const [error, setError] = useState<string | null>(null)

  // Flatten all KRs from all objectives
  const allKRs: KRInput[] = objectives.flatMap(obj =>
    (obj.key_results ?? []).map(kr => ({
      id: kr.id,
      description: kr.description,
      current_value: kr.current_value,
      target_value: kr.target_value,
      unit: kr.unit,
      objective_title: obj.title,
    }))
  )

  // Build a lookup map: KR id → KR details
  const krMap = Object.fromEntries(allKRs.map(kr => [kr.id, kr]))

  function handleFileSelect(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }
    setError(null)
    setPdfFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  async function handleGenerate() {
    if (!pdfFile) return
    setStep('generating')
    setError(null)

    const formData = new FormData()
    formData.append('pdf', pdfFile)
    formData.append('krs', JSON.stringify(allKRs))
    formData.append('areaName', areaName)

    try {
      const res = await fetch('/api/ai-update', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to generate updates')
      }

      setUpdates(data.updates)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('upload')
    }
  }

  async function handleSave() {
    setStep('saving')
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setStep('preview'); return }

    const weekDate = new Date()
    weekDate.setDate(weekDate.getDate() - weekDate.getDay() + 1)
    const week_date = weekDate.toISOString().split('T')[0]

    try {
      for (const update of updates) {
        // Insert weekly update
        await supabase.from('area_kr_updates').insert({
          key_result_id: update.keyResultId,
          update_text: update.updateText,
          confidence_score: update.confidenceScore,
          current_value: update.currentValue,
          created_by: user.id,
          week_date,
        })

        // Update the KR's current value
        await supabase
          .from('area_key_results')
          .update({ current_value: update.currentValue })
          .eq('id', update.keyResultId)
      }

      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save updates')
      setStep('preview')
    }
  }

  function handleClose() {
    setStep('upload')
    setPdfFile(null)
    setUpdates([])
    setError(null)
    onClose()
  }

  function updateField(krId: string, field: keyof KRUpdate, value: string | number) {
    setUpdates(prev =>
      prev.map(u => (u.keyResultId === krId ? { ...u, [field]: value } : u))
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden bg-[#1c1540] border-white/10">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FF5A70]/15 flex items-center justify-center">
              <Sparkles size={16} className="text-[#FF5A70]" />
            </div>
            <div>
              <DialogTitle className="text-white">AI Weekly Update</DialogTitle>
              <DialogDescription className="text-xs text-white/50 mt-0.5">
                Upload a PDF report and Claude will generate updates for all {areaName} key results
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4 mt-2">
            {allKRs.length === 0 ? (
              <div className="text-center py-8 text-white/40">
                <AlertCircle size={32} className="mx-auto mb-2 text-white/20" />
                <p className="text-sm">No key results found. Add some KRs first.</p>
              </div>
            ) : (
              <>
                <div className="text-xs text-white/50 bg-white/5 rounded-lg p-3">
                  <p className="font-medium text-white/70 mb-1">Will generate updates for {allKRs.length} key results:</p>
                  <ul className="space-y-0.5">
                    {allKRs.map(kr => (
                      <li key={kr.id} className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A70] mt-1.5 shrink-0" />
                        <span className="break-words">{kr.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Drop zone */}
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
                      <p className="text-xs text-[#FF5A70]/70">
                        {(pdfFile.size / 1024 / 1024).toFixed(2)} MB · Click to change
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={32} className="text-white/20" />
                      <p className="text-sm font-medium text-white/60">Drop your PDF here</p>
                      <p className="text-xs text-white/40">or click to browse · Weekly report, meeting notes, etc.</p>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded flex items-center gap-1.5">
                    <AlertCircle size={14} /> {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={!pdfFile}
                    className="flex-1 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
                  >
                    <Sparkles size={14} />
                    Generate with AI
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FF5A70]/15 flex items-center justify-center">
              <Loader2 size={28} className="text-[#FF5A70] animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Analyzing your document...</p>
              <p className="text-sm text-white/50 mt-1">
                Claude is reading the PDF and generating updates for {allKRs.length} key results
              </p>
            </div>
            <div className="w-full max-w-xs space-y-1 pt-2">
              <p className="text-xs text-white/40 text-center">This usually takes 15–30 seconds</p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/70">
                Review and edit before saving
              </p>
              <Badge variant="secondary" className="gap-1 text-xs bg-[#FF5A70]/10 text-[#FF5A70] border-0">
                <Sparkles size={10} /> AI Generated
              </Badge>
            </div>

            <div className="space-y-4">
              {updates.map(update => {
                const kr = krMap[update.keyResultId]
                if (!kr) return null
                const progress = calcProgress(update.currentValue, kr.target_value)
                const conf = CONFIDENCE_LABELS[update.confidenceScore]

                return (
                  <div key={update.keyResultId} className="border border-white/8 rounded-xl p-4 space-y-3 bg-gradient-to-br from-[#1c1540] to-[#23174B]">
                    {/* KR header */}
                    <div>
                      <p className="text-xs text-white/40 mb-0.5">{kr.objective_title}</p>
                      <p className="text-sm font-semibold text-white">{kr.description}</p>
                    </div>

                    {/* Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-white/40">
                        <span>
                          {update.currentValue.toLocaleString()}
                          {kr.unit ? ` ${kr.unit}` : ''} / {kr.target_value.toLocaleString()}
                          {kr.unit ? ` ${kr.unit}` : ''}
                        </span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    {/* Confidence + current value — stacked to avoid overflow */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs text-white/50">Confidence</p>
                        <div className="flex gap-1 flex-wrap">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => updateField(update.keyResultId, 'confidenceScore', n)}
                              className={cn(
                                'w-8 h-8 rounded text-xs font-bold border transition-colors',
                                update.confidenceScore === n
                                  ? 'bg-[#FF5A70] text-white border-[#FF5A70]'
                                  : 'bg-white/5 text-white/40 border-white/10 hover:border-[#FF5A70]/50'
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/50 mb-1">Current value</p>
                        <Input
                          type="number"
                          step="any"
                          value={update.currentValue}
                          onChange={e =>
                            updateField(update.keyResultId, 'currentValue', parseFloat(e.target.value) || 0)
                          }
                          className="h-8 text-sm bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50"
                        />
                      </div>
                    </div>

                    <p className={cn('text-xs px-2 py-1.5 rounded border break-words leading-relaxed', conf.color)}>
                      <span className="font-medium">{conf.label}</span> · {update.reasoning}
                    </p>

                    {/* Update text */}
                    <div className="space-y-1">
                      <p className="text-xs text-white/50">Update text</p>
                      <Textarea
                        value={update.updateText}
                        onChange={e =>
                          updateField(update.keyResultId, 'updateText', e.target.value)
                        }
                        rows={3}
                        className="text-sm resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded flex items-center gap-1.5">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep('upload')}
                className="flex-1 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
              >
                Start over
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
              >
                <Check size={14} />
                Save {updates.length} Update{updates.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 size={28} className="text-[#FF5A70] animate-spin" />
            <p className="text-sm text-white/60">Saving updates...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
