'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/toast'

const schema = z.object({
  bookingLeadTimeHrs:    z.number().int().min(0),
  bookingMaxAdvanceDays: z.number().int().min(1),
  cancelWindowHrs:       z.number().int().min(0),
  noShowFee:             z.number().min(0),
  allowOnlineSignup:     z.boolean(),
  allowGuestBooking:     z.boolean(),
  memberAppEnabled:      z.boolean(),
  widgetEnabled:         z.boolean(),
  accessMode:            z.enum(['staffed', '24_7', 'hybrid']),
})

type FormData = z.infer<typeof schema>

export function GymOperationSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gym-settings'],
    queryFn:  () => api.get('/gym/settings').then(r => r.data.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bookingLeadTimeHrs:    1,
      bookingMaxAdvanceDays: 14,
      cancelWindowHrs:       2,
      noShowFee:             0,
      allowOnlineSignup:     true,
      allowGuestBooking:     false,
      memberAppEnabled:      true,
      widgetEnabled:         true,
      accessMode:            'staffed',
    },
  })

  useEffect(() => {
    if (data) reset({
      bookingLeadTimeHrs:    data.booking_lead_time_hrs    ?? 1,
      bookingMaxAdvanceDays: data.booking_max_advance_days ?? 14,
      cancelWindowHrs:       data.cancel_window_hrs        ?? 2,
      noShowFee:             Number(data.no_show_fee       ?? 0),
      allowOnlineSignup:     data.allow_online_signup      ?? true,
      allowGuestBooking:     data.allow_guest_booking      ?? false,
      memberAppEnabled:      data.member_app_enabled       ?? true,
      widgetEnabled:         data.widget_enabled           ?? true,
      accessMode:            data.access_mode              ?? 'staffed',
    })
  }, [data, reset])

  const save = useMutation({
    mutationFn: (d: FormData) => api.patch('/gym/settings', d),
    onSuccess: () => {
      notify.success('Settings saved')
      qc.invalidateQueries({ queryKey: ['gym-settings'] })
    },
    onError: () => notify.error('Failed to save'),
  })

  if (isLoading) return <div className="space-y-3">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-10 w-full"/>)}</div>

  return (
    <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-6 max-w-2xl">

      {/* Booking rules */}
      <div className="rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold border-b pb-2">Booking Rules</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Lead Time (hours)</Label>
            <Input type="number" {...register('bookingLeadTimeHrs', { valueAsNumber: true })} />
            <p className="text-xs text-muted-foreground">Minimum hours before a class to book</p>
          </div>
          <div className="space-y-1.5">
            <Label>Max Advance Booking (days)</Label>
            <Input type="number" {...register('bookingMaxAdvanceDays', { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Cancellation Window (hours)</Label>
            <Input type="number" {...register('cancelWindowHrs', { valueAsNumber: true })} />
            <p className="text-xs text-muted-foreground">Credits not refunded if cancelled within this window</p>
          </div>
          <div className="space-y-1.5">
            <Label>No-show Fee (₦)</Label>
            <Input type="number" {...register('noShowFee', { valueAsNumber: true })} />
          </div>
        </div>
      </div>

      {/* Access */}
      <div className="rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold border-b pb-2">Access Mode</h3>
        <div className="space-y-1.5">
          <Label>Gym Access Mode</Label>
          <Select value={watch('accessMode')} onValueChange={v => setValue('accessMode', v as FormData['accessMode'])}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="staffed">Staffed Hours Only</SelectItem>
              <SelectItem value="24_7">24/7 Access</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toggles */}
      <div className="rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold border-b pb-2">Features</h3>
        {[
          { field: 'allowOnlineSignup', label: 'Allow Online Signup',    desc: 'Members can sign up via the widget' },
          { field: 'allowGuestBooking', label: 'Allow Guest Booking',    desc: 'Non-members can book classes' },
          { field: 'memberAppEnabled',  label: 'Member App',             desc: 'Enable the member-facing app' },
          { field: 'widgetEnabled',     label: 'Booking Widget',         desc: 'Show public booking widget on your website' },
        ].map(({ field, label, desc }) => (
          <div key={field} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={watch(field as keyof FormData) as boolean}
              onCheckedChange={v => setValue(field as keyof FormData, v as any)}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </form>
  )
}
