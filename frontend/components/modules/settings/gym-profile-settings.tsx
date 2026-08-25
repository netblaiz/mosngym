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
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/toast'

const schema = z.object({
  name:       z.string().min(1, 'Required'),
  email:      z.string().email().optional().or(z.literal('')),
  phone:      z.string().optional(),
  website:    z.string().optional(),
  timezone:   z.string().optional(),
  currency:   z.string().length(3).optional(),
  brandColor: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function GymProfileSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gym-profile'],
    queryFn:  () => api.get('/gym').then(r => r.data.data),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (data) reset({
      name:       data.name       ?? '',
      email:      data.email      ?? '',
      phone:      data.phone      ?? '',
      website:    data.website    ?? '',
      timezone:   data.timezone   ?? '',
      currency:   data.currency   ?? 'NGN',
      brandColor: data.brand_color ?? '',
    })
  }, [data, reset])

  const save = useMutation({
    mutationFn: (d: FormData) => api.patch('/gym', d),
    onSuccess: () => {
      notify.success('Profile saved')
      qc.invalidateQueries({ queryKey: ['gym-profile'] })
    },
    onError: () => notify.error('Failed to save'),
  })

  if (isLoading) return <div className="space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-10 w-full"/>)}</div>

  return (
    <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-6 max-w-2xl">
      <div className="rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold border-b pb-2">Gym Profile</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 col-span-2">
            <Label>Gym Name</Label>
            <Input {...register('name')} placeholder="Benfit Lagos" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input {...register('email')} type="email" placeholder="info@benfit.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="+2348012345678" />
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input {...register('website')} placeholder="https://benfit.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input {...register('currency')} placeholder="NGN" maxLength={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input {...register('timezone')} placeholder="Africa/Lagos" />
          </div>
          <div className="space-y-1.5">
            <Label>Brand Color</Label>
            <Input {...register('brandColor')} placeholder="#6366f1" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save Profile'}
        </Button>
      </div>
    </form>
  )
}
