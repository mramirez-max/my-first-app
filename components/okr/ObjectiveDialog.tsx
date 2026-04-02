'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { AreaObjective, CompanyObjective, getCurrentQuarter } from '@/types'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ObjectiveDialogProps {
  open: boolean
  onClose: () => void
  type: 'area' | 'company'
  existing?: AreaObjective | CompanyObjective
  companyObjectives?: CompanyObjective[]
  areaId?: string
  initialTitle?: string
  onSuccess: () => void
}

export default function ObjectiveDialog({
  open,
  onClose,
  type,
  existing,
  companyObjectives,
  areaId,
  initialTitle,
  onSuccess,
}: ObjectiveDialogProps) {
  const supabase = createClient()
  const { quarter, year } = getCurrentQuarter()

  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? '')
  const [alignedTo, setAlignedTo] = useState<string | null>(
    (existing as AreaObjective)?.aligned_to ?? null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTitle(existing?.title ?? initialTitle ?? '')
    setAlignedTo((existing as AreaObjective)?.aligned_to ?? null)
  }, [existing, open, initialTitle])

  const table = type === 'area' ? 'area_objectives' : 'company_objectives'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }

    const payload: Record<string, unknown> = {
      title,
      quarter,
      year,
      created_by: user.id,
    }

    if (type === 'area') {
      payload.area_id = areaId
      payload.aligned_to = alignedTo ?? null
    }

    let err
    if (existing) {
      const { error: e } = await supabase.from(table)
        .update({ title, ...(type === 'area' ? { aligned_to: alignedTo } : {}) })
        .eq('id', existing.id)
      err = e
    } else {
      const { error: e } = await supabase.from(table).insert(payload)
      err = e
    }

    if (err) { setError(err.message); setLoading(false); return }

    setLoading(false)
    onSuccess()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-[#1c1540] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">{existing ? 'Edit Objective' : 'Add Objective'}</DialogTitle>
          {type === 'area' && !existing && (
            <DialogDescription className="text-white/50">
              Link your objective to a company goal so it shows up in the cascade view.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">

          {/* Step 1: Align to company objective (area only) */}
          {type === 'area' && companyObjectives && companyObjectives.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-white/70">
                Which company objective does this support?
              </Label>
              <div className="space-y-2">
                {companyObjectives.map((co, i) => {
                  const selected = alignedTo === co.id
                  const selectedColors = [
                    'border-[#FF5A70] bg-[#FF5A70]/10 text-white',
                    'border-[#FF5A70] bg-[#FF5A70]/10 text-white',
                    'border-[#FF5A70] bg-[#FF5A70]/10 text-white',
                  ]
                  const selectedColor = selectedColors[i % selectedColors.length]
                  return (
                    <button
                      key={co.id}
                      type="button"
                      onClick={() => setAlignedTo(selected ? null : co.id)}
                      className={cn(
                        'w-full text-left flex items-start gap-3 p-3 rounded-lg border-2 transition-all',
                        selected
                          ? selectedColor
                          : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/8'
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        {selected
                          ? <CheckCircle2 size={16} className="text-[#FF5A70]" />
                          : <Circle size={16} className="text-white/30" />
                        }
                      </span>
                      <span className="text-sm font-medium leading-snug">{co.title}</span>
                    </button>
                  )
                })}
                {alignedTo && (
                  <button
                    type="button"
                    onClick={() => setAlignedTo(null)}
                    className="text-xs text-white/40 hover:text-white/60 underline"
                  >
                    Clear alignment
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Objective title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-semibold text-white/70">
              {type === 'area' ? 'Your area objective' : 'Objective title'}
            </Label>
            <Input
              id="title"
              placeholder={type === 'area' ? 'e.g. Expand worker onboarding capacity' : 'e.g. Grow our active worker base'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
            >
              {loading ? 'Saving...' : existing ? 'Save Changes' : 'Add Objective'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
