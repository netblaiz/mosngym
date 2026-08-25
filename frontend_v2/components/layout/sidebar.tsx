'use client'

import Link                from 'next/link'
import { usePathname }     from 'next/navigation'
import {
  LayoutDashboard, Users, CreditCard, Calendar,
  CheckSquare, UserCog, DollarSign, BarChart3,
  Building2, Target, ClipboardList, Settings,
  Dumbbell, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useState }        from 'react'
import { cn }              from '@/lib/utils'
import { useAuthStore }    from '@/store/auth.store'
import { Button }          from '@/components/ui/button'

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label:      'Overview',
    href:       '/dashboard',
    icon:       LayoutDashboard,
    permission: null,
  },
  {
    label:      'Members',
    href:       '/dashboard/members',
    icon:       Users,
    permission: 'members:read',
  },
  {
    label:      'Plans',
    href:       '/dashboard/plans',
    icon:       ClipboardList,
    permission: 'subscriptions:read',
  },
  {
    label:      'Classes',
    href:       '/dashboard/classes',
    icon:       Calendar,
    permission: 'classes:read',
  },
  {
    label:      'Bookings',
    href:       '/dashboard/bookings',
    icon:       CheckSquare,
    permission: 'bookings:read',
  },
  {
    label:      'Check-ins',
    href:       '/dashboard/checkins',
    icon:       CheckSquare,
    permission: 'checkins:read',
  },
  {
    label:      'Staff',
    href:       '/dashboard/staff',
    icon:       UserCog,
    permission: 'staff:read',
  },
  {
    label:      'Payments',
    href:       '/dashboard/payments',
    icon:       DollarSign,
    permission: 'billing:read',
  },
  {
    label:      'Analytics',
    href:       '/dashboard/analytics',
    icon:       BarChart3,
    permission: 'analytics:read',
  },
  {
    label:      'Leads',
    href:       '/dashboard/leads',
    icon:       Target,
    permission: 'leads:read',
  },
  {
    label:      'Settings',
    href:       '/dashboard/settings',
    icon:       Settings,
    permission: 'settings:read',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname             = usePathname()
  const { user, hasPermission } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.permission || hasPermission(item.permission)
  )

  return (
    <aside className={cn(
      'relative flex flex-col h-screen border-r border-border bg-card',
      'transition-all duration-300',
      collapsed ? 'w-16' : 'w-60'
    )}>

      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 h-16 px-4 border-b border-border',
        collapsed && 'justify-center px-0'
      )}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary shrink-0">
          <Dumbbell className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-semibold text-sm truncate">{user?.gym.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {visibleItems.map((item) => {
          const active = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium',
                'transition-colors duration-150',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className={cn(
          'absolute -right-3 top-20 z-10',
          'flex items-center justify-center',
          'w-6 h-6 rounded-full',
          'bg-background border border-border',
          'text-muted-foreground hover:text-foreground',
          'transition-colors'
        )}
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3" />
          : <ChevronLeft  className="w-3 h-3" />
        }
      </button>

    </aside>
  )
}
