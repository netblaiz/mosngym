'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { notify } from '@/lib/toast'
import { AlertCircle } from 'lucide-react'

interface Props {
  payment: {
    id:       string
    amount:   string | number
    currency: string
    member_name?: string
  }
  onClose: () => void
}

function formatCurrency(amount: string | number, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency, minimumFractionDigits: 0,
  }).format(Number(amount))
}

export function RefundDialog({ payment, onClose }: Props) {
  const qc = useQueryClient()
  const [amount, setAmount]   = useState(String(payment.amount))
  const [reason, setReason]   = useState('')

  const refund = useMutation({
    mutationFn: () => api.post(`/payments/${payment.id}/refund`, {
      amount: Number(amount),
      reason,
    }),
    onSuccess: () => {
      notify.success('Refund processed')
      qc.invalidateQueries({ queryKey: ['payments'] })
      onClose()
    },
    onError: (e: any) => notify.error('Refund failed', e.response?.data?.error?.message),
  })

  const isPartial = Number(amount) < Number(payment.amount)

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue Refund</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Refunding <strong>{formatCurrency(payment.amount, payment.currency)}</strong>
              {payment.member_name ? ` to ${payment.member_name}` : ''}.
              {isPartial && ' Partial refund.'}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Refund Amount</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              max={Number(payment.amount)}
            />
            <p className="text-xs text-muted-foreground">
              Max: {formatCurrency(payment.amount, payment.currency)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for refund…"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => refund.mutate()}
              disabled={refund.isPending || !amount || Number(amount) <= 0}
            >
              {refund.isPending ? 'Processing…' : 'Issue Refund'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
