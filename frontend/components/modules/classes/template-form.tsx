'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Plus, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'

import { api } from '@/lib/api'
import { notify } from '@/lib/toast'
import { cn } from '@/lib/utils'

import type { ClassTemplate } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),

  description: z.string().optional(),

  durationMins: z.number().int().positive('Must be positive'),

  defaultCapacity: z.number().int().positive('Must be positive'),

  color: z.string().regex(
    /^#[0-9a-fA-F]{6}$/,
    'Invalid colour'
  ),

  category: z.string().optional(),

  requiresCredits: z.number().int().min(0, 'Cannot be negative'),
})

type FormValues = {
  name: string
  description?: string
  durationMins: number
  defaultCapacity: number
  color: string
  category?: string
  requiresCredits: number
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
]

interface Props {
  templates: ClassTemplate[]
  onSuccess: () => void
}

export function TemplateForm({
  templates,
  onSuccess,
}: Props) {
  const [showForm, setShowForm] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),

    defaultValues: {
      name: '',
      description: '',
      durationMins: 60,
      defaultCapacity: 15,
      color: '#6366f1',
      category: '',
      requiresCredits: 1,
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return api.post('/classes/templates', {
        name: values.name,
        description: values.description || undefined,
        durationMins: values.durationMins,
        defaultCapacity: values.defaultCapacity,
        color: values.color,
        category: values.category || undefined,
        requiresCredits: values.requiresCredits,
      })
    },

    onSuccess: () => {
      notify.success('Template created')

      form.reset()

      setShowForm(false)

      onSuccess()
    },

    onError: (err: any) => {
      notify.error(
        err.response?.data?.error?.message ??
          'Something went wrong'
      )
    },
  })

  return (
    <div className="space-y-4">

      {templates.length > 0 && (
        <div className="space-y-2">

          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Existing templates
          </Label>

          <div className="space-y-2 max-h-48 overflow-y-auto">

            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">

                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: template.color,
                    }}
                  />

                  <div>

                    <p className="text-sm font-medium">
                      {template.name}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {template.duration_mins} min · Cap{' '}
                      {template.default_capacity} ·{' '}
                      {template.requires_credits}{' '}
                      credit
                      {template.requires_credits !== 1
                        ? 's'
                        : ''}
                    </p>

                  </div>

                </div>
              </div>
            ))}

          </div>

          <Separator />

        </div>
      )}

      {!showForm ? (

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add new template
        </Button>

      ) : (

        <form
          onSubmit={form.handleSubmit((values) => {
            mutation.mutate(values)
          })}
          className="space-y-4"
        >

          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            New template
          </Label>

          {/* Name */}

          <div className="space-y-1.5">

            <Label>Name *</Label>

            <Input
              {...form.register('name')}
              placeholder="e.g. HIIT Blast, Yoga Flow"
              className={cn(
                form.formState.errors.name &&
                  'border-destructive'
              )}
            />

            {form.formState.errors.name && (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}

          </div>

          {/* Description */}

          <div className="space-y-1.5">

            <Label>Description</Label>

            <Textarea
              {...form.register('description')}
              placeholder="Brief description..."
              rows={2}
            />

          </div>

          {/* Duration and capacity */}

          <div className="grid grid-cols-2 gap-3">

            <div className="space-y-1.5">

              <Label>Duration (mins) *</Label>

              <Input
                type="number"
                min="1"
                {...form.register('durationMins', {
                  valueAsNumber: true,
                })}
              />

              {form.formState.errors.durationMins && (
                <p className="text-xs text-destructive">
                  {
                    form.formState.errors.durationMins
                      .message
                  }
                </p>
              )}

            </div>

            <div className="space-y-1.5">

              <Label>Default capacity *</Label>

              <Input
                type="number"
                min="1"
                {...form.register('defaultCapacity', {
                  valueAsNumber: true,
                })}
              />

              {form.formState.errors.defaultCapacity && (
                <p className="text-xs text-destructive">
                  {
                    form.formState.errors.defaultCapacity
                      .message
                  }
                </p>
              )}

            </div>

          </div>

          {/* Category and credits */}

          <div className="grid grid-cols-2 gap-3">

            <div className="space-y-1.5">

              <Label>Category</Label>

              <Input
                {...form.register('category')}
                placeholder="e.g. hiit, yoga, cycling"
              />

            </div>

            <div className="space-y-1.5">

              <Label>Credits required</Label>

              <Input
                type="number"
                min="0"
                {...form.register('requiresCredits', {
                  valueAsNumber: true,
                })}
              />

              {form.formState.errors.requiresCredits && (
                <p className="text-xs text-destructive">
                  {
                    form.formState.errors.requiresCredits
                      .message
                  }
                </p>
              )}

            </div>

          </div>

          {/* Color picker */}

          <div className="space-y-1.5">

            <Label>Colour</Label>

            <div className="flex gap-2 flex-wrap">

              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Select colour ${color}`}
                  onClick={() => {
                    form.setValue('color', color, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all',
                    form.watch('color') === color
                      ? 'border-white scale-110'
                      : 'border-transparent'
                  )}
                  style={{
                    backgroundColor: color,
                  }}
                />
              ))}

            </div>

            {form.formState.errors.color && (
              <p className="text-xs text-destructive">
                {form.formState.errors.color.message}
              </p>
            )}

          </div>

          {/* Buttons */}

          <div className="flex gap-3 justify-end">

            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                form.reset()
                setShowForm(false)
              }}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={mutation.isPending}
            >

              {mutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}

              Create template

            </Button>

          </div>

        </form>
      )}

    </div>
  )
}