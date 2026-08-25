'use client'

import { useState }       from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver }    from '@hookform/resolvers/zod'
import { z }              from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import { cn, getInitials } from '@/lib/utils'
import type { Member }    from '@/types'

const schema = z.object({
  memberId:    z.string().uuid('Select a member'),
  amount:      z.coerce.number().positive('Amount must be greater than 0'),
  description: z.string().min(1, 'Description is required'),
  sendReceipt: z.boolean().default(true),
})

type FormValues = z.infer<typeof schema>

export function ChargeForm({ onSuccess }: { onSuccess: () => void }) {
  const [memberSearch,   setMemberSearch]   = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues, any>,
    defaultValues: {
      memberId: '', amount: 0, description: '', sendReceipt: true,
    },
  })

  const { data: memberData } = useQuery({
    queryKey: ['members-search', memberSearch],
    queryFn:  () => api.get('/members', {
      params: { search: memberSearch, limit: 8 }
    }).then(r => r.data.data as Member[]),
    enabled: memberSearch.length > 1,
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post('/payments/charge', {
      memberId:    values.memberId,
      amount:      values.amount,
      description: values.description,
      sendReceipt: values.sendReceipt,
    }),
    onSuccess: () => {
      notify.success('Payment processed successfully')
      onSuccess()
    },
    onError: (err: any) => {
      notify.error(err.response?.data?.error?.message ?? 'Payment failed')
    },
  })

  return (
    <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">

      {/* Member */}
      <div className="space-y-1.5">
        <Label>Member *</Label>
        {selectedMember ? (
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(selectedMember.first_name, selectedMember.last_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">
                  {selectedMember.first_name} {selectedMember.last_name}
                </p>
                <p className="text-xs text-muted-foreground">{selectedMember.email}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm"
              onClick={() => { setSelectedMember(null); form.setValue('memberId', '') }}>
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search member..."
                className="pl-9"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
              />
            </div>
            {memberData && memberData.length > 0 && (
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {memberData.map(m => (
                  <button key={m.id} type="button"
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                    onClick={() => {
                      setSelectedMember(m)
                      form.setValue('memberId', m.id)
                      setMemberSearch('')
                    }}
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(m.first_name, m.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.first_name} {m.last_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {form.formState.errors.memberId && (
          <p className="text-xs text-destructive">{form.formState.errors.memberId.message}</p>
        )}
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label>Amount (NGN) *</Label>
        <Input
          {...form.register('amount')}
          type="number"
          min="1"
          step="any"
          placeholder="5000"
          className={cn(form.formState.errors.amount && 'border-destructive')}
        />
        {form.formState.errors.amount && (
          <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Description *</Label>
        <Input
          {...form.register('description')}
          placeholder="e.g. Late cancellation fee, Personal training session"
          className={cn(form.formState.errors.description && 'border-destructive')}
        />
        {form.formState.errors.description && (
          <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Process payment
        </Button>
      </div>

    </form>
  )
}