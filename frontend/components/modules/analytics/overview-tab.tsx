'use client'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Users, TrendingUp, CalendarCheck, AlertCircle,
  UserCheck, DollarSign, Activity, Target,
} from 'lucide-react'

interface Props {
  data:      any
  isLoading: boolean
}

function formatCurrency(val: string | number | undefined) {
  if (val === undefined || val === null) return '₦0'
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(Number(val))
}

function StatCard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label:   string
  value:   string | number
  sub?:    string
  icon:    any
  color:   string
  loading: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {loading
        ? <Skeleton className="h-8 w-24" />
        : <p className="text-2xl font-bold">{value}</p>
      }
      {sub && !loading && (
        <p className="text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  )
}

export function OverviewTab({ data, isLoading }: Props) {
  const members  = data?.members  ?? {}
  const revenue  = data?.revenue  ?? {}
  const checkins = data?.checkins ?? {}
  const classes  = data?.classes  ?? {}
  const leads    = data?.leads    ?? {}

  const cards = [
    {
      label: 'Active Members',
      value: members.active_members ?? 0,
      sub:   `+${members.new_last_30d ?? 0} this month`,
      icon:  Users,
      color: 'bg-blue-500/10 text-blue-400',
    },
    {
      label: 'Revenue This Month',
      value: formatCurrency(revenue.revenue_this_month),
      sub:   `Last month: ${formatCurrency(revenue.revenue_last_month)}`,
      icon:  DollarSign,
      color: 'bg-green-500/10 text-green-400',
    },
    {
      label: 'Check-ins Today',
      value: checkins.checkins_today ?? 0,
      sub:   `${checkins.checkins_last_7d ?? 0} last 7 days`,
      icon:  UserCheck,
      color: 'bg-purple-500/10 text-purple-400',
    },
    {
      label: 'Classes Today',
      value: classes.classes_today ?? 0,
      sub:   `Avg fill: ${Number(classes.avg_fill_rate_today ?? 0).toFixed(0)}%`,
      icon:  CalendarCheck,
      color: 'bg-orange-500/10 text-orange-400',
    },
    {
      label: 'Frozen Members',
      value: members.frozen ?? 0,
      sub:   `${members.inactive ?? 0} inactive`,
      icon:  Activity,
      color: 'bg-yellow-500/10 text-yellow-400',
    },
    {
      label: 'Failed Payments',
      value: revenue.failed_last_7d ?? 0,
      sub:   'Last 7 days',
      icon:  AlertCircle,
      color: 'bg-red-500/10 text-red-400',
    },
    {
      label: 'Open Leads',
      value: leads.open_leads ?? 0,
      sub:   `${leads.converted_last_30d ?? 0} converted this month`,
      icon:  Target,
      color: 'bg-pink-500/10 text-pink-400',
    },
    {
      label: 'Unique Check-ins Today',
      value: checkins.unique_today ?? 0,
      sub:   'Distinct members',
      icon:  TrendingUp,
      color: 'bg-cyan-500/10 text-cyan-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <StatCard key={c.label} {...c} loading={isLoading} />
      ))}
    </div>
  )
}
