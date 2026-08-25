'use client'

import { useForm }         from 'react-hook-form'
import { zodResolver }     from '@hookform/resolvers/zod'
import { z }               from 'zod'
import { useMutation }     from '@tanstack/react-query'
import { useQuery }        from '@tanstack/react-query'
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
import type { ClassSession, ClassTemplate, GymLocation } from '@/types'

const schema = z.object({
  templateId:       z.string().uuid('Select a class type'),
  locationId:       z.string().uuid('Select a location'),
  startsAt:         z.string().min(1, 'Start time is required'),
  capacityOverride: z.coerce.number().int().positive().optional().or(z.literal('')),
  notes:            z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  session?:   ClassSession
  templates:  ClassTemplate[]
  onSuccess:  () => void
}

export function SessionForm({ session, templates, onSuccess }: Props) {
  const isEdit = !!session

  // Fetch locations
  const { data: locations = [] } = useQuery<GymLocation[]>({
    queryKey: ['locations'],
    queryFn:  () => api.get('/gym/locations').then(r => r.data.data),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      templateId:       session?.template_id ?? '',
      locationId:       session?.location_id ?? '',
      startsAt:         session?.starts_at
        ? new Date(session.starts_at).toISOString().slice(0, 16)
        : '',
      capacityOverride: session?.capacity ?? '',
      notes:            session?.notes    ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        templateId:       values.templateId,
        locationId:       values.locationId,
        startsAt:         new Date(values.startsAt).toISOString(),
        capacityOverride: values.capacityOverride || undefined,
        notes:            values.notes || undefined,
      }
      return isEdit
        ? api.patch(`/classes/sessions/${session.id}`, payload)
        : api.post('/classes/sessions', payload)
    },
    onSuccess: () => {
      notify.success(isEdit ? 'Session updated' : 'Session created')
      onSuccess()
    },
    onError: (err: any) => {
      notify.error(err.response?.data?.error?.message ?? 'Something went wrong')
    },
  })

  return (
    <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">

      {/* Class type */}
      <div className="space-y-1.5">
        <Label>Class type *</Label>
        <Select
          value={form.watch('templateId')}
          onValueChange={v => form.setValue('templateId', v)}
          disabled={isEdit}
        >
          <SelectTrigger className={cn(form.formState.errors.templateId && 'border-destructive')}>
            <SelectValue placeholder="Select class type" />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name} ({t.duration_mins} min)
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.templateId && (
          <p className="text-xs text-destructive">{form.formState.errors.templateId.message}</p>
        )}
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <Label>Location *</Label>
        <Select
          value={form.watch('locationId')}
          onValueChange={v => form.setValue('locationId', v)}
        >
          <SelectTrigger className={cn(form.formState.errors.locationId && 'border-destructive')}>
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {locations.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.locationId && (
          <p className="text-xs text-destructive">{form.formState.errors.locationId.message}</p>
        )}
      </div>

      {/* Start time */}
      <div className="space-y-1.5">
        <Label>Start time *</Label>
        <Input
          {...form.register('startsAt')}
          type="datetime-local"
          className={cn(form.formState.errors.startsAt && 'border-destructive')}
        />
        {form.formState.errors.startsAt && (
          <p className="text-xs text-destructive">{form.formState.errors.startsAt.message}</p>
        )}
      </div>

      {/* Capacity override */}
      <div className="space-y-1.5">
        <Label>Capacity override</Label>
        <Input
          {...form.register('capacityOverride')}
          type="number"
          min="1"
          placeholder="Leave empty to use template default"
        />
        <p className="text-xs text-muted-foreground">
          Overrides the default capacity from the class template
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          {...form.register('notes')}
          placeholder="Internal notes for this session..."
          rows={2}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? 'Save changes' : 'Create session'}
        </Button>
      </div>

    </form>
  )
}
