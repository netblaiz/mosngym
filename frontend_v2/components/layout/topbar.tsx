'use client'

import { usePathname }  from 'next/navigation'
import { Moon, Sun, Bell, LogOut, User } from 'lucide-react'
import { useTheme }     from 'next-themes'
import { Button }       from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/auth.store'
import { getInitials }  from '@/lib/utils'

// Page title map
const PAGE_TITLES: Record<string, string> = {
  '/dashboard':            'Overview',
  '/dashboard/members':    'Members',
  '/dashboard/plans':      'Membership Plans',
  '/dashboard/classes':    'Classes',
  '/dashboard/bookings':   'Bookings',
  '/dashboard/checkins':   'Check-ins',
  '/dashboard/staff':      'Staff',
  '/dashboard/payments':   'Payments',
  '/dashboard/analytics':  'Analytics',
  '/dashboard/leads':      'Leads',
  '/dashboard/settings':   'Settings',
}

export function Topbar() {
  const pathname       = usePathname()
  const { theme, setTheme } = useTheme()
  const { user, logout }    = useAuthStore()

  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname.startsWith(path))?.[1] ?? 'Dashboard'

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card">

      {/* Page title */}
      <h1 className="text-lg font-semibold">{title}</h1>

      {/* Right side */}
      <div className="flex items-center gap-2">

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-muted-foreground"
        >
          <Sun  className="w-4 h-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute w-4 h-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="w-4 h-4" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {user ? getInitials(user.gym.name) : 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.gym.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  )
}
