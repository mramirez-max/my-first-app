'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Area, Profile } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Target,
  Settings,
  LogOut,
  ChevronRight,
  BarChart3,
  TrendingUp,
  Users,
} from 'lucide-react'

interface SidebarProps {
  profile: Profile | null
  areas: Area[]
}

const AREA_SLUGS: Record<string, string> = {
  'Operations': 'operations',
  'Revenue': 'revenue',
  'Marketing': 'marketing',
  'Customer Success': 'customer-success',
  'Finance': 'finance',
  'Legal': 'legal',
  'Compliance': 'compliance',
  'People': 'people',
  'Tech': 'tech',
  'Product': 'product',
  'Worker Journey': 'worker-journey',
  'Sales': 'sales',
}

export default function Sidebar({ profile, areas }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const roleLabel = {
    admin: 'Admin',
    area_lead: 'Area Lead',
    team_member: 'Member',
  }[profile?.role ?? 'team_member']

  return (
    <aside className="w-64 bg-[#1a1040] border-r border-white/8 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8">
        <img src="/logo-ontop.png" alt="Ontop" className="h-8 w-auto mb-1" />
        <p className="text-xs text-white/40">Global workforce, powered by AI</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <NavItem href="/" icon={<LayoutDashboard size={16} />} active={pathname === '/'}>
          Dashboard
        </NavItem>
        <NavItem href="/company" icon={<Target size={16} />} active={pathname === '/company'}>
          Company OKRs
        </NavItem>
        <NavItem href="/metrics" icon={<TrendingUp size={16} />} active={pathname === '/metrics'}>
          Business Metrics
        </NavItem>

        {/* Areas */}
        <div className="pt-4">
          <p className="px-3 text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">
            Areas
          </p>
          <div className="space-y-0.5">
            {areas.map(area => {
              const slug = AREA_SLUGS[area.name] ?? area.name.toLowerCase().replace(/ /g, '-')
              const href = `/areas/${slug}`
              return (
                <NavItem
                  key={area.id}
                  href={href}
                  icon={<ChevronRight size={14} />}
                  active={pathname === href}
                  small
                >
                  {area.name}
                </NavItem>
              )
            })}
          </div>
        </div>

        {/* My Team — visible to any area member */}
        {profile?.area_id && (
          <div className="pt-4 space-y-0.5">
            <NavItem href={`/team/${profile.area_id}`} icon={<Users size={16} />} active={pathname.startsWith('/team/')}>
              My Team
            </NavItem>
          </div>
        )}

        {/* Admin */}
        {profile?.role === 'admin' && (
          <div className="pt-1 space-y-0.5">
            <NavItem href="/executive" icon={<BarChart3 size={16} />} active={pathname === '/executive'}>
              Executive View
            </NavItem>
            <NavItem href="/admin" icon={<Settings size={16} />} active={pathname === '/admin'}>
              Admin Panel
            </NavItem>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/8 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8 ring-2 ring-[#FF5A70]/50">
            <AvatarFallback className="text-xs bg-[#FF5A70]/20 text-[#FF5A70] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {profile?.full_name ?? 'User'}
            </p>
            <Badge variant="secondary" className="text-xs mt-0.5 bg-white/8 text-white/60 border-0">{roleLabel}</Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-white/40 hover:text-white/80 hover:bg-white/6"
          onClick={handleSignOut}
        >
          <LogOut size={14} className="mr-2" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  icon,
  active,
  children,
  small,
}: {
  href: string
  icon: React.ReactNode
  active: boolean
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        small ? 'text-sm' : '',
        active
          ? 'bg-[#FF5A70]/15 text-[#FF5A70]'
          : 'text-white/60 hover:bg-white/6 hover:text-white'
      )}
    >
      <span className={active ? 'text-[#FF5A70]' : 'text-white/40'}>{icon}</span>
      {children}
    </Link>
  )
}
