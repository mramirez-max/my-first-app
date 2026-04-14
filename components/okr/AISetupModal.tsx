'use client'

import { useState } from 'react'
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
import { CompanyObjective } from '@/types'
import { type AreaKROption } from '@/components/executive/MyTeamClient'
import { createClient } from '@/lib/supabase/client'
import { ObjectiveProposal, KRProposal } from '@/app/api/ai-okr/route'
import { Sparkles, Check, AlertCircle, Loader2, Link2, Unlink, PlusCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AISetupModalProps {
  open: boolean
  onClose: () => void
  type?: 'area' | 'team'
  areaId: string
  areaName: string
  companyObjectives: Pick<CompanyObjective, 'id' | 'title'>[]
  areaKRs?: AreaKROption[]
  quarter: number
  year: number
  onSuccess: () => void
}

type Step = 'prompt' | 'generating' | 'preview' | 'saving'

export default function AISetupModal({
  open,
  onClose,
  type = 'area',
  areaId,
  areaName,
  companyObjectives,
  areaKRs,
  quarter,
  year,
  onSuccess,
}: AISetupModalProps) {
  // For team type, format KRs as alignment options for the AI prompt
  const alignmentOptions: Pick<CompanyObjective, 'id' | 'title'>[] = type === 'team' && areaKRs?.length
    ? areaKRs.map(kr => ({ id: kr.id, title: `${kr.objectiveTitle} → ${kr.description}` }))
    : companyObjectives
  const supabase = createClient()

  const [step, setStep] = useState<Step>('prompt')
  const [promptText, setPromptText] = useState('')
  const [objectives, setObjectives] = useState<ObjectiveProposal[]>([])
  const [error, setError] = useState<string | null>(null)

  const coMap = Object.fromEntries(companyObjectives.map(co => [co.id, co.title]))

  async function handleGenerate() {
    if (!promptText.trim()) return
    setStep('generating')
    setError(null)

    try {
      const res = await fetch('/api/ai-okr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          areaName,
          companyObjectives: alignmentOptions,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate OKRs')
      setObjectives(data.objectives ?? [])
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('prompt')
    }
  }

  async function handleSave() {
    setStep('saving')
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setStep('preview'); return }

    const objTable = type === 'team' ? 'team_objectives' : 'area_objectives'
    const krTable = type === 'team' ? 'team_key_results' : 'area_key_results'

    try {
      for (const obj of objectives) {
        // Insert objective
        const { data: newObj, error: objErr } = await supabase
          .from(objTable)
          .insert({
            area_id: areaId,
            title: obj.title,
            aligned_to: obj.aligned_to || null,
            quarter,
            year,
            created_by: user.id,
          })
          .select('id')
          .single()

        if (objErr) throw new Error(objErr.message)

        // Insert key results
        for (const kr of obj.key_results) {
          const { error: krErr } = await supabase.from(krTable).insert({
            objective_id: newObj.id,
            description: kr.description,
            target_value: kr.target_value,
            current_value: 0,
            unit: kr.unit || null,
            owner_id: user.id,
          })
          if (krErr) throw new Error(krErr.message)
        }
      }

      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OKRs')
      setStep('preview')
    }
  }

  function handleClose() {
    setStep('prompt')
    setPromptText('')
    setObjectives([])
    setError(null)
    onClose()
  }

  function updateObjective(i: number, field: keyof ObjectiveProposal, value: string | null) {
    setObjectives(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o))
  }

  function updateKR(objIdx: number, krIdx: number, field: keyof KRProposal, value: string | number | null) {
    setObjectives(prev => prev.map((o, i) => i !== objIdx ? o : {
      ...o,
      key_results: o.key_results.map((kr, j) => j !== krIdx ? kr : { ...kr, [field]: value }),
    }))
  }

  function addKR(objIdx: number) {
    setObjectives(prev => prev.map((o, i) => i !== objIdx ? o : {
      ...o,
      key_results: [...o.key_results, { description: '', target_value: 0, unit: null }],
    }))
  }

  function removeKR(objIdx: number, krIdx: number) {
    setObjectives(prev => prev.map((o, i) => i !== objIdx ? o : {
      ...o,
      key_results: o.key_results.filter((_, j) => j !== krIdx),
    }))
  }

  const totalKRs = objectives.reduce((sum, o) => sum + o.key_results.length, 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1c1540] border-white/10">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FF5A70]/15 flex items-center justify-center">
              <Sparkles size={16} className="text-[#FF5A70]" />
            </div>
            <div>
              <DialogTitle className="text-white">Generate OKRs with AI</DialogTitle>
              <DialogDescription className="text-xs text-white/50 mt-0.5">
                Describe your goals for {areaName} — Claude will structure them into OKRs aligned to company objectives
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step: Prompt */}
        {step === 'prompt' && (
          <div className="space-y-4 mt-2">
            {/* Company objectives hint */}
            {alignmentOptions.length > 0 && (
              <div className="text-xs text-white/50 bg-white/5 rounded-lg p-3 space-y-1">
                <p className="font-medium text-white/70 mb-1">{type === 'team' ? 'Area key results this quarter:' : 'Company objectives this quarter:'}</p>
                {alignmentOptions.map((co, i) => (
                  <div key={co.id} className="flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A70] mt-1.5 shrink-0" />
                    <span>{co.title}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-white/70">
                What are your OKRs for {areaName} this quarter?
              </p>
              <Textarea
                placeholder={`Write freely — rough notes, bullet points, or structured OKRs. For example:\n\n"I want to scale our operations to handle 25k workers. We need to cut onboarding time to under 3 days and reduce support tickets by 30%. Also want to improve SLA compliance to 98%."`}
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                rows={8}
                className="text-sm resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
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
                disabled={!promptText.trim()}
                className="flex-1 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
              >
                <Sparkles size={14} />
                Generate OKRs
              </Button>
            </div>
          </div>
        )}

        {/* Step: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FF5A70]/15 flex items-center justify-center">
              <Loader2 size={28} className="text-[#FF5A70] animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Structuring your OKRs...</p>
              <p className="text-sm text-white/50 mt-1">
                Claude is reading your goals and aligning them to company objectives
              </p>
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
                <Sparkles size={10} /> {objectives.length} objective{objectives.length !== 1 ? 's' : ''} · {totalKRs} KRs
              </Badge>
            </div>

            <div className="space-y-5">
              {objectives.map((obj, objIdx) => (
                <div key={objIdx} className="border border-white/8 rounded-xl p-4 space-y-4 bg-white/3">
                  {/* Objective title */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-white/40 uppercase tracking-wide">Objective {objIdx + 1}</p>
                    <Input
                      value={obj.title}
                      onChange={e => updateObjective(objIdx, 'title', e.target.value)}
                      className="text-sm font-semibold bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50"
                    />
                  </div>

                  {/* Company alignment */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-white/40 flex items-center gap-1">
                      <Link2 size={11} /> Aligned to {type === 'team' ? 'area' : 'company'} objective
                    </p>
                    <div className="space-y-1.5">
                      {alignmentOptions.map(co => {
                        const selected = obj.aligned_to === co.id
                        return (
                          <button
                            key={co.id}
                            type="button"
                            onClick={() => updateObjective(objIdx, 'aligned_to', selected ? null : co.id)}
                            className={cn(
                              'w-full text-left text-xs px-3 py-2 rounded-lg border transition-all',
                              selected
                                ? 'border-[#FF5A70]/50 bg-[#FF5A70]/10 text-white'
                                : 'border-white/8 bg-white/3 text-white/50 hover:border-white/20 hover:text-white/70'
                            )}
                          >
                            {selected && <span className="text-[#FF5A70] mr-1.5">✓</span>}
                            {co.title}
                          </button>
                        )
                      })}
                      {obj.aligned_to && (
                        <button
                          type="button"
                          onClick={() => updateObjective(objIdx, 'aligned_to', null)}
                          className="flex items-center gap-1 text-xs text-white/30 hover:text-white/50"
                        >
                          <Unlink size={11} /> Clear alignment
                        </button>
                      )}
                    </div>
                    {obj.reasoning && (
                      <p className="text-xs text-white/40 italic mt-1">{obj.reasoning}</p>
                    )}
                  </div>

                  {/* Key results */}
                  <div className="space-y-2">
                    <p className="text-xs text-white/40 uppercase tracking-wide">Key Results</p>
                    {obj.key_results.map((kr, krIdx) => (
                      <div key={krIdx} className="flex items-start gap-2 bg-white/3 border border-white/5 rounded-lg p-3">
                        <div className="flex-1 space-y-2">
                          <Input
                            value={kr.description}
                            onChange={e => updateKR(objIdx, krIdx, 'description', e.target.value)}
                            placeholder="KR description"
                            className="text-xs bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50 h-8"
                          />
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              step="any"
                              value={kr.target_value}
                              onChange={e => updateKR(objIdx, krIdx, 'target_value', parseFloat(e.target.value) || 0)}
                              placeholder="Target"
                              className="text-xs bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50 h-8 w-28"
                            />
                            <Input
                              value={kr.unit ?? ''}
                              onChange={e => updateKR(objIdx, krIdx, 'unit', e.target.value || null)}
                              placeholder="Unit (%, $, workers…)"
                              className="text-xs bg-white/5 border-white/10 text-white focus:border-[#FF5A70]/50 h-8 flex-1"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeKR(objIdx, krIdx)}
                          className="mt-1 text-white/20 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addKR(objIdx)}
                      className="flex items-center gap-1 text-xs text-white/30 hover:text-[#FF5A70] transition-colors"
                    >
                      <PlusCircle size={12} /> Add key result
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded flex items-center gap-1.5">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep('prompt')}
                className="flex-1 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
              >
                Edit prompt
              </Button>
              <Button
                onClick={handleSave}
                disabled={objectives.length === 0}
                className="flex-1 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
              >
                <Check size={14} />
                Save {objectives.length} Objective{objectives.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 size={28} className="text-[#FF5A70] animate-spin" />
            <p className="text-sm text-white/60">Saving OKRs...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
