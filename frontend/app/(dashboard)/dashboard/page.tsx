'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Users, TrendingUp, UserCheck, CreditCard,
  AlertCircle, ArrowUpRight, ArrowDownRight,
  Clock, RefreshCw, UserX, DollarSign,
  Calendar, Flame, CheckCircle2, XCircle, Sparkles,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

// ─── Currency helpers ─────────────────────────────────────────────────────────

function getGymCurrency(): string {
  if (typeof window === 'undefined') return 'NGN'
  return localStorage.getItem('gym_currency') ?? 'NGN'
}

function setGymCurrency(currency: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem('gym_currency', currency)
}

function formatCurrency(amount: string | number | undefined | null, currency?: string): string {
  const value = Number(amount ?? 0)
  const cur   = currency ?? getGymCurrency()
  try {
    return new Intl.NumberFormat('en', {
      style:                 'currency',
      currency:              cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${cur} ${value.toLocaleString()}`
  }
}

function getCurrencySymbol(currency?: string): string {
  const c = currency ?? getGymCurrency()
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency', currency: c, minimumFractionDigits: 0,
    }).formatToParts(0)
    return parts.find(p => p.type === 'currency')?.value ?? c
  } catch {
    return c
  }
}

// Currency symbol rendered as icon-sized element
function CurrencyIcon({ currency, style }: { currency?: string; style?: React.CSSProperties }) {
  const symbol = getCurrencySymbol(currency)
  return (
    <span
      className="inline-flex items-center justify-center font-bold leading-none"
      style={{ fontSize: '13px', ...style }}
    >
      {symbol}
    </span>
  )
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────
const fetchOverview  = () => api.get('/analytics/overview').then(r => r.data.data)
const fetchRetention = () => api.get('/analytics/retention').then(r => r.data.data)
const fetchCheckins  = () => api.get('/checkins', { params: { limit: 8 } }).then(r => r.data.data ?? [])
const fetchPayments  = () => api.get('/payments', { params: { status: 'pending', limit: 50 } }).then(r => r.data)
const fetchRevenue   = () => api.get('/analytics/revenue').then(r => r.data.data)
const fetchMembers   = () => api.get('/analytics/members').then(r => r.data.data)
const fetchGym       = () => api.get('/gym').then(r => r.data.data)

// ─── UI helpers ───────────────────────────────────────────────────────────────
function GlassCard({ children, className = '', style = {}, onClick }: {
  children:   React.ReactNode
  className?: string
  style?:     React.CSSProperties
  onClick?:   () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl ${className} ${onClick ? 'cursor-pointer hover:border-white/20 transition-all duration-150 active:scale-[0.99]' : ''}`}
      style={{
        background:     'rgba(255,255,255,0.04)',
        border:         '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Trend({ up, label }: { up: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {label}
    </span>
  )
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const color    = up ? '#10b981' : '#f43f5e'
  const chartData = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length
              ? <div className="rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(0,0,0,0.8)', color: '#fff' }}>
                  {payload[0].value}
                </div>
              : null
          }
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function PulseCard({ label, value, trend, sub, icon: Icon, color, loading, onClick, sparkData, isCurrency, currency }: {
  label:       string
  value:       string | number
  trend?:      { up: boolean; label: string }
  sub?:        string
  icon:        any
  color:       string
  loading:     boolean
  onClick:     () => void
  sparkData?:  number[]
  isCurrency?: boolean
  currency?:   string
}) {
  const sparkUp = sparkData
    ? sparkData[sparkData.length - 1] >= sparkData[0]
    : (trend?.up ?? true)

  return (
    <GlassCard className="p-4 space-y-2 relative overflow-hidden" onClick={onClick}>
      <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-15 pointer-events-none"
        style={{ background: color }} />

      <div className="relative flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium leading-none">
          {label}
        </p>
        <div className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}20` }}>
          {isCurrency
            ? <CurrencyIcon currency={currency} style={{ color }} />
            : <Icon className="h-4 w-4" style={{ color }} />
          }
        </div>
      </div>

      <div className="relative">
        {loading
          ? <Skeleton className="h-8 w-24" />
          : <p className="text-2xl font-black text-foreground tracking-tight leading-none">{value}</p>
        }
      </div>

      {!loading && sparkData && sparkData.length > 1 && (
        <Sparkline data={sparkData} up={sparkUp} />
      )}
      {loading && <Skeleton className="h-9 w-full rounded-lg" />}

      {!loading && (
        <div className="relative">
          {trend
            ? <Trend up={trend.up} label={trend.label} />
            : <p className="text-xs text-muted-foreground">{sub}</p>
          }
        </div>
      )}
    </GlassCard>
  )
}

function AlertCard({ type, title, body, actions, icon: Icon, color }: {
  type:    'critical' | 'warning' | 'opportunity' | 'info'
  title:   string
  body:    string
  actions: { label: string; onClick: () => void; primary?: boolean }[]
  icon:    any
  color:   string
}) {
  const border = {
    critical:    'rgba(244,63,94,0.3)',
    warning:     'rgba(245,158,11,0.3)',
    opportunity: 'rgba(16,185,129,0.3)',
    info:        'rgba(139,92,246,0.3)',
  }[type]

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: `${color}08`, border: `1px solid ${border}` }}>
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${color}20` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
        </div>
      </div>
      <div className="flex gap-2 pl-10 flex-wrap">
        {actions.map((a, i) => (
          <button key={i} onClick={a.onClick}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={a.primary ? { background: color, color: '#fff' } : { background: `${color}15`, color }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function RetentionScore({ score, loading, onClick }: { score: number; loading: boolean; onClick: () => void }) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#f43f5e'
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'At Risk' : 'Critical'
  return (
    <GlassCard className="p-4 h-full flex flex-col justify-center" onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
              strokeDasharray={`${score} 100`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s ease' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
            {loading ? '…' : score}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Retention</p>
          <p className="text-2xl font-black text-foreground leading-none mt-1">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">Visit freq + payments</p>
        </div>
      </div>
    </GlassCard>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router   = useRouter()
  const qc       = useQueryClient()
  const { user } = useAuthStore()

  // Gym profile — for currency
  const { data: gymData } = useQuery({ queryKey: ['gym-profile'], queryFn: fetchGym, staleTime: 10 * 60 * 1000 })
  const currency = gymData?.currency ?? getGymCurrency()

  // Persist currency to localStorage whenever it loads
  useEffect(() => {
    if (gymData?.currency) setGymCurrency(gymData.currency)
  }, [gymData?.currency])

  const { data, isLoading }                           = useQuery({ queryKey: ['analytics', 'overview'],  queryFn: fetchOverview,  refetchInterval: 60_000 })
  const { data: retention, isLoading: retLoading }    = useQuery({ queryKey: ['analytics', 'retention'], queryFn: fetchRetention, refetchInterval: 120_000 })
  const { data: checkins = [], isLoading: ciLoading } = useQuery({ queryKey: ['checkins', 'recent'],     queryFn: fetchCheckins,  refetchInterval: 15_000 })
  const { data: paymentsData }                        = useQuery({ queryKey: ['payments', 'pending'],    queryFn: fetchPayments })
  const { data: revenueData }                         = useQuery({ queryKey: ['analytics', 'revenue'],   queryFn: fetchRevenue })
  const { data: membersData }                         = useQuery({ queryKey: ['analytics', 'members'],   queryFn: fetchMembers })

  const thisMonth = parseFloat(data?.revenue?.revenue_this_month ?? '0')
  const lastMonth = parseFloat(data?.revenue?.revenue_last_month ?? '0')
  const revUp     = thisMonth >= lastMonth
  const revPct    = lastMonth > 0 ? Math.abs(Math.round((thisMonth - lastMonth) / lastMonth * 100)) : 0
  const revPace   = lastMonth > 0 ? Math.round((thisMonth / lastMonth) * 100) : 0

  const atRisk: any[]          = retention?.atRisk ?? []
  const pendingPayments: any[] = paymentsData?.data ?? []
  const totalOwed              = pendingPayments.reduce((s: number, p: any) => s + Number(p.amount), 0)
  const activeMembers          = data?.members?.active_members ?? 0
  const churnRate              = Number(retention?.churnRate ?? 0)
  const atRiskPct              = activeMembers > 0 ? (atRisk.length / activeMembers) * 100 : 0
  const retentionScore         = Math.max(0, Math.min(100, Math.round(100 - (churnRate * 2) - (atRiskPct * 0.5))))

  const rawRevSnaps: any[] = Array.isArray(revenueData?.snapshots) ? revenueData.snapshots : Array.isArray(revenueData) ? revenueData : []
  const rawMemSnaps: any[] = Array.isArray(membersData?.snapshots) ? membersData.snapshots : Array.isArray(membersData) ? membersData : []
  const revSpark  = rawRevSnaps.slice(-7).map((s: any) => Number(s.revenue_total ?? s.revenue ?? 0))
  const memSpark  = rawMemSnaps.slice(-7).map((s: any) => Number(s.active_members ?? 0))
  const mockUp    = [3, 4, 4, 5, 6, 5, 7]
  const mockDown  = [7, 6, 6, 5, 4, 5, 3]

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const gymName  = gymData?.name ?? (user as any)?.gym?.name ?? 'Your Gym'

  // AI Alerts
  const alerts: any[] = []

  if (lastMonth > 0 && revPace < 80) {
    const day  = new Date().getDate()
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const proj = Math.round((thisMonth / day) * days)
    alerts.push({
      type: 'critical', icon: TrendingUp, color: '#f43f5e',
      title: `Revenue is ${revPct}% behind last month's pace`,
      body:  `At current pace you'll end at ${formatCurrency(proj, currency)} — ${formatCurrency(lastMonth - proj, currency)} below target. ${pendingPayments.length} unpaid dues totalling ${formatCurrency(totalOwed, currency)}.`,
      actions: [
        { label: 'Chase Payments', primary: true, onClick: () => router.push('/payments') },
        { label: 'View Analytics',               onClick: () => router.push('/analytics') },
      ],
    })
  }

  if (totalOwed > 0) {
    alerts.push({
      type: 'warning', icon: DollarSign, color: '#f59e0b',
      title: `${pendingPayments.length} members owe ${formatCurrency(totalOwed, currency)}`,
      body:  `Unpaid membership dues sitting uncollected. Send reminders before their next visit to recover this revenue.`,
      actions: [
        { label: 'Send Reminders', primary: true, onClick: () => router.push('/payments') },
        { label: 'View Members',                  onClick: () => router.push('/members') },
      ],
    })
  }

  if (atRisk.length > 0) {
    alerts.push({
      type: 'warning', icon: UserX, color: '#f59e0b',
      title: `${atRisk.length} members showing churn signals`,
      body:  `No visits in 14+ days. 60% of inactive members cancel within 30 days without contact. A win-back message can recover most of them.`,
      actions: [
        { label: 'View At-Risk',  primary: true, onClick: () => router.push('/analytics?tab=retention') },
        { label: 'Send Win-back',               onClick: () => router.push('/members') },
      ],
    })
  }

  if ((data?.leads?.open_leads ?? 0) > 0) {
    alerts.push({
      type: 'opportunity', icon: Flame, color: '#10b981',
      title: `${data?.leads?.open_leads} leads waiting for follow-up`,
      body:  `40% of gym leads convert with one follow-up within 7 days. Every day without contact reduces conversion by ~8%.`,
      actions: [{ label: 'Follow Up Now', primary: true, onClick: () => router.push('/leads') }],
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      type: 'info', icon: CheckCircle2, color: '#10b981',
      title: 'Everything looks great today',
      body:  'No critical issues detected. Revenue on pace, members visiting, payments up to date.',
      actions: [{ label: 'View Analytics', onClick: () => router.push('/analytics') }],
    })
  }

  return (
    <div className="p-5 space-y-4 min-h-full overflow-y-auto">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="text-xl font-bold text-foreground mt-0.5">{gymName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries()}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <div className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {new Date().toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {/* ══ ZONE 1: THE PULSE ══ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <PulseCard
          label="Active Members" value={data?.members?.active_members ?? 0}
          trend={{ up: (data?.members?.new_last_30d ?? 0) >= 0, label: `+${data?.members?.new_last_30d ?? 0} this month` }}
          icon={Users} color="#8b5cf6" loading={isLoading}
          onClick={() => router.push('/members')}
          sparkData={memSpark.length > 1 ? memSpark : mockUp}
        />
        <PulseCard
          label="Revenue MTD" value={formatCurrency(thisMonth, currency)}
          trend={{ up: revUp, label: `${revUp ? '+' : '-'}${revPct}% vs last month` }}
          icon={TrendingUp} color="#ec4899" loading={isLoading}
          onClick={() => router.push('/payments')}
          sparkData={revSpark.length > 1 ? revSpark : (revUp ? mockUp : mockDown)}
          isCurrency currency={currency}
        />
        <PulseCard
          label="Check-ins Today" value={data?.checkins?.checkins_today ?? 0}
          sub={`${data?.checkins?.unique_today ?? 0} unique members`}
          icon={UserCheck} color="#06b6d4" loading={isLoading}
          onClick={() => router.push('/checkins')}
          sparkData={mockUp}
        />
        <PulseCard
          label="Total Owed" value={formatCurrency(totalOwed, currency)}
          sub={`${pendingPayments.length} unpaid dues`}
          icon={CreditCard} color={totalOwed > 0 ? '#f43f5e' : '#10b981'} loading={isLoading}
          onClick={() => router.push('/payments?status=pending')}
          sparkData={totalOwed > 0 ? mockDown : mockUp}
          isCurrency currency={currency}
        />
        <div className="col-span-2 lg:col-span-1">
          <RetentionScore score={retentionScore} loading={retLoading}
            onClick={() => router.push('/analytics?tab=retention')} />
        </div>
      </div>

      {/* ══ ZONE 2 + 3 ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* AI Command Centre */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <p className="text-sm font-semibold text-foreground">AI Command Centre</p>
            <Badge variant="outline" className="text-xs ml-auto"
              style={{ borderColor: 'rgba(139,92,246,0.3)', color: '#a78bfa', background: 'rgba(139,92,246,0.08)' }}>
              {alerts.length} insight{alerts.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="space-y-3">
            {alerts.map((a, i) => <AlertCard key={i} {...a} />)}
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: 'Frozen',     value: data?.members?.frozen         ?? 0, sub: 'paused memberships', color: '#06b6d4', icon: Calendar,   href: '/members?status=frozen'   },
              { label: 'At-Risk',    value: atRisk.length,                       sub: 'no visit 14+ days', color: '#f59e0b', icon: UserX,       href: '/analytics?tab=retention' },
              { label: 'Failed (7d)',value: data?.revenue?.failed_last_7d ?? 0,  sub: 'payment failures',  color: '#f43f5e', icon: AlertCircle, href: '/payments?status=failed'  },
            ].map(s => (
              <GlassCard key={s.label} className="p-4 space-y-2" onClick={() => router.push(s.href)}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                </div>
                {isLoading || retLoading
                  ? <Skeleton className="h-7 w-12" />
                  : <p className="text-2xl font-bold text-foreground">{s.value}</p>
                }
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Live Feed */}
        <GlassCard className="p-5 flex flex-col gap-4" style={{ minHeight: 400 }}>
          <div className="flex items-center justify-between shrink-0">
            <p className="text-sm font-semibold text-foreground">Live Feed</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Real-time</span>
            </div>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {ciLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="h-8 w-8 rounded-xl shrink-0" />
                  <div className="space-y-1 flex-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>
                </div>
              ))
            ) : checkins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No activity yet today</p>
              </div>
            ) : (
              checkins.map((ci: any) => {
                const granted  = ci.result === 'granted'
                const initials = `${ci.first_name?.[0] ?? ''}${ci.last_name?.[0] ?? ''}`
                const ago      = ci.checked_in_at ? formatDistanceToNow(parseISO(ci.checked_in_at), { addSuffix: true }) : ''
                return (
                  <div key={ci.id}
                    className="flex items-center gap-3 py-2.5 border-b last:border-0 cursor-pointer hover:bg-white/5 rounded-lg px-1 transition-colors"
                    style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                    onClick={() => router.push(`/members/${ci.member_id}`)}
                  >
                    <div className="h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: granted ? 'linear-gradient(135deg,#8b5cf6,#06b6d4)' : 'rgba(244,63,94,0.3)' }}>
                      {initials || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{ci.first_name} {ci.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ci.location_name ?? 'Main gym'} · {ago}</p>
                    </div>
                    {granted
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      : <XCircle      className="h-4 w-4 text-red-400 shrink-0" />
                    }
                  </div>
                )
              })
            )}
          </div>
          <div className="shrink-0 pt-3 border-t space-y-2 cursor-pointer"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            onClick={() => router.push('/analytics')}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Monthly Revenue Pace</span>
              <span className={`font-semibold ${revPace >= 80 ? 'text-emerald-400' : 'text-red-400'}`}>{revPace}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width:      `${Math.min(revPace, 100)}%`,
                  background: revPace >= 80 ? 'linear-gradient(90deg,#10b981,#06b6d4)' : 'linear-gradient(90deg,#f43f5e,#f59e0b)',
                }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(thisMonth, currency)} of ~{formatCurrency(lastMonth, currency)} target
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}