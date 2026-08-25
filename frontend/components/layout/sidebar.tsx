'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore, applyTheme } from '@/store/theme.store'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, CreditCard, BookOpen,
  UserCheck, BarChart3, Target, Settings,
  Dumbbell, ShoppingCart, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Overview'  },
  { href: '/members',    icon: Users,            label: 'Members'   },
  { href: '/plans',      icon: CreditCard,       label: 'Plans'     },
  { href: '/classes',    icon: Dumbbell,         label: 'Classes'   },
  { href: '/bookings',   icon: BookOpen,         label: 'Bookings'  },
  { href: '/checkins',   icon: UserCheck,        label: 'Check-ins' },
  { href: '/payments',   icon: ShoppingCart,     label: 'Payments'  },
  { href: '/analytics',  icon: BarChart3,        label: 'Analytics' },
  { href: '/leads',      icon: Target,           label: 'Leads'     },
  { href: '/staff',      icon: Users,            label: 'Staff'     },
  { href: '/settings',   icon: Settings,         label: 'Settings'  },
]

export function Sidebar() {
  const pathname            = usePathname()
  const { user }            = useAuthStore()
  const { themeId }         = useThemeStore()
  const [collapsed, setCollapsed] = useState(false)

  // Re-apply theme on mount
  useEffect(() => { applyTheme(themeId) }, [themeId])

  const gymName = (user as any)?.gym?.name ?? 'GymMaster'
  const initials = gymName.slice(0, 2).toUpperCase()

  return (
    <aside
      className="relative flex flex-col h-full transition-all duration-300 z-10"
      style={{
        width:       collapsed ? 64 : 224,
        background:  'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ background: 'var(--accent-grad)' }}
        >
          {initials}
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold truncate text-foreground">{gymName}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative"
              style={{
                background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                color:      active ? 'var(--sidebar-active)'    : 'hsl(var(--muted-foreground))',
              }}
            >
              {/* Active bar */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--accent-grad)' }}
                />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}

              {/* Collapsed tooltip */}
              {collapsed && (
                <span
                  className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
                  style={{
                    background: 'var(--sidebar-bg)',
                    border:     '1px solid var(--sidebar-border)',
                  }}
                >
                  {label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="absolute -right-3 top-20 h-6 w-6 rounded-full flex items-center justify-center z-20 transition-colors"
        style={{
          background: 'var(--sidebar-bg)',
          border:     '1px solid var(--sidebar-border)',
          color:      'var(--sidebar-active)',
        }}
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3" />
          : <ChevronLeft  className="h-3 w-3" />
        }
      </button>
    </aside>
  )
}
