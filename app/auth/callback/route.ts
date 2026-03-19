import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email ?? ''

      if (!email.endsWith('@getontop.com')) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=domain`)
      }

      return NextResponse.redirect(`${origin}/`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
