'use client'

import { useState }        from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api }             from '@/lib/api'
import { Button }          from '@/components/ui/button'
import { Badge }           from '@/components/ui/badge'
import { Skeleton }        from '@/components/ui/skeleton'
import { Separator }       from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input }           from '@/components/ui/input'
import { Label }           from '@/components/ui/label'
import { Textarea }        from '@/components/ui/textarea'
import { notify }          from '@/lib/toast'
import { cn, formatDate, formatCurrency } from '@/lib/utils'
import {
  FastForward, SlidersHorizontal, FileText,
  Receipt, Plus, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Settings,
} from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  succeeded:         'bg-green-500/10 text-green-400 border-green-500/20',
  pending:           'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  failed:            'bg-red-500/10   text-red-400   border-red-500/20',
  refunded:          'bg-slate-500/10 text-slate-400 border-slate-500/20',
  partially_refunded:'bg-blue-500/10  text-blue-400  border-blue-500/20',
}

const BILLING_MODES = [
  { value: 'automatic', label: 'Bill Member Automatically' },
  { value: 'manual',    label: "Don't Bill Automatically"  },
  { value: 'never',     label: 'Never Bill'                },
] as const

type BillingMode = typeof BILLING_MODES[number]['value']

interface Props {
  memberId: string
  member:   any
}

export function AccountsBillingTab({ memberId, member }: Props) {
  const qc = useQueryClient()

  const [billingMode,    setBillingMode]    = useState<BillingMode>('manual')
  const [debtOpen,       setDebtOpen]       = useState(false)
  const [addPaymentOpen, setAddPaymentOpen] = useState(false)
  const [adjustOpen,     setAdjustOpen]     = useState(false)
  const [prepayOpen,     setPrepayOpen]     = useState(false)

  // Fetch payments
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['member-payments', memberId],
    queryFn:  () => api.get(`/members/${memberId}/payments`, { params: { limit: 50 } }).then(r => r.data),
  })

  const payments: any[] = paymentsData?.data ?? []

  const totalOwed = payments
    .filter(p => ['pending', 'failed'].includes(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const totalPaid = payments
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const addPayment = useMutation({
    mutationFn: (d: { amount: number; description: string }) =>
      api.post('/payments/charge', {
        memberId,
        amount:      d.amount,
        description: d.description,
        sendReceipt: true,
      }),
    onSuccess: () => {
      notify.success('Payment recorded')
      qc.invalidateQueries({ queryKey: ['member-payments', memberId] })
      setAddPaymentOpen(false)
    },
    onError: (e: any) => notify.error('Failed to record payment', e.response?.data?.error?.message),
  })

  const hasBillingSetup = billingMode === 'automatic'

  return (
    <div className="p-8 space-y-6 max-w-4xl">

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setPrepayOpen(true)}>
          <FastForward className="h-3.5 w-3.5 mr-1.5" /> Prepay
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" /> Adjustment
        </Button>
        <Button variant="outline" size="sm">
          <FileText className="h-3.5 w-3.5 mr-1.5" /> Statement
        </Button>
        <Button variant="outline" size="sm">
          <Receipt className="h-3.5 w-3.5 mr-1.5" /> Invoices
        </Button>
        <Button size="sm" onClick={() => setAddPaymentOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Payment
        </Button>
      </div>

      {/* Billing Provider */}
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-muted/20 border-b">
          <h3 className="text-base font-semibold">Billing Provider</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Preview</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Manage Billing <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Update Payment Method</DropdownMenuItem>
                <DropdownMenuItem>Cancel Billing</DropdownMenuItem>
                <DropdownMenuItem>Sync with Provider</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Billing status banner */}
          {!hasBillingSetup ? (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
                <p className="text-sm font-semibold text-yellow-400">NO BILLING SETUP</p>
              </div>
              <p className="text-sm text-muted-foreground">
                This member will not be able to be billed until this section is completed.
                Reason: <span className="font-semibold text-yellow-400">Automatic billing is disabled.</span>
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              <p className="text-sm text-green-400 font-medium">Billing is active and configured</p>
            </div>
          )}

          {/* Billing mode selector */}
          <div className="flex items-center gap-6">
            {BILLING_MODES.map(mode => (
              <label
                key={mode.value}
                className="flex items-center gap-2 cursor-pointer text-sm"
              >
                <input
                  type="radio"
                  name="billingMode"
                  value={mode.value}
                  checked={billingMode === mode.value}
                  onChange={() => setBillingMode(mode.value)}
                  className="accent-primary"
                />
                {mode.label}
              </label>
            ))}
          </div>

          {billingMode === 'automatic' && (
            <div className="pt-2 text-sm text-muted-foreground flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Connect a payment provider in Gym Settings to enable automatic billing.
            </div>
          )}
        </div>
      </div>

      {/* Account summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-1 text-center">
          <p className="text-xs text-muted-foreground">Total Paid</p>
          <p className="text-xl font-bold text-green-400">{formatCurrency(totalPaid, 'NGN')}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-1 text-center">
          <p className="text-xs text-muted-foreground">Member Owes</p>
          <p className={cn('text-xl font-bold', totalOwed > 0 ? 'text-red-400' : 'text-foreground')}>
            {formatCurrency(totalOwed, 'NGN')}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-1 text-center">
          <p className="text-xs text-muted-foreground">Total Transactions</p>
          <p className="text-xl font-bold">{payments.length}</p>
        </div>
      </div>

      {/* Debt Collection */}
      <div className="rounded-xl border overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 bg-muted/20 hover:bg-muted/40 transition-colors"
          onClick={() => setDebtOpen(v => !v)}
        >
          <h3 className="text-base font-semibold">Debt Collection</h3>
          {debtOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </button>
        {debtOpen && (
          <div className="p-5">
            {totalOwed > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Outstanding balance: <span className="font-semibold text-red-400">{formatCurrency(totalOwed, 'NGN')}</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">Send Reminder</Button>
                  <Button size="sm" variant="destructive">Mark as Bad Debt</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No outstanding debt for this member.</p>
            )}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Payment History</h3>
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    No payment history yet
                  </TableCell>
                </TableRow>
              ) : (
                payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.description ?? p.plan_name ?? p.type?.replace('_', ' ') ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">
                      {p.payment_method?.replace('_', ' ') ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(p.paid_at ?? p.created_at)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatCurrency(p.amount, p.currency ?? 'NGN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', STATUS_STYLES[p.status] ?? '')}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Payment dialog */}
      <SimpleAmountDialog
        open={addPaymentOpen}
        title="Add Payment"
        description="Record a manual payment for this member."
        label="Amount"
        buttonLabel="Record Payment"
        onClose={() => setAddPaymentOpen(false)}
        onConfirm={(amount, note) => addPayment.mutate({ amount, description: note || 'Manual payment' })}
        isPending={addPayment.isPending}
        showNote
      />

      {/* Prepay dialog */}
      <SimpleAmountDialog
        open={prepayOpen}
        title="Prepay"
        description="Add prepaid credit to this member's account."
        label="Prepay Amount"
        buttonLabel="Add Prepay"
        onClose={() => setPrepayOpen(false)}
        onConfirm={(amount, note) => {
          notify.info('Prepay recorded locally — connect payment provider to process.')
          setPrepayOpen(false)
        }}
        isPending={false}
        showNote
      />

      {/* Adjustment dialog */}
      <SimpleAmountDialog
        open={adjustOpen}
        title="Account Adjustment"
        description="Apply a credit or debit adjustment to this member's account."
        label="Adjustment Amount"
        buttonLabel="Apply Adjustment"
        onClose={() => setAdjustOpen(false)}
        onConfirm={(amount, note) => {
          notify.info('Adjustment noted — connect payment provider to process.')
          setAdjustOpen(false)
        }}
        isPending={false}
        showNote
      />
    </div>
  )
}

// ── Simple amount + note dialog ───────────────────────────────────────────────
function SimpleAmountDialog({
  open, title, description, label, buttonLabel,
  onClose, onConfirm, isPending, showNote,
}: {
  open:        boolean
  title:       string
  description: string
  label:       string
  buttonLabel: string
  onClose:     () => void
  onConfirm:   (amount: number, note: string) => void
  isPending:   boolean
  showNote?:   boolean
}) {
  const [amount, setAmount] = useState('')
  const [note,   setNote]   = useState('')

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>{label} (₦)</Label>
            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          {showNote && (
            <div className="space-y-1.5">
              <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                placeholder="Reason or description…"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onConfirm(Number(amount), note)}
              disabled={!amount || Number(amount) <= 0 || isPending}
            >
              {isPending ? 'Processing…' : buttonLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
