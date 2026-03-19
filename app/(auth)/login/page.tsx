'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const domainError = urlError === 'domain'
    ? 'Only @getontop.com accounts are allowed.'
    : urlError === 'oauth'
    ? 'Google sign-in failed. Please try again.'
    : null

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    // browser will redirect; no need to reset loading
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0928]" style={{ background: 'radial-gradient(ellipse at top, #1c1540 0%, #0e0928 70%)' }}>
      <div className="w-full max-w-md px-4">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">Ontop</h1>
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A70] shrink-0" />
          </div>
          <p className="text-white/50 text-sm">OKR Operating System</p>
        </div>

        {/* Card */}
        <div className="bg-gradient-to-br from-[#1c1540] to-[#23174B] border border-white/10 rounded-2xl p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-white">Sign in</h2>
            <p className="text-sm text-white/50">Access your team&apos;s OKRs</p>
          </div>

          {/* Domain / OAuth error from redirect */}
          {domainError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-3 rounded-lg">{domainError}</p>
          )}

          {/* Google OAuth */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-3 h-11"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            {/* Google "G" logo */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            {googleLoading ? 'Redirecting...' : 'Continue with Google'}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email / password */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@getontop.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#FF5A70]/50"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded-lg">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-[#FF5A70] hover:bg-[#ff3f58] text-white font-semibold"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
