'use client'

import { useForm }         from 'react-hook-form'
import { zodResolver }     from '@hookform/resolvers/zod'
import { z }               from 'zod'
import { useMutation }     from '@tanstack/react-query'
import { Loader2 }         from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { Input }           from '@/components/ui/input'
import { Label }           from '@/components/ui/label'
import { Textarea }        from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api }             from '@/lib/api'
import { notify }          from '@/lib/toast'
import { cn }              from '@/lib/utils'
import type { Member }     from '@/types'

const schema = z.object({
  email:       z.string().email('Enter a valid email'),
  firstName:   z.string().min(1, 'First name is required'),
  lastName:    z.string().min(1, 'Last name is required'),
  phone:       z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender:      z.enum(['male','female','non_binary','prefer_not_to_say','']).optional(),
  healthNotes: z.string().optional(),
  emergencyContactName:         z.string().optional(),
  emergencyContactPhone:        z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  member?:   Member
  onSuccess: () => void
}

export function MemberForm({ member, onSuccess }: Props) {
  const isEdit = !!member

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email:       member?.email            ?? '',
      firstName:   member?.first_name       ?? '',
      lastName:    member?.last_name        ?? '',
      phone:       member?.phone            ?? '',
      dateOfBirth: member?.date_of_birth?.split('T')[0] ?? '',
      gender:      (member?.gender as any)  ?? '',
      healthNotes: member?.health_notes     ?? '',
      emergencyContactName:         (member?.emergency_contact as any)?.name         ?? '',
      emergencyContactPhone:        (member?.emergency_contact as any)?.phone        ?? '',
      emergencyContactRelationship: (member?.emergency_contact as any)?.relationship ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: any = {
        email:       values.email,
        firstName:   values.firstName,
        lastName:    values.lastName,
        phone:       values.phone       || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        gender:      values.gender      || undefined,
        healthNotes: values.healthNotes || undefined,
      }
      if (values.emergencyContactName) {
        payload.emergencyContact = {
          name:         values.emergencyContactName,
          phone:        values.emergencyContactPhone,
          relationship: values.emergencyContactRelationship,
        }
      }
      return isEdit
        ? api.patch(`/members/${member.id}`, payload)
        : api.post('/members', payload)
    },
    onSuccess: () => {
      notify.success(isEdit ? 'Member updated' : 'Member created')
      onSuccess()
    },
    onError: (err: any) => {
      notify.error(err.response?.data?.error?.message ?? 'Something went wrong')
    },
  })

  return (
    <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First name *</Label>
          <Input
            {...form.register('firstName')}
            placeholder="Amara"
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
            placeholder="Osei"
            className={cn(form.formState.errors.lastName && 'border-destructive')}
          />
          {form.formState.errors.lastName && (
            <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Email *</Label>
        <Input
          {...form.register('email')}
          type="email"
          placeholder="amara@example.com"
          disabled={isEdit}
          className={cn(form.formState.errors.email && 'border-destructive')}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input {...form.register('phone')} placeholder="+2348012345678" />
        </div>
        <div className="space-y-1.5">
          <Label>Date of birth</Label>
          <Input {...form.register('dateOfBirth')} type="date" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Gender</Label>
        <Select
          value={form.watch('gender') ?? ''}
          onValueChange={v => form.setValue('gender', v as any)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="non_binary">Non-binary</SelectItem>
            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Health notes</Label>
        <Textarea
          {...form.register('healthNotes')}
          placeholder="Any injuries, conditions or notes for trainers..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">
          Emergency contact
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Input {...form.register('emergencyContactName')}  placeholder="Name" />
          <Input {...form.register('emergencyContactPhone')} placeholder="Phone" />
        </div>
        <Input
          {...form.register('emergencyContactRelationship')}
          placeholder="Relationship (e.g. spouse, parent)"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? 'Save changes' : 'Create member'}
        </Button>
      </div>

    </form>
  )
}
