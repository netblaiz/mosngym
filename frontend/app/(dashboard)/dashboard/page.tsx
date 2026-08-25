'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Users, TrendingUp, UserCheck, Dumbbell,
  AlertCircle, Target, Trophy, ArrowUpRight,
  ArrowDownRight, Activity, Clock,
} from 'lucide-react'

async function fetchOverview() {
  const { data } = await api.get('/analytics/overview')
  return data.data
}

async function fetchCheckins() {
  const { data } = await api.get('/checkins', { params: { limit: 5 } })
  return data.data ?? []
}

// ── Glassmorphism card wrapper ────────────────────────────────────────────────
function GlassCard({ children, className = '', style = {} }: {
  children:  React.ReactNode
  className?: string
  style?:     React.CSSProperties
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background:     'rgba(255,255,255,0.05)',
        border:         '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Stat box (like Wins/Losses/Winning% in reference) ────────────────────────
function StatBox({
  label, value, color, icon: Icon, loading,
}: {
  label:   string
  value:   string | number
  color:   string
  icon:    any
  loading: boolean
}) {
  return (
    <GlassCard className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
      </div>
      {loading
        ? <Skeleton className="h-8 w-20" />
        : <p className="text-2xl font-bold text-foreground">{value}</p>
      }
    </GlassCard>
  )
}

// ── Trend badge ───────────────────────────────────────────────────────────────
function Trend({ up, label }: { up: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {label}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data, isLoading, isError } = useQuery({
    queryKey:        ['analytics', 'overview'],
    queryFn:         fetchOverview,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: recentCheckins = [], isLoading: checkinsLoading } = useQuery({
    queryKey: ['checkins', 'recent'],
    queryFn:  fetchCheckins,
  })

  if (isError) return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 m-6">
      <AlertCircle className="h-5 w-5 shrink-0" />
      <p className="text-sm">Failed to load dashboard data. Please refresh.</p>
    </div>
  )

  const thisMonth = parseFloat(data?.revenue?.revenue_this_month ?? '0')
  const lastMonth = parseFloat(data?.revenue?.revenue_last_month ?? '0')
  const revUp     = thisMonth >= lastMonth
  const revDiff   = lastMonth > 0
    ? `${Math.abs(Math.round((thisMonth - lastMonth) / lastMonth * 100))}% vs last month`
    : 'No data last month'

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const gymName  = (user as any)?.gym?.name ?? 'Your Gym'

  return (
    <div className="p-5 space-y-4 min-h-full">

      {/* ── TOP ROW — Hero + Quick Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Hero panel — left 2/3 */}
        <div
          className="lg:col-span-2 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[220px]"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.8) 0%, rgba(236,72,153,0.6) 100%)',
          }}
        >
          {/* Background glow */}
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full opacity-20 blur-3xl bg-white" />
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full opacity-15 blur-2xl bg-white" />
          </div>

          <div className="relative z-10">
            <p className="text-white/70 text-sm">{greeting}</p>
            <h1 className="text-3xl font-bold text-white mt-1">{gymName}</h1>
            <p className="text-white/60 text-sm mt-1">
              {data ? formatDate(data.generatedAt) : 'Loading...'}
            </p>
          </div>

          {/* Big stat highlight */}
          <div className="relative z-10 flex items-end justify-between mt-4">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest">Active Members</p>
              {isLoading
                ? <Skeleton className="h-14 w-24 mt-1" style={{ background: 'rgba(255,255,255,0.2)' }} />
                : <p className="text-6xl font-black text-white mt-1">
                    {data?.members?.active_members ?? 0}
                  </p>
              }
            </div>
            <div className="text-right">
              <p className="text-white/60 text-xs uppercase tracking-widest">Revenue</p>
              {isLoading
                ? <Skeleton className="h-8 w-28 mt-1" style={{ background: 'rgba(255,255,255,0.2)' }} />
                : <>
                    <p className="text-2xl font-bold text-white mt-1">{formatCurrency(thisMonth)}</p>
                    <Trend up={revUp} label={revDiff} />
                  </>
              }
            </div>
          </div>
        </div>

        {/* Quick stats — right 1/3 */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <StatBox label="Check-ins Today" value={data?.checkins?.checkins_today ?? 0}     color="#8b5cf6" icon={UserCheck} loading={isLoading} />
          <StatBox label="Classes Today"   value={data?.classes?.classes_today ?? 0}       color="#ec4899" icon={Dumbbell}  loading={isLoading} />
          <StatBox label="Open Leads"      value={data?.leads?.open_leads ?? 0}            color="#06b6d4" icon={Target}    loading={isLoading} />
          <StatBox label="Failed Payments" value={data?.revenue?.failed_last_7d ?? 0}      color="#f43f5e" icon={AlertCircle} loading={isLoading} />
        </div>
      </div>

      {/* ── MIDDLE ROW — Detailed stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'New Members',
            value: data?.members?.new_last_30d ?? 0,
            sub:   'Last 30 days',
            icon:  Users,
            color: '#8b5cf6',
          },
          {
            label: 'Frozen Members',
            value: data?.members?.frozen ?? 0,
            sub:   'Currently paused',
            icon:  Users,
            color: '#06b6d4',
          },
          {
            label: 'Unique Today',
            value: data?.checkins?.unique_today ?? 0,
            sub:   'Distinct check-ins',
            icon:  UserCheck,
            color: '#10b981',
          },
          {
            label: '7-Day Check-ins',
            value: data?.checkins?.checkins_last_7d ?? 0,
            sub:   'Rolling week',
            icon:  Activity,
            color: '#f59e0b',
          },
        ].map(s => (
          <GlassCard key={s.label} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${s.color}20` }}>
                <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
              </div>
            </div>
            {isLoading
              ? <Skeleton className="h-7 w-16" />
              : <p className="text-2xl font-bold text-foreground">{s.value}</p>
            }
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </GlassCard>
        ))}
      </div>

      {/* ── BOTTOM ROW — Member status + Revenue + Live check-ins ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Member status breakdown */}
        <GlassCard className="p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">Member Status</p>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            [
              { label: 'Active',   value: data?.members?.active_members ?? 0, color: '#10b981' },
              { label: 'Frozen',   value: data?.members?.frozen         ?? 0, color: '#06b6d4' },
              { label: 'Inactive', value: data?.members?.inactive       ?? 0, color: '#6b7280' },
            ].map(s => {
              const total = (data?.members?.active_members ?? 0) + (data?.members?.frozen ?? 0) + (data?.members?.inactive ?? 0)
              const pct   = total > 0 ? Math.round(s.value / total * 100) : 0
              return (
                <div key={s.label} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-semibold text-foreground">
                      {s.value} <span className="text-muted-foreground font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              )
            })
          )}
        </GlassCard>

        {/* Revenue breakdown */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Revenue This Month</p>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2].map(i => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : (
            <>
              <div>
                <p className="text-3xl font-bold text-foreground">{formatCurrency(thisMonth)}</p>
                <Trend up={revUp} label={revDiff} />
              </div>
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last month</span>
                  <span className="text-foreground font-medium">{formatCurrency(lastMonth)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Converted leads</span>
                  <span className="text-foreground font-medium">{data?.leads?.converted_last_30d ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Failed (7d)</span>
                  <span className={`font-medium ${(data?.revenue?.failed_last_7d ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {data?.revenue?.failed_last_7d ?? 0}
                  </span>
                </div>
              </div>
            </>
          )}
        </GlassCard>

        {/* Live check-ins feed */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Recent Check-ins</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Live</span>
            </div>
          </div>
          {checkinsLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recentCheckins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              No check-ins today yet
            </div>
          ) : (
            <div className="space-y-2">
              {recentCheckins.slice(0, 5).map((ci: any) => (
                <div key={ci.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                    >
                      {ci.first_name?.[0]}{ci.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{ci.first_name} {ci.last_name}</p>
                      <p className="text-xs text-muted-foreground">{ci.location_name ?? 'Main gym'}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      background: ci.result === 'granted' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                      borderColor: ci.result === 'granted' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
                      color: ci.result === 'granted' ? '#34d399' : '#fb7185',
                    }}
                  >
                    {ci.result === 'granted' ? '✓ In' : '✗ Denied'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}