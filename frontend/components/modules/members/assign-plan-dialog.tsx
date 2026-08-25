'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { notify } from '@/lib/toast'
import { CheckCircle2, AlertCircle, CreditCard } from 'lucide-react'
import { format } from 'date-fns'

const schema = z.object({
  planId:        z.string().min(1, 'Select a plan'),
  startDate:     z.string().min(1, 'Select a start date'),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'other']),
  collectNow:    z.boolean(),
})

type FormData = z.infer<typeof schema>

interface Props {
  member:  any
  open:    boolean
  onClose: () => void
}

function formatCurrency(amount: string | number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(Number(amount))
}

const CYCLE_LABELS: Record<string, string> = {
  weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly',
  yearly: 'Yearly', one_time: 'One-time', drop_in: 'Drop-in',
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash'         },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card',          label: 'Card'          },
  { value: 'other',         label: 'Other'         },
]

export function AssignPlanDialog({ member, open, onClose }: Props) {
  const qc = useQueryClient()
  const [step, setStep]           = useState<'plan' | 'payment'>('plan')
  const [assignedSub, setAssignedSub] = useState<any>(null)

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn:  () => api.get('/plans').then(r => r.data),
    enabled:  open,
  })

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      startDate:     format(new Date(), 'yyyy-MM-dd'),
      paymentMethod: 'cash',
      collectNow:    true,
    },
  })

  const selectedPlanId = watch('planId')
  const collectNow     = watch('collectNow')
  const plans: any[]   = (plansData?.data ?? []).filter((p: any) => !p.archived_at)
  const selectedPlan   = plans.find(p => p.id === selectedPlanId)
  const hasActiveSub   = !!member?.subscription?.id
  const planPrice      = Number(selectedPlan?.price ?? 0)

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['members'] })
    qc.invalidateQueries({ queryKey: ['member', member.id] })
    qc.invalidateQueries({ queryKey: ['member-payments', member.id] })
    qc.invalidateQueries({ queryKey: ['member-subscriptions', member.id] })
  }

  function handleClose() {
    reset()
    setStep('plan')
    setAssignedSub(null)
    onClose()
  }

  // Step 1 — assign the plan
  const assign = useMutation({
    mutationFn: (d: FormData) => api.post('/subscriptions', {
      memberId:  member.id,
      planId:    d.planId,
      startDate: d.startDate,
    }),
    onSuccess: (res, d) => {
      setAssignedSub(res.data?.data ?? res.data)
      if (d.collectNow && planPrice > 0) {
        setStep('payment')
      } else {
        notify.success('Plan assigned', `${member.first_name} is now on ${selectedPlan?.name}`)
        invalidateAll()
        handleClose()
      }
    },
    onError: (e: any) => notify.error(
      'Failed to assign plan',
      e.response?.data?.error?.message ?? 'An error occurred'
    ),
  })

  // Step 2 — collect payment
  const charge = useMutation({
    mutationFn: (d: FormData) => api.post('/payments/charge', {
      memberId:      member.id,
      amount:        planPrice,
      description:   `${selectedPlan?.name} — ${CYCLE_LABELS[selectedPlan?.billing_cycle] ?? ''}`,
      paymentMethod: d.paymentMethod,
      sendReceipt:   true,
    }),
    onSuccess: () => {
      notify.success('Payment recorded', `${formatCurrency(planPrice)} collected`)
      invalidateAll()
      handleClose()
    },
    onError: (e: any) => notify.error(
      'Payment failed',
      e.response?.data?.error?.message
    ),
  })

  const onSubmit = (d: FormData) => {
    if (step === 'plan') assign.mutate(d)
    else charge.mutate(d)
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {step === 'plan' ? 'Assign Membership Plan' : 'Collect Payment'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator — only when payment step is needed */}
        {planPrice > 0 && collectNow && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pb-1">
            <div className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-xs
              ${step === 'plan' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
              {step === 'payment' ? '✓' : '1'}
            </div>
            <span className={step === 'payment' ? 'line-through opacity-50' : ''}>Assign Plan</span>
            <div className="flex-1 h-px bg-border" />
            <div className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-xs
              ${step === 'payment' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              2
            </div>
            <span>Collect Payment</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">

          {/* ── Step 1: Plan ── */}
          {step === 'plan' && (
            <>
              {/* Member card */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {member.first_name?.[0]}{member.last_name?.[0]}
                </div>
                <div>
                  <p className="text-sm font-medium">{member.first_name} {member.last_name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
              </div>

              {/* Active sub warning */}
              {hasActiveSub && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Already on <strong>{member.subscription.planName}</strong>. Cancel it first.</span>
                </div>
              )}

              {/* Plan picker */}
              <div className="space-y-1.5">
                <Label>Membership Plan</Label>
                <Select onValueChange={v => setValue('planId', v, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a plan…" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {formatCurrency(p.price)} / {CYCLE_LABELS[p.billing_cycle] ?? p.billing_cycle}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.planId && <p className="text-xs text-destructive">{errors.planId.message}</p>}
              </div>

              {/* Plan summary */}
              {selectedPlan && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{selectedPlan.name}</p>
                    <Badge variant="outline">{CYCLE_LABELS[selectedPlan.billing_cycle]}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-sm">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-semibold text-right text-primary">{formatCurrency(selectedPlan.price)}</span>
                    <span className="text-muted-foreground">Credits</span>
                    <span className="text-right">{selectedPlan.class_credits === null ? 'Unlimited' : selectedPlan.class_credits}</span>
                    {selectedPlan.duration_days && (
                      <>
                        <span className="text-muted-foreground">Duration</span>
                        <span className="text-right">{selectedPlan.duration_days} days</span>
                      </>
                    )}
                  </div>

                  {/* Collect now toggle */}
                  {planPrice > 0 && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Collect payment now</p>
                          <p className="text-xs text-muted-foreground">Record {formatCurrency(planPrice)} immediately</p>
                        </div>
                        <Switch
                          checked={collectNow}
                          onCheckedChange={v => setValue('collectNow', v)}
                        />
                      </div>
                      {collectNow && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Payment Method</Label>
                          <Select
                            defaultValue="cash"
                            onValueChange={v => setValue('paymentMethod', v as FormData['paymentMethod'])}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Start date */}
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" {...register('startDate')} />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={assign.isPending || hasActiveSub || !selectedPlanId}>
                  {assign.isPending
                    ? 'Assigning…'
                    : collectNow && planPrice > 0
                    ? `Assign & Collect ${formatCurrency(planPrice)}`
                    : 'Assign Plan'}
                </Button>
              </div>
            </>
          )}

          {/* ── Step 2: Payment ── */}
          {step === 'payment' && selectedPlan && (
            <>
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 space-y-1">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Plan assigned successfully</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {member.first_name} is now on <strong>{selectedPlan.name}</strong>
                </p>
              </div>

              {/* Amount due */}
              <div className="rounded-xl border p-5 space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Amount Due</p>
                <p className="text-3xl font-bold">{formatCurrency(planPrice)}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span>{selectedPlan.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Billing</span>
                    <span>{CYCLE_LABELS[selectedPlan.billing_cycle]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member</span>
                    <span>{member.first_name} {member.last_name}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select
                  defaultValue="cash"
                  onValueChange={v => setValue('paymentMethod', v as FormData['paymentMethod'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { invalidateAll(); handleClose() }}
                >
                  Skip — Pay Later
                </Button>
                <Button type="submit" disabled={charge.isPending}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {charge.isPending ? 'Recording…' : `Collect ${formatCurrency(planPrice)}`}
                </Button>
              </div>
            </>
          )}

        </form>
      </DialogContent>
    </Dialog>
  )
}