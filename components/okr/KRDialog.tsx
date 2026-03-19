'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { AreaKeyResult, CompanyKeyResult } from '@/types'

interface KRDialogProps {
  open: boolean
  onClose: () => void
  objectiveId: string
  type: 'area' | 'company'
  existing?: AreaKeyResult | CompanyKeyResult
  onSuccess: () => void
}

export default function KRDialog({ open, onClose, objectiveId, type, existing, onSuccess }: KRDialogProps) {
  const supabase = createClient()
  const [description, setDescription] = useState(existing?.description ?? '')
  const [targetValue, setTargetValue] = useState(existing ? String(existing.target_value) : '')
  const [unit, setUnit] = useState(existing?.unit ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDescription(existing?.description ?? '')
    setTargetValue(existing ? String(existing.target_value) : '')
    setUnit(existing?.unit ?? '')
    setError(null)
  }, [existing, open])

  const table = type === 'area' ? 'area_key_results' : 'company_key_results'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }

    let err
    if (existing) {
      const { error: e } = await supabase.from(table)
        .update({ description, target_value: parseFloat(targetValue), unit: unit || null })
        .eq('id', existing.id)
      err = e
    } else {
      const { error: e } = await supabase.from(table).insert({
        objective_id: objectiveId,
        description,
        target_value: parseFloat(targetValue),
        current_value: 0,
        unit: unit || null,
        owner_id: user.id,
      })
      err = e
    }

    if (err) { setError(err.message); setLoading(false); return }

    setLoading(false)
    onSuccess()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1c1540] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">{existing ? 'Edit Key Result' : 'Add Key Result'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-white/70">Description</Label>
            <Textarea
              id="description"
              placeholder="e.g. Reach 25,000 active workers"
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="target" className="text-white/70">Target Value</Label>
              <Input
                id="target"
                type="number"
                step="any"
                placeholder="25000"
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit" className="text-white/70">Unit (optional)</Label>
              <Input
                id="unit"
                placeholder="workers, $, %, ..."
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-[#FF5A70] hover:bg-[#ff3f58] text-white">
              {loading ? 'Saving...' : existing ? 'Save Changes' : 'Add Key Result'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
