'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { GlossaryEntry, TermStatus } from '@/config/ontop-glossary'

interface GlossaryManagerProps {
  initialEntries: GlossaryEntry[]
}

const STATUS_LABEL: Record<TermStatus, string> = {
  preferred:     'Preferred',
  sunsetting:    'Sunsetting',
  deprecated:    'Deprecated',
  internal_only: 'Internal Only',
}

const STATUS_BADGE_CLASS: Record<TermStatus, string> = {
  preferred:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  sunsetting:    'bg-amber-500/15 text-amber-400 border-amber-500/25',
  deprecated:    'bg-red-500/15 text-red-400 border-red-500/25',
  internal_only: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
}

const CATEGORIES = [
  'Contract Types',
  'Protection Add-ons',
  'Invoice Types',
  'Payment Flows',
  'Billing',
  'Platform & Accounts',
  'Benefits',
  'People & Roles',
]

const EMPTY_FORM = {
  category: '',
  deprecatedRaw: '',  // comma-separated string input
  preferred: '',
  status: 'preferred' as TermStatus,
  note: '',
}

export default function GlossaryManager({ initialEntries }: GlossaryManagerProps) {
  const [entries, setEntries]       = useState<GlossaryEntry[]>(initialEntries)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Group entries by category, preserving CATEGORIES order
  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    items: entries.filter(e => e.category === cat),
  })).filter(g => g.items.length > 0 || editingId === null)

  // Include any categories from DB not in the static list
  const extraCategories = [...new Set(entries.map(e => e.category))].filter(c => !CATEGORIES.includes(c))
  for (const cat of extraCategories) {
    grouped.push({ category: cat, items: entries.filter(e => e.category === cat) })
  }

  function startEdit(entry: GlossaryEntry) {
    setShowAdd(false)
    setError(null)
    setEditingId(entry.id ?? null)
    setForm({
      category:     entry.category,
      deprecatedRaw: entry.deprecated.join(', '),
      preferred:    entry.preferred,
      status:       entry.status,
      note:         entry.note ?? '',
    })
  }

  function startAdd() {
    setEditingId(null)
    setError(null)
    setForm(EMPTY_FORM)
    setShowAdd(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setShowAdd(false)
    setError(null)
  }

  function parseDeprecated(raw: string): string[] {
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function saveEdit() {
    const deprecated = parseDeprecated(form.deprecatedRaw)
    if (!form.category || deprecated.length === 0) {
      setError('Category and at least one deprecated term are required.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      id:         editingId,
      category:   form.category,
      deprecated,
      preferred:  form.preferred,
      status:     form.status,
      note:       form.note || null,
    }

    const res = await fetch('/api/glossary', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to save.')
      setSaving(false)
      return
    }

    setEntries(prev => prev.map(e => e.id === editingId ? json.data : e))
    setEditingId(null)
    setSaving(false)
  }

  async function saveAdd() {
    const deprecated = parseDeprecated(form.deprecatedRaw)
    if (!form.category || deprecated.length === 0) {
      setError('Category and at least one deprecated term are required.')
      return
    }

    setSaving(true)
    setError(null)

    const res = await fetch('/api/glossary', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        category:  form.category,
        deprecated,
        preferred: form.preferred,
        status:    form.status,
        note:      form.note || null,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to add entry.')
      setSaving(false)
      return
    }

    setEntries(prev => [...prev, json.data])
    setShowAdd(false)
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    setSaving(true)
    const res = await fetch('/api/glossary', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })

    if (res.ok) {
      setEntries(prev => prev.filter(e => e.id !== id))
    }
    setSaving(false)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white/80">Terminology Glossary</h2>
          <p className="text-sm text-white/40 mt-0.5">
            Deprecated → preferred term mappings enforced in AI responses and OKR update forms.
          </p>
        </div>
        <Button
          onClick={startAdd}
          size="sm"
          className="gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
        >
          <Plus size={14} /> Add term
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <EntryForm
          form={form}
          setForm={setForm}
          error={error}
          saving={saving}
          onSave={saveAdd}
          onCancel={cancelEdit}
          title="New entry"
        />
      )}

      {/* Grouped entries */}
      <div className="space-y-6">
        {grouped.map(({ category, items }) => (
          <div key={category}>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2 px-1">
              {category}
            </p>
            <div className="border border-white/8 rounded-lg overflow-hidden bg-[#140e2e]">
              {items.map((entry, i) => (
                <div key={entry.id ?? i}>
                  {editingId === entry.id ? (
                    <div className="p-4 border-b border-white/8 last:border-0">
                      <EntryForm
                        form={form}
                        setForm={setForm}
                        error={error}
                        saving={saving}
                        onSave={saveEdit}
                        onCancel={cancelEdit}
                        title="Edit entry"
                      />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3 border-b border-white/8 last:border-0 hover:bg-white/4 group">
                      {/* Deprecated terms */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1 items-center">
                          {entry.deprecated.map(term => (
                            <span
                              key={term}
                              className="inline-block text-xs bg-white/8 text-white/50 px-2 py-0.5 rounded font-mono"
                            >
                              {term}
                            </span>
                          ))}
                          <span className="text-white/25 text-sm mx-1">→</span>
                          {entry.preferred ? (
                            <span className="text-sm text-white font-medium">{entry.preferred}</span>
                          ) : (
                            <span className="text-sm text-white/40 italic">do not use</span>
                          )}
                        </div>
                        {entry.note && (
                          <p className="text-xs text-white/30 mt-1">{entry.note}</p>
                        )}
                      </div>

                      {/* Status badge */}
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs border ${STATUS_BADGE_CLASS[entry.status]}`}
                      >
                        {STATUS_LABEL[entry.status]}
                      </Badge>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(entry)}
                          className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => entry.id && deleteEntry(entry.id)}
                          disabled={saving}
                          className="p-1.5 rounded hover:bg-red-500/15 text-white/40 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {entries.length === 0 && !showAdd && (
        <p className="text-sm text-white/30 text-center py-8">No entries yet. Add your first term above.</p>
      )}
    </section>
  )
}

// ── Inline form used for both add and edit ────────────────────────────────────

interface EntryFormProps {
  form: typeof EMPTY_FORM
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>
  error: string | null
  saving: boolean
  onSave: () => void
  onCancel: () => void
  title: string
}

function EntryForm({ form, setForm, error, saving, onSave, onCancel, title }: EntryFormProps) {
  return (
    <div className="border border-white/10 rounded-lg p-4 bg-white/4 space-y-4">
      <p className="text-sm font-medium text-white/70">{title}</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Category */}
        <div className="space-y-1.5">
          <Label className="text-xs text-white/50">Category</Label>
          <Select value={form.category} onValueChange={val => setForm(f => ({ ...f, category: val }))}>
            <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Select category…" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label className="text-xs text-white/50">Status</Label>
          <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as TermStatus }))}>
            <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="preferred">Preferred</SelectItem>
              <SelectItem value="sunsetting">Sunsetting</SelectItem>
              <SelectItem value="deprecated">Deprecated</SelectItem>
              <SelectItem value="internal_only">Internal Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deprecated terms */}
      <div className="space-y-1.5">
        <Label className="text-xs text-white/50">Deprecated terms <span className="text-white/25">(comma-separated)</span></Label>
        <Input
          value={form.deprecatedRaw}
          onChange={e => setForm(f => ({ ...f, deprecatedRaw: e.target.value }))}
          placeholder="e.g. Pay-ins, Payins"
          className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/25"
        />
      </div>

      {/* Preferred term */}
      <div className="space-y-1.5">
        <Label className="text-xs text-white/50">
          Preferred term{' '}
          <span className="text-white/25">(leave blank for deprecated / internal-only)</span>
        </Label>
        <Input
          value={form.preferred}
          onChange={e => setForm(f => ({ ...f, preferred: e.target.value }))}
          placeholder="e.g. Client Payments"
          className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/25"
        />
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label className="text-xs text-white/50">Note <span className="text-white/25">(optional)</span></Label>
        <Input
          value={form.note}
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          placeholder="Context or escalation instructions…"
          className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/25"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1"
        >
          <X size={12} /> Cancel
        </button>
        <Button
          onClick={onSave}
          disabled={saving}
          size="sm"
          className="gap-1.5 bg-[#FF5A70] hover:bg-[#ff3f58] text-white h-7 text-xs"
        >
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
