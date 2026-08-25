'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AlertTriangle, TrendingDown, Clock } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'

interface Props {
  data:      any
  isLoading: boolean
}

export function RetentionTab({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const churnRate    = Number(data?.churnRate    ?? data?.churn_rate    ?? 0)
  const avgLifetime  = Number(data?.avgLifetime  ?? data?.avg_lifetime  ?? 0)
  const atRisk: any[] = data?.atRisk ?? data?.at_risk ?? []

  const summaryCards = [
    {
      label: '30-Day Churn Rate',
      value: `${churnRate.toFixed(1)}%`,
      sub:   churnRate > 10 ? 'Above average — action needed' : 'Healthy range',
      icon:  TrendingDown,
      color: churnRate > 10 ? 'text-red-400 bg-red-500/10' : 'text-green-400 bg-green-500/10',
    },
    {
      label: 'Avg Membership Lifetime',
      value: `${Math.round(avgLifetime)} days`,
      sub:   `~${(avgLifetime / 30).toFixed(1)} months`,
      icon:  Clock,
      color: 'text-blue-400 bg-blue-500/10',
    },
    {
      label: 'At-Risk Members',
      value: atRisk.length,
      sub:   'No check-in in 14+ days',
      icon:  AlertTriangle,
      color: atRisk.length > 0 ? 'text-yellow-400 bg-yellow-500/10' : 'text-green-400 bg-green-500/10',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {summaryCards.map(c => (
          <div key={c.label} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <div className={`p-2 rounded-lg ${c.color}`}>
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* At-risk members list */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium">At-Risk Members</p>
          <Badge variant="outline" className="text-yellow-400 border-yellow-500/20 bg-yellow-500/10">
            {atRisk.length} members
          </Badge>
        </div>

        {atRisk.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            🎉 No at-risk members — everyone has checked in recently
          </div>
        ) : (
          <div className="space-y-3">
            {atRisk.map((m: any) => {
              const lastSeen = m.last_checkin_at ?? m.last_seen_at
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-yellow-500/10 text-yellow-400">
                        {m.first_name?.[0]}{m.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.first_name} {m.last_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Last seen</p>
                      <p className="text-xs font-medium text-yellow-400">
                        {lastSeen
                          ? formatDistanceToNow(parseISO(lastSeen), { addSuffix: true })
                          : 'Never'
                        }
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs h-7">
                      Send Nudge
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
