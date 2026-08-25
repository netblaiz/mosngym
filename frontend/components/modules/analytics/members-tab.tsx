'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface Props {
  data:      any
  isLoading: boolean
}

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#6b7280']

export function MembersTab({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  const raw = Array.isArray(data?.snapshots) ? data.snapshots
            : Array.isArray(data)            ? data
            : []
  const snapshots: any[] = raw.map((s: any) => ({
    ...s,
    date:   s.date ? format(parseISO(s.date), 'dd MMM') : '',
    active: Number(s.active_members ?? 0),
    new:    Number(s.new_members    ?? 0),
    churned: Number(s.churned_members ?? 0),
  }))

  const latest    = snapshots[snapshots.length - 1] ?? {}
  const statusDist = [
    { name: 'Active',   value: Number(latest.active_members   ?? data?.active   ?? 0) },
    { name: 'Frozen',   value: Number(latest.frozen_members   ?? data?.frozen   ?? 0) },
    { name: 'Inactive', value: Number(latest.inactive_members ?? data?.inactive ?? 0) },
    { name: 'Banned',   value: Number(latest.banned_members   ?? data?.banned   ?? 0) },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Member growth line chart */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium mb-4">Member Growth</p>
        {snapshots.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No member data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={snapshots}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="active"  name="Active"  stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="new"     name="New"     stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="churned" name="Churned" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Status distribution pie */}
      {statusDist.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium mb-4">Member Status Distribution</p>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={statusDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusDist.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {statusDist.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <Badge variant="secondary" className="ml-auto">{d.value}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
