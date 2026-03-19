'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { AreaKRUpdate, CompanyKRUpdate } from '@/types'

interface WeeklyUpdateFormProps {
  open: boolean
  onClose: () => void
  keyResultId: string
  type: 'area' | 'company'
  currentValue: number
  onSuccess: () => void
  existing?: AreaKRUpdate | CompanyKRUpdate
}

export default function WeeklyUpdateForm({
  open,
  onClose,
  keyResultId,
  type,
  currentValue,
  onSuccess,
  existing,
}: WeeklyUpdateFormProps) {
  const supabase = createClient()
  const [updateText, setUpdateText] = useState(existing?.update_text ?? '')
  const [confidence, setConfidence] = useState<number>(existing?.confidence_score ?? 3)
  const [value, setValue] = useState<string>(String(existing?.current_value ?? currentValue))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!existing
  const table = type === 'area' ? 'area_kr_updates' : 'company_kr_updates'

  // Reset form when existing changes (e.g. opening a different update to edit)
  useState(() => {
    setUpdateText(existing?.update_text ?? '')
    setConfidence(existing?.confidence_score ?? 3)
    setValue(String(existing?.current_value ?? currentValue))
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (isEditing) {
      const { error: updateError } = await supabase
        .from(table)
        .update({
          update_text: updateText,
          confidence_score: confidence,
          current_value: parseFloat(value),
        })
        .eq('id', existing.id)

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const weekDate = new Date()
      weekDate.setDate(weekDate.getDate() - weekDate.getDay() + 1)
      const week_date = weekDate.toISOString().split('T')[0]

      const { error: insertError } = await supabase.from(table).insert({
        key_result_id: keyResultId,
        update_text: updateText,
        confidence_score: confidence,
        current_value: parseFloat(value),
        created_by: user.id,
        week_date,
      })

      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }

      // Update the key result's current value only on new updates
      const krTable = type === 'area' ? 'area_key_results' : 'company_key_results'
      await supabase
        .from(krTable)
        .update({ current_value: parseFloat(value) })
        .eq('id', keyResultId)
    }

    setUpdateText('')
    setConfidence(3)
    setLoading(false)
    onSuccess()
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="bg-[#1c1540] border-white/8 w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white text-lg">
            {isEditing ? 'Edit Update' : 'Weekly Check-in'}
          </SheetTitle>
          <SheetDescription className="text-white/50">
            {isEditing
              ? 'Edit your progress update for this key result.'
              : 'Submit your weekly progress update for this key result.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-6">
          <div className="space-y-2">
            <Label htmlFor="update_text" className="text-white/70">What happened this week?</Label>
            <Textarea
              id="update_text"
              placeholder="Describe progress, blockers, next steps..."
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              required
              rows={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="current_value" className="text-white/70">Current Value</Label>
            <Input
              id="current_value"
              type="number"
              step="any"
              value={value}
              onChange={e => setValue(e.target.value)}
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">Confidence Score (1–5)</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConfidence(n)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                    confidence === n
                      ? 'bg-[#FF5A70] text-white border-[#FF5A70]'
                      : 'bg-white/5 text-white/60 border-white/10 hover:border-[#FF5A70]/50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-white/40">
              1 = Off track · 3 = At risk · 5 = On track
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
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
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Submit Update'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
