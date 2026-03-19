import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // Verify the caller is an admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, fullName, role, areaId } = await req.json()
  if (!email || !fullName) return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })

  const admin = createAdminClient()

  // Invite the user — Supabase sends them a magic link email
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Upsert profile with correct role and area (trigger may not have fired yet)
  await admin.from('profiles').upsert({
    id: data.user.id,
    full_name: fullName,
    role: role ?? 'team_member',
    area_id: areaId || null,
  })

  return NextResponse.json({ success: true })
}
