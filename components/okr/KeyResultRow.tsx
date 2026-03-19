'use client'

import { useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AreaKeyResult, CompanyKeyResult, calcProgress } from '@/types'
import { PlusCircle, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import UpdateFeed from './UpdateFeed'
import WeeklyUpdateForm from './WeeklyUpdateForm'
import { createClient } from '@/lib/supabase/client'

interface KeyResultRowProps {
  keyResult: AreaKeyResult | CompanyKeyResult
  type: 'area' | 'company'
  canUpdate: boolean
  canEdit?: boolean
  onEdit?: () => void
  onDeleted?: () => void
}

const CONFIDENCE_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-yellow-400',
  4: 'bg-green-400',
  5: 'bg-emerald-500',
}

export default function KeyResultRow({
  keyResult,
  type,
  canUpdate,
  canEdit,
  onEdit,
  onDeleted,
}: KeyResultRowProps) {
  const supabase = createClient()
  const [showUpdates, setShowUpdates] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this key result and all its updates? This cannot be undone.')) return
    setDeleting(true)
    const table = type === 'area' ? 'area_key_results' : 'company_key_results'
    await supabase.from(table).delete().eq('id', keyResult.id)
    setDeleting(false)
    onDeleted?.()
  }

  const progress = calcProgress(keyResult.current_value, keyResult.target_value)
  const latestConfidence = keyResult.updates?.[0]?.confidence_score ?? null

  return (
    <div className="border border-white/10 rounded-lg p-4 space-y-3 bg-gradient-to-br from-[#1c1540] to-[#23174B]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/80">{keyResult.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-white/40">
              {keyResult.current_value.toLocaleString()}
              {keyResult.unit ? ` ${keyResult.unit}` : ''} /{' '}
              {keyResult.target_value.toLocaleString()}
              {keyResult.unit ? ` ${keyResult.unit}` : ''}
            </span>
            {latestConfidence && (
              <Badge variant="outline" className="text-xs gap-1 border-white/15 text-white/60">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${CONFIDENCE_COLORS[latestConfidence]}`}
                />
                Confidence: {latestConfidence}/5
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit} className="text-white/50 hover:text-white hover:bg-white/6 p-1.5">
                <Pencil size={13} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-white/50 hover:text-red-400 hover:bg-red-500/10 p-1.5"
              >
                <Trash2 size={13} />
              </Button>
            </>
          )}
          {canUpdate && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1 border-white/15 text-white/80 hover:bg-white/5 hover:text-white"
              onClick={() => setShowForm(true)}
            >
              <PlusCircle size={12} />
              Update
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-white/40">
          <span>Progress</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div>
        <button
          className="flex items-center gap-1 text-xs text-[#FF5A70] hover:text-[#ff3f58]"
          onClick={() => setShowUpdates(v => !v)}
        >
          {showUpdates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showUpdates ? 'Hide updates' : 'Show updates'}
        </button>
        {showUpdates && (
          <div className="mt-3">
            <UpdateFeed keyResultId={keyResult.id} type={type} refreshKey={refreshKey} />
          </div>
        )}
      </div>

      <WeeklyUpdateForm
        open={showForm}
        onClose={() => setShowForm(false)}
        keyResultId={keyResult.id}
        type={type}
        currentValue={keyResult.current_value}
        onSuccess={() => {
          setRefreshKey(k => k + 1)
          setShowUpdates(true)
        }}
      />
    </div>
  )
}
