'use client'

import { useForm }        from 'react-hook-form'
import { zodResolver }    from '@hookform/resolvers/zod'
import { z }              from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2 }        from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import { cn }             from '@/lib/utils'

const schema = z.object({
  email:     z.string().email('Enter a valid email'),
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  role:      z.enum(['manager', 'trainer', 'front_desk', 'instructor']),
})

type FormValues = z.infer<typeof schema>

export function InviteStaffForm({ onSuccess }: { onSuccess: () => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '', firstName: '', lastName: '', role: 'trainer',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post('/staff', values),
    onSuccess: () => {
      notify.success('Staff member invited successfully')
      onSuccess()
    },
    onError: (err: any) => {
      notify.error(err.response?.data?.error?.message ?? 'Failed to invite')
    },
  })

  return (
    <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">

      {/* Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First name *</Label>
          <Input
            {...form.register('firstName')}
            placeholder="Your First Name"
            className={cn(form.formState.errors.firstName && 'border-destructive')}
          />
          {form.formState.errors.firstName && (
            <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Last name *</Label>
          <Input
            {...form.register('lastName')}
            placeholder="Your Last Name"
            className={cn(form.formState.errors.lastName && 'border-destructive')}
          />
          {form.formState.errors.lastName && (
            <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label>Email *</Label>
        <Input
          {...form.register('email')}
          type="email"
          placeholder="user@email.com"
          className={cn(form.formState.errors.email && 'border-destructive')}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <Label>Role *</Label>
        <Select
          value={form.watch('role')}
          onValueChange={v => form.setValue('role', v as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="trainer">Personal Trainer</SelectItem>
            <SelectItem value="front_desk">Front Desk</SelectItem>
            <SelectItem value="instructor">Group Instructor</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          You can adjust their permissions after inviting
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Send invitation
        </Button>
      </div>

    </form>
  )
}