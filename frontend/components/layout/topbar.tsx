'use client'

import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { Bell, Search, LogOut } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'

export function Topbar() {
  const { user, logout } = useAuthStore()
  const router           = useRouter()
  const userData         = user as any

  const firstName = userData?.firstName ?? userData?.first_name ?? ''
  const lastName  = userData?.lastName ?? userData?.last_name ?? ''
  const initials  = user
    ? `${String(firstName)?.[0] ?? ''}${String(lastName)?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U'
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'User'

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <header className="flex items-center justify-between px-6 h-14 shrink-0 z-10 border-b"
      style={{
        background:     'rgba(var(--body-bg), 0.8)',
        backdropFilter: 'blur(12px)',
        borderColor:    'var(--sidebar-border)',
      }}
    >
      {/* Search */}
      <div className="relative max-w-xs w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search..." className="pl-8 h-8 text-sm" />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">

        {/* Theme switcher */}
        <ThemeSwitcher />

        {/* Notifications */}
        <button className="relative h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold text-white cursor-pointer"
              style={{ background: 'var(--accent-grad)' }}
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground capitalize">{String(userData?.role ?? user?.role ?? '').toLowerCase()}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive gap-2 cursor-pointer">
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
