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
  type: 'area' | 'company' | 'team'
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

  const table = type === 'area' ? 'area_objectives' : type === 'team' ? 'team_objectives' : 'company_objectives'

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

    if (type === 'area' || type === 'team') {
      payload.area_id = areaId
      payload.aligned_to = alignedTo ?? null
    }

    let err
    if (existing) {
      const { error: e } = await supabase.from(table)
        .update({ title, ...((type === 'area' || type === 'team') ? { aligned_to: alignedTo } : {}) })
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
      <DialogContent className="sm:max-w-[720px] w-full bg-[#1c1540] border-white/10 px-8 py-7">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-white text-xl">{existing ? 'Edit Objective' : 'Add Objective'}</DialogTitle>
          {(type === 'area' || type === 'team') && !existing && (
            <DialogDescription className="text-white/50 mt-1.5">
              Link your objective to an area goal so it shows up in the cascade view.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-7">

          {/* Step 1: Align to area objective (team only) / company objective (area) */}
          {(type === 'area' || type === 'team') && companyObjectives && companyObjectives.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-white/70 tracking-wide uppercase text-xs">
                Which {type === 'team' ? 'area' : 'company'} objective does this support?
              </Label>
              <div className="space-y-2.5">
                {companyObjectives.map((co) => {
                  const selected = alignedTo === co.id
                  return (
                    <button
                      key={co.id}
                      type="button"
                      onClick={() => setAlignedTo(selected ? null : co.id)}
                      className={cn(
                        'w-full text-left flex items-start gap-4 px-4 py-3.5 rounded-xl border-2 transition-all',
                        selected
                          ? 'border-[#FF5A70] bg-[#FF5A70]/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:bg-white/8 hover:text-white/80'
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        {selected
                          ? <CheckCircle2 size={18} className="text-[#FF5A70]" />
                          : <Circle size={18} className="text-white/25" />
                        }
                      </span>
                      <span className="text-sm font-medium leading-relaxed">{co.title}</span>
                    </button>
                  )
                })}
                {alignedTo && (
                  <button
                    type="button"
                    onClick={() => setAlignedTo(null)}
                    className="text-xs text-white/40 hover:text-white/60 underline pl-1"
                  >
                    Clear alignment
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Objective title */}
          <div className="space-y-2.5">
            <Label htmlFor="title" className="text-sm font-semibold text-white/70 tracking-wide uppercase text-xs">
              {type === 'area' ? 'Your area objective' : 'Objective title'}
            </Label>
            <Input
              id="title"
              placeholder={type === 'area' ? 'e.g. Expand worker onboarding capacity' : 'e.g. Grow our active worker base'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50 h-11"
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-3 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-white/15 text-white/80 hover:bg-white/5 hover:text-white h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#FF5A70] hover:bg-[#ff3f58] text-white h-11"
            >
              {loading ? 'Saving...' : existing ? 'Save Changes' : 'Add Objective'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
