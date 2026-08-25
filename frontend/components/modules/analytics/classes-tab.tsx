'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

interface Props {
  data:      any
  isLoading: boolean
}

export function ClassesTab({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  // API returns array of class stats or wrapped object
  const classes: any[] = Array.isArray(data) ? data : (data?.classes ?? data?.rows ?? [])

  const chartData = classes.slice(0, 10).map((c: any) => ({
    name:     c.name ?? c.template_name ?? 'Unknown',
    bookings: Number(c.total_bookings   ?? c.bookings ?? 0),
    sessions: Number(c.total_sessions   ?? c.sessions ?? 0),
    fillRate: Number(c.avg_fill_rate    ?? c.fill_rate ?? 0),
  }))

  return (
    <div className="space-y-6">
      {/* Fill rate bar chart */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium mb-4">Class Fill Rates</p>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No class data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Fill Rate']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="fillRate" name="Fill Rate" fill="#a855f7" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Class breakdown table */}
      {classes.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium mb-4">Class Performance</p>
          <div className="space-y-4">
            {classes.slice(0, 8).map((c: any, i: number) => {
              const fillRate = Number(c.avg_fill_rate ?? c.fill_rate ?? 0)
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.name ?? c.template_name ?? 'Unknown'}</span>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{c.total_sessions ?? c.sessions ?? 0} sessions</span>
                      <span>{c.total_bookings ?? c.bookings ?? 0} bookings</span>
                      <Badge variant={fillRate >= 80 ? 'default' : fillRate >= 50 ? 'secondary' : 'outline'}>
                        {fillRate.toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                  <Progress value={fillRate} className="h-1.5" />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
