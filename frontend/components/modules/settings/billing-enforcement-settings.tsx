'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { notify } from '@/lib/toast'
import { ShieldCheck, CreditCard, AlertCircle } from 'lucide-react'

export function BillingEnforcementSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gym-settings'],
    queryFn:  () => api.get('/gym/settings').then(r => r.data),
  })

  const settings = data?.data?.settings ?? {}

  const [requirePayment, setRequirePayment] = useState<boolean>(true)
  const [graceAmount,    setGraceAmount]    = useState<string>('0')

  // Sync from API
  useEffect(() => {
    if (data?.data) {
      setRequirePayment(settings.requirePaymentForCheckin ?? true)
      setGraceAmount(String(settings.checkinGraceAmount ?? 0))
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => api.patch('/gym/settings', {
      settings: {
        ...settings,
        requirePaymentForCheckin: requirePayment,
        checkinGraceAmount:       Number(graceAmount),
      },
    }),
    onSuccess: () => {
      notify.success('Billing settings saved')
      qc.invalidateQueries({ queryKey: ['gym-settings'] })
    },
    onError: () => notify.error('Failed to save settings'),
  })

  if (isLoading) return null

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-muted/20 border-b">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Check-in Enforcement</h3>
          <p className="text-xs text-muted-foreground">
            Control whether members with outstanding balances can access the gym
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">

        {/* Require payment toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Require Payment for Check-in</p>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Block check-in if member has an outstanding balance
            </p>
          </div>
          <Switch
            checked={requirePayment}
            onCheckedChange={setRequirePayment}
          />
        </div>

        {/* Grace amount */}
        {requirePayment && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Grace Amount (₦)</Label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Allow check-in if outstanding balance is below this amount.
                Set to 0 to block any outstanding balance.
              </p>
              <div className="pl-6">
                <Input
                  type="number"
                  className="w-40"
                  value={graceAmount}
                  onChange={e => setGraceAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>
          </>
        )}

        {/* Info box */}
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How this works:</p>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>When enabled, members with pending/failed payments are denied at the door</li>
            <li>The denial message shows the exact amount owed</li>
            <li>Staff can override by recording a manual payment first</li>
            <li>Grace amount lets small balances through (e.g. ₦500 for rounding)</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
