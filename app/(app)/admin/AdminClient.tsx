'use client'

import { useState } from 'react'
import React from 'react'
import { Profile, Area, Role, CompanyObjective } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import SeedCompanyOKRsButton from './SeedCompanyOKRsButton'
import BulkImportModal from '@/components/admin/BulkImportModal'
import InviteUserModal from '@/components/admin/InviteUserModal'
import OKRManager from '@/components/admin/OKRManager'
import GlossaryManager from '@/components/admin/GlossaryManager'
import { Upload, UserPlus, Trash2 } from 'lucide-react'
import { GlossaryEntry } from '@/config/ontop-glossary'

interface AdminClientProps {
  profiles: (Profile & { area?: { name: string }; email?: string })[]
  areas: Area[]
  companyObjectives: CompanyObjective[]
  quarter: number
  year: number
  initialObjectives: React.ComponentProps<typeof OKRManager>['initialObjectives']
  initialGlossary: GlossaryEntry[]
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  area_lead: 'Area Lead',
  team_member: 'Member',
}

const ROLE_BADGE: Record<Role, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  area_lead: 'secondary',
  team_member: 'outline',
}

export default function AdminClient({ profiles, areas, companyObjectives, quarter, year, initialObjectives, initialGlossary }: AdminClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [nameValue, setNameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function updateProfile(userId: string, updates: { role?: Role; area_id?: string | null; full_name?: string }) {
    setSaving(userId)
    await supabase.from('profiles').update(updates).eq('id', userId)
    setSaving(null)
    router.refresh()
  }

  async function saveName(userId: string) {
    if (nameValue.trim()) await updateProfile(userId, { full_name: nameValue.trim() })
    setEditingName(null)
  }

  async function deleteUser(userId: string) {
    setDeleting(userId)
    await fetch('/api/admin/delete-user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setDeleting(null)
    setConfirmDelete(null)
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* Bulk Import section */}
      <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white">Import Area OKRs</h2>
            <p className="text-sm text-white/50 mt-0.5">
              Paste your OKR document or upload a PDF — Claude will structure objectives and key results for all 10 areas at once.
              Each area lead can then review and adjust their OKRs.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <SeedCompanyOKRsButton />
            <Button
              onClick={() => setShowBulkImport(true)}
              className="gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
            >
              <Upload size={14} />
              Bulk Import OKRs
            </Button>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white/80">Users</h2>
          <Button
            onClick={() => setShowInvite(true)}
            className="gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
            size="sm"
          >
            <UserPlus size={14} /> Invite Member
          </Button>
        </div>
        <div className="border border-white/8 rounded-lg overflow-hidden bg-[#140e2e]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-white/4">
                <TableHead className="text-white/50">Name</TableHead>
                <TableHead className="text-white/50">Email</TableHead>
                <TableHead className="text-white/50">Role</TableHead>
                <TableHead className="text-white/50">Area</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(p => (
                <TableRow key={p.id} className="border-white/8 hover:bg-white/4">
                  <TableCell className="font-medium text-white">
                    {editingName === p.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={nameValue}
                          onChange={e => setNameValue(e.target.value)}
                          onBlur={() => saveName(p.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveName(p.id); if (e.key === 'Escape') setEditingName(null) }}
                          className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm text-white w-36 focus:outline-none focus:border-[#FF5A70]/50"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingName(p.id); setNameValue(p.full_name ?? '') }}
                        className="text-left hover:text-[#FF5A70] transition-colors"
                        title="Click to edit name"
                      >
                        {p.full_name ?? <span className="text-white/30 italic">Add name…</span>}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-white/50">{p.email ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE[p.role]} className="bg-white/8 text-white/70 border-white/15">{ROLE_LABELS[p.role]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-white/50">{p.area?.name ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        defaultValue={p.role}
                        onValueChange={val => updateProfile(p.id, { role: val as Role })}
                      >
                        <SelectTrigger className="h-8 text-xs w-32 bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="area_lead">Area Lead</SelectItem>
                          <SelectItem value="team_member">Member</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        defaultValue={p.area_id ?? 'none'}
                        onValueChange={val =>
                          updateProfile(p.id, { area_id: val === 'none' ? null : val })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-40 bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Assign area..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No area</SelectItem>
                          {areas.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {saving === p.id && (
                        <span className="text-xs text-white/40">Saving...</span>
                      )}

                      {confirmDelete === p.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button
                            onClick={() => deleteUser(p.id)}
                            disabled={deleting === p.id}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            {deleting === p.id ? 'Deleting…' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs px-2 py-1 rounded bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <InviteUserModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        areas={areas}
        onSuccess={() => router.refresh()}
      />

      <BulkImportModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        areas={areas}
        companyObjectives={companyObjectives}
        quarter={quarter}
        year={year}
        onSuccess={() => router.refresh()}
      />

      <OKRManager
        initialObjectives={initialObjectives}
        areas={areas}
        companyObjectives={companyObjectives}
        profiles={profiles}
        quarter={quarter}
        year={year}
      />

      <GlossaryManager initialEntries={initialGlossary} />

    </div>
  )
}
