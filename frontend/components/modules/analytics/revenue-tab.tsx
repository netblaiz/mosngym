'use client'

import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface Props {
  data:      any
  isLoading: boolean
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(val)
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export function RevenueTab({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  // Normalise data — API may return snapshots array or empty
  const raw = Array.isArray(data?.snapshots) ? data.snapshots
            : Array.isArray(data)            ? data
            : []
  const snapshots: any[] = raw.map((s: any) => ({
    ...s,
    date:    s.date ? format(parseISO(s.date), 'dd MMM') : '',
    revenue: Number(s.revenue_total ?? s.revenue ?? 0),
    refunds: Number(s.refunds_total ?? s.refunds ?? 0),
    net:     Number(s.revenue_total ?? s.revenue ?? 0) - Number(s.refunds_total ?? s.refunds ?? 0),
  }))

  const totalRevenue = snapshots.reduce((a, s) => a + s.revenue, 0)
  const totalRefunds = snapshots.reduce((a, s) => a + s.refunds, 0)
  const netRevenue   = totalRevenue - totalRefunds

  const summaryCards = [
    { label: 'Gross Revenue',  value: formatCurrency(totalRevenue), color: 'text-green-400' },
    { label: 'Refunds',        value: formatCurrency(totalRefunds), color: 'text-red-400'   },
    { label: 'Net Revenue',    value: formatCurrency(netRevenue),   color: 'text-blue-400'  },
  ]

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {summaryCards.map(c => (
          <div key={c.label} className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue area chart */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium mb-4">Revenue Over Time</p>
        {snapshots.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No revenue data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={snapshots}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#22c55e"
                fill="url(#revenueGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue vs Refunds bar chart */}
      {snapshots.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium mb-4">Revenue vs Refunds</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={snapshots}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="refunds" name="Refunds"  fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
