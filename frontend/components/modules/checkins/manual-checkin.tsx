'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2, XCircle, AlertCircle, CreditCard,
  UserCheck, Loader2, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckinResult {
  granted:    boolean
  code?:      string
  message?:   string
  amountOwed?: number
  checkinId?: string
  member?:    { id: string; firstName: string; lastName: string }
}

const DENIAL_ICONS: Record<string, any> = {
  PAYMENT_REQUIRED:  CreditCard,
  MEMBERSHIP_EXPIRED: AlertCircle,
  NO_MEMBERSHIP:     AlertCircle,
  MEMBER_BANNED:     XCircle,
  MEMBER_FROZEN:     AlertCircle,
  OUTSIDE_HOURS:     AlertCircle,
}

const DENIAL_COLORS: Record<string, string> = {
  PAYMENT_REQUIRED:   'border-red-500/30 bg-red-500/5 text-red-400',
  MEMBERSHIP_EXPIRED: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400',
  NO_MEMBERSHIP:      'border-yellow-500/30 bg-yellow-500/5 text-yellow-400',
  MEMBER_BANNED:      'border-red-500/30 bg-red-500/5 text-red-400',
  MEMBER_FROZEN:      'border-blue-500/30 bg-blue-500/5 text-blue-400',
  OUTSIDE_HOURS:      'border-slate-500/30 bg-slate-500/5 text-slate-400',
}

interface Props {
  locationId?: string
  onSuccess?:  () => void
}

export function ManualCheckin({ locationId, onSuccess }: Props) {
  const qc = useQueryClient()
  const [memberSearch, setMemberSearch]   = useState('')
  const [members, setMembers]             = useState<any[]>([])
  const [searching, setSearching]         = useState(false)
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [result, setResult]               = useState<CheckinResult | null>(null)

  // Search members as user types
  useEffect(() => {
    if (!memberSearch.trim()) { setMembers([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get('/members', { params: { search: memberSearch, limit: 10 } })
        if (!cancelled) setMembers(res.data?.data ?? [])
      } catch {
        if (!cancelled) setMembers([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [memberSearch])

  const checkin = useMutation({
    mutationFn: (memberId: string) => api.post('/checkins', {
      memberId,
      method:     'manual',
      locationId: locationId ?? undefined,
    }),
    onSuccess: (res) => {
      const data: CheckinResult = res.data?.data ?? res.data
      setResult(data)
      if (data.granted) {
        qc.invalidateQueries({ queryKey: ['checkins'] })
        qc.invalidateQueries({ queryKey: ['checkins-today'] })
        onSuccess?.()
        // Auto-clear success after 4 seconds
        setTimeout(() => { setResult(null); setSelectedMember(null); setMemberSearch('') }, 4000)
      }
    },
    onError: (e: any) => {
      setResult({
        granted: false,
        code:    'ERROR',
        message: e.response?.data?.error?.message ?? 'Check-in failed',
      })
    },
  })

  function selectMember(m: any) {
    setSelectedMember(m)
    setMemberSearch(`${m.first_name} ${m.last_name}`)
    setMembers([])
    setResult(null)
  }

  function handleCheckin() {
    if (!selectedMember) return
    setResult(null)
    checkin.mutate(selectedMember.id)
  }

  function reset() {
    setSelectedMember(null)
    setMemberSearch('')
    setResult(null)
    setMembers([])
  }

  const DenialIcon = result?.code ? (DENIAL_ICONS[result.code] ?? XCircle) : XCircle

  return (
    <div className="space-y-4">

      {/* Member search */}
      <div className="space-y-1.5">
        <Label>Search Member</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Type name or email…"
            className="pl-9"
            value={memberSearch}
            onChange={e => { setMemberSearch(e.target.value); setSelectedMember(null); setResult(null) }}
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {members.length > 0 && (
            <div className="absolute z-50 w-full mt-1 border rounded-lg bg-popover shadow-lg divide-y max-h-48 overflow-y-auto">
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                  onMouseDown={e => { e.preventDefault(); selectMember(m) }}
                >
                  <span className="font-medium">{m.first_name} {m.last_name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{m.email}</span>
                  {m.subscription && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {m.subscription.planName}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected member card */}
      {selectedMember && !result && (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-accent/30">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              {selectedMember.first_name[0]}{selectedMember.last_name[0]}
            </div>
            <div>
              <p className="text-sm font-medium">{selectedMember.first_name} {selectedMember.last_name}</p>
              <p className="text-xs text-muted-foreground">
                {selectedMember.subscription?.planName ?? 'No active plan'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleCheckin}
            disabled={checkin.isPending}
          >
            {checkin.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><UserCheck className="h-4 w-4 mr-1.5" /> Check In</>
            }
          </Button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={cn(
          'rounded-xl border p-4 space-y-3',
          result.granted
            ? 'border-green-500/30 bg-green-500/5'
            : (DENIAL_COLORS[result.code ?? ''] ?? 'border-red-500/30 bg-red-500/5')
        )}>
          <div className="flex items-center gap-3">
            {result.granted
              ? <CheckCircle2 className="h-6 w-6 text-green-400 shrink-0" />
              : <DenialIcon className={cn(
                  'h-6 w-6 shrink-0',
                  DENIAL_COLORS[result.code ?? '']?.includes('yellow') ? 'text-yellow-400'
                  : DENIAL_COLORS[result.code ?? '']?.includes('blue') ? 'text-blue-400'
                  : 'text-red-400'
                )} />
            }
            <div>
              {result.granted ? (
                <>
                  <p className="text-sm font-semibold text-green-400">Access Granted ✓</p>
                  <p className="text-sm text-muted-foreground">
                    {result.member?.firstName} {result.member?.lastName} checked in successfully
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Access Denied</p>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                </>
              )}
            </div>
          </div>

          {/* Payment required — show amount */}
          {result.code === 'PAYMENT_REQUIRED' && result.amountOwed && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-2">
              <p className="text-sm font-medium text-red-400">
                Outstanding Balance: ₦{Number(result.amountOwed).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                This member must clear their outstanding balance before they can check in.
                Go to their profile → Accounts &amp; Billing to record a payment.
              </p>
            </div>
          )}

          {/* Expired membership */}
          {(result.code === 'MEMBERSHIP_EXPIRED' || result.code === 'NO_MEMBERSHIP') && (
            <p className="text-xs text-muted-foreground">
              Go to the member's profile → Membership tab to assign or renew a plan.
            </p>
          )}

          {!result.granted && (
            <Button variant="outline" size="sm" onClick={reset}>
              Try Another Member
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
