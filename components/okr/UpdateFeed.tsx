'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AreaKRUpdate, CompanyKRUpdate } from '@/types'
import { Pencil, Trash2 } from 'lucide-react'
import WeeklyUpdateForm from './WeeklyUpdateForm'

interface UpdateFeedProps {
  keyResultId: string
  type: 'area' | 'company' | 'team'
  refreshKey?: number
  canEdit?: boolean
  currentValue?: number
}

const CONFIDENCE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Off track', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  2: { label: 'At risk', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  3: { label: 'Cautious', color: 'text-yellow-300 bg-yellow-400/10 border-yellow-400/30' },
  4: { label: 'Good', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  5: { label: 'On track', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
}

export default function UpdateFeed({ keyResultId, type, refreshKey, canEdit, currentValue = 0 }: UpdateFeedProps) {
  const supabase = createClient()
  const [updates, setUpdates] = useState<(AreaKRUpdate | CompanyKRUpdate)[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUpdate, setEditingUpdate] = useState<AreaKRUpdate | CompanyKRUpdate | null>(null)
  const [internalRefresh, setInternalRefresh] = useState(0)

  async function handleDelete(update: AreaKRUpdate | CompanyKRUpdate) {
    if (!confirm('Delete this update? This cannot be undone.')) return
    await supabase.from(table).delete().eq('id', update.id)
    setInternalRefresh(k => k + 1)
  }

  const table = type === 'area' ? 'area_kr_updates' : type === 'team' ? 'team_kr_updates' : 'company_kr_updates'

  useEffect(() => {
    async function fetchUpdates() {
      setLoading(true)
      const { data } = await supabase
        .from(table)
        .select('*, author:profiles(full_name)')
        .eq('key_result_id', keyResultId)
        .order('week_date', { ascending: false })
        .limit(10)
      setUpdates(data ?? [])
      setLoading(false)
    }
    fetchUpdates()
  }, [keyResultId, type, refreshKey, internalRefresh])

  if (loading) return <p className="text-xs text-white/40 py-2">Loading updates...</p>
  if (updates.length === 0) return <p className="text-xs text-white/40 py-2">No updates yet.</p>

  return (
    <>
      <div className="space-y-3">
        {updates.map(update => {
          const conf = CONFIDENCE_LABELS[update.confidence_score]
          const author = (update as AreaKRUpdate & { author?: { full_name: string } }).author
          return (
            <div key={update.id} className="border border-white/10 rounded-md p-3 space-y-2 bg-gradient-to-br from-[#1c1540] to-[#23174B]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/70">
                    {(() => {
                      const [y, m, d] = update.week_date.split('-').map(Number)
                      return new Date(y, m - 1, d).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })
                    })()}
                  </span>
                  <span className="text-xs text-white/30">·</span>
                  <span className="text-xs text-white/50">
                    {author?.full_name ?? 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${conf.color}`}>
                    {conf.label} ({update.confidence_score}/5)
                  </span>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => setEditingUpdate(update)}
                        className="text-white/25 hover:text-white/70 transition-colors p-0.5"
                        title="Edit update"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(update)}
                        className="text-white/25 hover:text-red-400 transition-colors p-0.5"
                        title="Delete update"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm text-white/70">{update.update_text}</p>
              <p className="text-xs text-white/40">
                Value at update: <span className="font-medium text-white/60">{update.current_value.toLocaleString()}</span>
              </p>
            </div>
          )
        })}
      </div>

      {editingUpdate && (
        <WeeklyUpdateForm
          open={!!editingUpdate}
          onClose={() => setEditingUpdate(null)}
          keyResultId={keyResultId}
          type={type}
          currentValue={currentValue}
          existing={editingUpdate}
          onSuccess={() => {
            setEditingUpdate(null)
            setInternalRefresh(k => k + 1)
          }}
        />
      )}
    </>
  )
}
