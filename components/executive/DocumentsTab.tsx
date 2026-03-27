'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, Loader2, FileText, Trash2, ExternalLink, Check, X, ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface CompanyDocument {
  id: string
  title: string
  doc_type: string
  doc_date: string | null
  blob_url: string | null
  summary: string
  created_at: string
}

const DOC_TYPES = [
  { value: 'board_deck',        label: 'Board Deck' },
  { value: 'investor_update',   label: 'Investor Update' },
  { value: 'investor_deck',     label: 'Investor Deck' },
  { value: 'strategic_plan',    label: 'Strategic Plan' },
  { value: 'financial_report',  label: 'Financial Report' },
  { value: 'other',             label: 'Other' },
]

function docTypeLabel(value: string) {
  return DOC_TYPES.find(d => d.value === value)?.label ?? value
}

interface Props {
  isAdmin: boolean
  initialDocs: CompanyDocument[]
}

type Step = 'idle' | 'uploading' | 'extracting' | 'review' | 'saving'

interface DraftDoc {
  title:    string
  doc_type: string
  doc_date: string
  blob_url: string
  summary:  string
}

export default function DocumentsTab({ isAdmin, initialDocs }: Props) {
  const [docs, setDocs]           = useState<CompanyDocument[]>(initialDocs)
  const [step, setStep]           = useState<Step>('idle')
  const [error, setError]         = useState<string | null>(null)
  const [draft, setDraft]         = useState<DraftDoc | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<DraftDoc>>({})
  const [deleting, setDeleting]   = useState<string | null>(null)
  const fileRef                   = useRef<HTMLInputElement>(null)

  // Form fields for new upload
  const [newTitle,   setNewTitle]   = useState('')
  const [newType,    setNewType]    = useState('board_deck')
  const [newDate,    setNewDate]    = useState('')
  const [newFile,    setNewFile]    = useState<File | null>(null)

  function resetForm() {
    setNewTitle(''); setNewType('board_deck'); setNewDate(''); setNewFile(null)
    setDraft(null); setStep('idle'); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleUpload() {
    if (!newFile) return
    setError(null)

    // 1. Upload PDF to Vercel Blob
    setStep('uploading')
    const fd = new FormData()
    fd.append('file', newFile)
    const uploadRes = await fetch('/api/documents/upload', { method: 'POST', body: fd })
    if (!uploadRes.ok) {
      const j = await uploadRes.json()
      setError(j.error ?? 'Upload failed'); setStep('idle'); return
    }
    const { url: blobUrl } = await uploadRes.json()

    // 2. Extract summary with Claude
    setStep('extracting')
    const extractRes = await fetch('/api/documents/extract', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ blobUrl }),
    })
    if (!extractRes.ok) {
      const j = await extractRes.json()
      setError(j.error ?? 'Extraction failed'); setStep('idle'); return
    }
    const { summary } = await extractRes.json()

    setDraft({ title: newTitle, doc_type: newType, doc_date: newDate, blob_url: blobUrl, summary })
    setStep('review')
  }

  async function handleSave() {
    if (!draft) return
    setStep('saving')
    const res = await fetch('/api/documents', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(draft),
    })
    if (!res.ok) {
      const j = await res.json()
      setError(j.error ?? 'Save failed'); setStep('review'); return
    }
    const { data } = await res.json()
    setDocs(prev => [data, ...prev])
    resetForm()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/documents?id=${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
    setDeleting(null)
  }

  async function handleEditSave(id: string) {
    const res = await fetch('/api/documents', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, ...editDraft }),
    })
    if (!res.ok) return
    const { data } = await res.json()
    setDocs(prev => prev.map(d => d.id === id ? data : d))
    setEditingId(null)
    setEditDraft({})
  }

  function startEdit(doc: CompanyDocument) {
    setEditingId(doc.id)
    setEditDraft({ title: doc.title, doc_type: doc.doc_type, doc_date: doc.doc_date ?? '', summary: doc.summary })
  }

  const canUpload = !!newFile && !!newTitle && step === 'idle'

  return (
    <div className="space-y-6">

      {/* Upload form — admin only */}
      {isAdmin && step !== 'review' && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Add Document</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Title */}
            <input
              type="text"
              placeholder="Document title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              disabled={step !== 'idle'}
              className="sm:col-span-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 disabled:opacity-50"
            />
            {/* Type */}
            <div className="relative">
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                disabled={step !== 'idle'}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-white/25 disabled:opacity-50"
              >
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            </div>
            {/* Date */}
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              disabled={step !== 'idle'}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-white/25 disabled:opacity-50 [color-scheme:dark]"
            />
          </div>

          {/* File picker */}
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => setNewFile(e.target.files?.[0] ?? null)} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={step !== 'idle'}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/15 text-sm text-white/40 hover:text-white/70 hover:border-white/30 transition-colors disabled:opacity-50"
            >
              <Upload size={13} />
              {newFile ? newFile.name : 'Choose PDF (max 20 MB)'}
            </button>

            <Button
              size="sm"
              onClick={handleUpload}
              disabled={!canUpload}
              className="gap-2 bg-gradient-to-r from-[#FF5A70] to-[#4A268C] text-white border-0 hover:opacity-90 disabled:opacity-30"
            >
              {step === 'uploading' && <><Loader2 size={13} className="animate-spin" /> Uploading…</>}
              {step === 'extracting' && <><Loader2 size={13} className="animate-spin" /> Extracting with AI…</>}
              {step === 'idle' && <><FileText size={13} /> Upload & Extract</>}
            </Button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {/* Review panel — shown after extraction */}
      {isAdmin && draft !== null && (
        <div className="rounded-xl border border-[#FF5A70]/30 bg-[#FF5A70]/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Review Extracted Summary</h3>
            <button onClick={resetForm} className="text-white/30 hover:text-white/60 transition-colors">
              <X size={15} />
            </button>
          </div>
          <p className="text-xs text-white/40">
            Claude extracted this summary from your PDF. Review and edit before saving — this is what the AI Chief of Staff will use as context.
          </p>

          {/* Editable metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={draft.title}
              onChange={e => setDraft(d => d ? { ...d, title: e.target.value } : d)}
              className="sm:col-span-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
            />
            <div className="relative">
              <select
                value={draft.doc_type}
                onChange={e => setDraft(d => d ? { ...d, doc_type: e.target.value } : d)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-white/25"
              >
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            </div>
            <input
              type="date"
              value={draft.doc_date}
              onChange={e => setDraft(d => d ? { ...d, doc_date: e.target.value } : d)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-white/25 [color-scheme:dark]"
            />
          </div>

          {/* Editable summary */}
          <textarea
            value={draft.summary}
            onChange={e => setDraft(d => d ? { ...d, summary: e.target.value } : d)}
            rows={16}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white/85 font-mono leading-relaxed focus:outline-none focus:border-white/25 resize-y"
          />

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={step === 'saving'}
              className="gap-2 bg-gradient-to-r from-[#FF5A70] to-[#4A268C] text-white border-0 hover:opacity-90"
            >
              {step === 'saving'
                ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                : <><Check size={13} /> Save Document</>}
            </Button>
            <button onClick={resetForm} className="text-sm text-white/30 hover:text-white/60 transition-colors">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
          <FileText size={28} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/30">No documents added yet.</p>
          {isAdmin && <p className="text-xs text-white/20 mt-1">Upload a board deck or investor update above to get started.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
              {editingId === doc.id ? (
                /* Edit mode */
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={editDraft.title ?? ''}
                      onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                      className="sm:col-span-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
                    />
                    <div className="relative">
                      <select
                        value={editDraft.doc_type ?? 'other'}
                        onChange={e => setEditDraft(d => ({ ...d, doc_type: e.target.value }))}
                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-white/25"
                      >
                        {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    </div>
                    <input
                      type="date"
                      value={editDraft.doc_date ?? ''}
                      onChange={e => setEditDraft(d => ({ ...d, doc_date: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-white/25 [color-scheme:dark]"
                    />
                  </div>
                  <textarea
                    value={editDraft.summary ?? ''}
                    onChange={e => setEditDraft(d => ({ ...d, summary: e.target.value }))}
                    rows={12}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white/85 font-mono leading-relaxed focus:outline-none focus:border-white/25 resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEditSave(doc.id)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors font-medium">
                      <Check size={12} /> Save
                    </button>
                    <button onClick={() => { setEditingId(null); setEditDraft({}) }}
                      className="text-xs text-white/30 hover:text-white/60 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{doc.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/40">
                          {docTypeLabel(doc.doc_type)}
                        </span>
                        {doc.doc_date && (
                          <span className="text-xs text-white/30">
                            {new Date(doc.doc_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/30 mt-0.5">
                        Added {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.blob_url && (
                          <a href={doc.blob_url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-white/20 hover:text-white/60 hover:bg-white/8 transition-colors">
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <button onClick={() => startEdit(doc)}
                          className="p-1.5 rounded-lg text-white/20 hover:text-white/60 hover:bg-white/8 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                        >
                          {deleting === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary preview */}
                  <details className="mt-3 group">
                    <summary className="text-xs text-white/30 hover:text-white/50 cursor-pointer transition-colors list-none flex items-center gap-1.5">
                      <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                      View extracted summary
                    </summary>
                    <pre className="mt-2 text-xs text-white/55 whitespace-pre-wrap font-mono leading-relaxed bg-white/3 rounded-lg px-3 py-2.5 border border-white/5">
                      {doc.summary}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
