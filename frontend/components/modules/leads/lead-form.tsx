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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { notify } from '@/lib/toast'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),

  lastName: z.string().optional(),

  email: z.string().optional(),

  phone: z.string().optional(),

  source: z.enum([
    'website',
    'walk_in',
    'referral',
    'social',
    'widget',
    'import',
    'other',
  ]),

  notes: z.string().optional(),
})

type FormData = {
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  source:
    | 'website'
    | 'walk_in'
    | 'referral'
    | 'social'
    | 'widget'
    | 'import'
    | 'other'
  notes?: string
}

export function LeadForm({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      source: 'other',
      notes: '',
    },
  })

  const create = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/leads', data),

    onSuccess: () => {
      notify.success('Lead added')
      onSuccess()
    },

    onError: (error: any) => {
      notify.error(
        'Failed to add lead',
        error.response?.data?.error?.message
      )
    },
  })

  return (
    <form
      onSubmit={handleSubmit((data) =>
        create.mutate(data)
      )}
      className="space-y-4 pt-2"
    >
      {/* Name */}

      <div className="grid grid-cols-2 gap-4">

        <div className="space-y-1.5">
          <Label>First Name</Label>

          <Input
            {...register('firstName')}
            placeholder="Emeka"
          />

          {errors.firstName && (
            <p className="text-xs text-destructive">
              {errors.firstName.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Last Name{' '}
            <span className="text-muted-foreground text-xs">
              (optional)
            </span>
          </Label>

          <Input
            {...register('lastName')}
            placeholder="Eze"
          />

          {errors.lastName && (
            <p className="text-xs text-destructive">
              {errors.lastName.message}
            </p>
          )}
        </div>

      </div>

      {/* Email */}

      <div className="space-y-1.5">
        <Label>
          Email{' '}
          <span className="text-muted-foreground text-xs">
            (optional)
          </span>
        </Label>

        <Input
          {...register('email')}
          type="email"
          placeholder="emeka@example.com"
        />

        {errors.email && (
          <p className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Phone */}

      <div className="space-y-1.5">
        <Label>
          Phone{' '}
          <span className="text-muted-foreground text-xs">
            (optional)
          </span>
        </Label>

        <Input
          {...register('phone')}
          placeholder="+2348012345678"
        />

        {errors.phone && (
          <p className="text-xs text-destructive">
            {errors.phone.message}
          </p>
        )}
      </div>

      {/* Source */}

      <div className="space-y-1.5">
        <Label>Source</Label>

        <Select
          defaultValue="other"
          onValueChange={(value) => {
            setValue(
              'source',
              value as FormData['source'],
              {
                shouldValidate: true,
                shouldDirty: true,
              }
            )
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select source" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="walk_in">
              Walk-in
            </SelectItem>

            <SelectItem value="referral">
              Referral
            </SelectItem>

            <SelectItem value="social">
              Social Media
            </SelectItem>

            <SelectItem value="website">
              Website
            </SelectItem>

            <SelectItem value="widget">
              Widget
            </SelectItem>

            <SelectItem value="import">
              Import
            </SelectItem>

            <SelectItem value="other">
              Other
            </SelectItem>
          </SelectContent>
        </Select>

        {errors.source && (
          <p className="text-xs text-destructive">
            {errors.source.message}
          </p>
        )}
      </div>

      {/* Notes */}

      <div className="space-y-1.5">
        <Label>
          Notes{' '}
          <span className="text-muted-foreground text-xs">
            (optional)
          </span>
        </Label>

        <Textarea
          {...register('notes')}
          placeholder="Any additional notes…"
          rows={2}
        />

        {errors.notes && (
          <p className="text-xs text-destructive">
            {errors.notes.message}
          </p>
        )}
      </div>

      {/* Submit */}

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={create.isPending}
        >
          {create.isPending
            ? 'Adding…'
            : 'Add Lead'}
        </Button>
      </div>
    </form>
  )
}