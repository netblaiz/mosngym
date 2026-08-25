'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { notify } from '@/lib/toast'

// Matches CreateLeadSchema in leads.router.ts exactly
const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().optional(),
  email:     z.string().optional(),
  phone:     z.string().optional(),
  source:    z.enum(['website', 'walk_in', 'referral', 'social', 'widget', 'import', 'other']).default('other'),
  notes:     z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function LeadForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register, handleSubmit, setValue, formState: { errors },
  } = useForm<FormData>({
    resolver:      zodResolver(schema),
    defaultValues: { source: 'other' },
  })

  const create = useMutation({
    mutationFn: (d: FormData) => api.post('/leads', d),
    onSuccess: () => {
      notify.success('Lead added')
      onSuccess()
    },
    onError: (e: any) => notify.error('Failed to add lead', e.response?.data?.error?.message),
  })

  return (
    <form onSubmit={handleSubmit(d => create.mutate(d))} className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>First Name</Label>
          <Input {...register('firstName')} placeholder="Emeka" />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Last Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input {...register('lastName')} placeholder="Eze" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input {...register('email')} type="email" placeholder="emeka@example.com" />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input {...register('phone')} placeholder="+2348012345678" />
      </div>

      <div className="space-y-1.5">
        <Label>Source</Label>
        <Select defaultValue="other" onValueChange={v => setValue('source', v as FormData['source'])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="walk_in">Walk-in</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
            <SelectItem value="social">Social Media</SelectItem>
            <SelectItem value="website">Website</SelectItem>
            <SelectItem value="widget">Widget</SelectItem>
            <SelectItem value="import">Import</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Textarea {...register('notes')} placeholder="Any additional notes…" rows={2} />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add Lead'}
        </Button>
      </div>
    </form>
  )
}
