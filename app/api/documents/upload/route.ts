import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { put } from '@vercel/blob'

// POST — upload a PDF to Vercel Blob, return the URL
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  const MAX_SIZE = 20 * 1024 * 1024 // 20 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 })
  }

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const slug = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '')
  const pathname = `documents/${Date.now()}_${slug}.pdf`

  const blob = await put(pathname, buffer, {
    access:      'public',
    contentType: 'application/pdf',
  })

  return NextResponse.json({ url: blob.url })
}
