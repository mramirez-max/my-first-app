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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Area, Role } from '@/types'
import { UserPlus, Check, AlertCircle } from 'lucide-react'

interface InviteUserModalProps {
  open: boolean
  onClose: () => void
  areas: Area[]
  onSuccess: () => void
}

export default function InviteUserModal({ open, onClose, areas, onSuccess }: InviteUserModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('team_member')
  const [areaId, setAreaId] = useState<string>('none')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        fullName,
        role,
        areaId: areaId === 'none' ? null : areaId,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to invite user')
      return
    }

    setDone(true)
  }

  function handleClose() {
    setFullName('')
    setEmail('')
    setRole('team_member')
    setAreaId('none')
    setError(null)
    setLoading(false)
    if (done) onSuccess()
    setDone(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-[#1c1540] border-white/10">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF5A70]/15 flex items-center justify-center">
              <UserPlus size={16} className="text-[#FF5A70]" />
            </div>
            <div>
              <DialogTitle className="text-white">Invite Team Member</DialogTitle>
              <DialogDescription className="text-xs text-white/50 mt-0.5">
                They'll receive an email to set their password
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center py-8 space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check size={22} className="text-emerald-400" />
            </div>
            <p className="text-base font-semibold text-white">Invite sent!</p>
            <p className="text-sm text-white/50">
              {fullName} will receive an email at <span className="text-white/70">{email}</span>
            </p>
            <Button onClick={handleClose} className="mt-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white px-8">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-white/70 text-xs">Full name</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Maria Camila Ramirez"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70 text-xs">Work email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/70 text-xs">Role</Label>
                <Select value={role} onValueChange={val => setRole(val as Role)}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="area_lead">Area Lead</SelectItem>
                    <SelectItem value="team_member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70 text-xs">Area</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No area</SelectItem>
                    {areas.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2.5 rounded flex items-center gap-1.5">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 gap-2 bg-[#FF5A70] hover:bg-[#ff3f58] text-white"
              >
                <UserPlus size={14} />
                {loading ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
