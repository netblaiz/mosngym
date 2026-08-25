'use client'

import { useForm }        from 'react-hook-form'
import { zodResolver }    from '@hookform/resolvers/zod'
import { z }              from 'zod'
import { useMutation }    from '@tanstack/react-query'
import { Loader2 }        from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import { Textarea }       from '@/components/ui/textarea'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import { formatCurrency } from '@/lib/utils'
import type { Payment }   from '@/types'

const schema = z.object({
  amount: z.union([z.coerce.number().positive(), z.literal('')]).optional(),
  reason: z.string().optional(),
}).strict()

type FormValues = z.infer<typeof schema>

export function RefundForm({
  payment,
  onSuccess,
}: {
  payment:   Payment
  onSuccess: () => void
}) {
  const maxRefund = parseFloat(payment.amount) - parseFloat(payment.amount_refunded)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: { amount: '', reason: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post(`/payments/${payment.id}/refund`, {
        amount: values.amount || undefined,
        reason: values.reason || undefined,
      }),
    onSuccess: () => {
      notify.success('Refund issued successfully')
      onSuccess()
    },
    onError: (err: any) => {
      notify.error(err.response?.data?.error?.message ?? 'Refund failed')
    },
  })

  return (
    <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">

      {/* Payment summary */}
      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Original amount</span>
          <span className="font-medium">{formatCurrency(payment.amount, payment.currency)}</span>
        </div>
        {parseFloat(payment.amount_refunded) > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Already refunded</span>
            <span className="text-red-500">-{formatCurrency(payment.amount_refunded, payment.currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-medium border-t border-border pt-2 mt-2">
          <span>Max refundable</span>
          <span>{formatCurrency(maxRefund, payment.currency)}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label>Refund amount</Label>
        <Input
          {...form.register('amount')}
          type="number"
          min="1"
          max={maxRefund}
          step="100"
          placeholder={`Leave empty for full refund (${formatCurrency(maxRefund, payment.currency)})`}
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to refund the full remaining amount
        </p>
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <Label>Reason</Label>
        <Textarea
          {...form.register('reason')}
          placeholder="Reason for refund..."
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Issue refund
        </Button>
      </div>

    </form>
  )
}