'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notify } from '@/lib/toast'
import { Plus, Trash2, Clock, Tag } from 'lucide-react'

// ── Schemas ───────────────────────────────────────────────────────────────────

const DayHoursSchema = z.object({
  closed: z.boolean(),
  open:   z.string(),
  close:  z.string(),
})

const DiscountSchema = z.object({
  label:     z.string().min(1, 'Label required'),
  type:      z.enum(['percentage', 'fixed']),
  value:     z.number().positive('Must be positive'),
  code:      z.string().optional(),
  expiresAt: z.string().optional(),
})

const schema = z.object({
  name:               z.string().min(1, 'Name is required'),
  description:        z.string().optional(),
  price:              z.number().min(0),
  billingCycle:       z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'one_time', 'drop_in']),
  durationDays:       z.number().int().positive().optional().nullable(),
  classCredits:       z.number().int().min(0).optional().nullable(),
  accessAllLocations: z.boolean(),
  isPublic:           z.boolean(),
  sortOrder:          z.number().int(),
  hasHourRestrictions: z.boolean(),
  operatingHours: z.object({
    mon: DayHoursSchema,
    tue: DayHoursSchema,
    wed: DayHoursSchema,
    thu: DayHoursSchema,
    fri: DayHoursSchema,
    sat: DayHoursSchema,
    sun: DayHoursSchema,
  }).optional(),
  discounts: z.array(DiscountSchema),
})

type FormData = z.infer<typeof schema>

const DAYS = [
  { key: 'mon', label: 'Monday'    },
  { key: 'tue', label: 'Tuesday'   },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday'  },
  { key: 'fri', label: 'Friday'    },
  { key: 'sat', label: 'Saturday'  },
  { key: 'sun', label: 'Sunday'    },
] as const

const DEFAULT_HOURS = {
  mon: { closed: false, open: '06:00', close: '22:00' },
  tue: { closed: false, open: '06:00', close: '22:00' },
  wed: { closed: false, open: '06:00', close: '22:00' },
  thu: { closed: false, open: '06:00', close: '22:00' },
  fri: { closed: false, open: '06:00', close: '22:00' },
  sat: { closed: false, open: '08:00', close: '18:00' },
  sun: { closed: true,  open: '08:00', close: '14:00' },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onSuccess:      () => void
  defaultValues?: Partial<FormData>
  planId?:        string
}

export function PlanForm({ onSuccess, defaultValues, planId }: Props) {
  const isEdit = !!planId

  const {
    register, handleSubmit, setValue, watch,
    control, formState: { errors },
  } = useForm<FormData>({
    resolver:      zodResolver(schema),
    defaultValues: {
      billingCycle:        'monthly',
      accessAllLocations:  true,
      isPublic:            true,
      sortOrder:           0,
      hasHourRestrictions: false,
      discounts:           [],
      operatingHours:      DEFAULT_HOURS,
      ...defaultValues,
    },
  })

  const { fields: discountFields, append: addDiscount, remove: removeDiscount } = useFieldArray({
    control,
    name: 'discounts',
  })

  const hasHourRestrictions = watch('hasHourRestrictions')
  const operatingHours      = watch('operatingHours')
  const discounts           = watch('discounts')

  const save = useMutation({
    mutationFn: (d: FormData) => isEdit
      ? api.patch(`/plans/${planId}`, d)
      : api.post('/plans', d),
    onSuccess: () => {
      notify.success(isEdit ? 'Plan updated' : 'Plan created')
      onSuccess()
    },
    onError: (e: any) => notify.error('Failed to save plan', e.response?.data?.error?.message),
  })

  return (
    <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-2">
      <Tabs defaultValue="basic">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="hours">
            <Clock className="h-3 w-3 mr-1" /> Hours
            {hasHourRestrictions && <Badge className="ml-1.5 h-4 px-1 text-xs">ON</Badge>}
          </TabsTrigger>
          <TabsTrigger value="discounts">
            <Tag className="h-3 w-3 mr-1" /> Discounts
            {discounts.length > 0 && (
              <Badge className="ml-1.5 h-4 px-1 text-xs">{discounts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Basic tab ── */}
        <TabsContent value="basic" className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label>Plan Name</Label>
            <Input {...register('name')} placeholder="Monthly Standard" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea {...register('description')} placeholder="Full gym access + 8 classes per month" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Price (₦)</Label>
              <Input
                type="number"
                placeholder="15000"
                {...register('price', { valueAsNumber: true })}
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Billing Cycle</Label>
              <Select
                defaultValue={defaultValues?.billingCycle ?? 'monthly'}
                onValueChange={v => setValue('billingCycle', v as FormData['billingCycle'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="drop_in">Drop-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Class Credits{' '}
                <span className="text-muted-foreground text-xs">(leave blank = unlimited)</span>
              </Label>
              <Input
                type="number"
                placeholder="8"
                {...register('classCredits', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Duration (days){' '}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                type="number"
                placeholder="30"
                {...register('durationDays', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
              />
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Visible to Members</p>
                <p className="text-xs text-muted-foreground">Show on public signup page</p>
              </div>
              <Switch
                checked={watch('isPublic')}
                onCheckedChange={v => setValue('isPublic', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">All Locations</p>
                <p className="text-xs text-muted-foreground">Grant access to every gym location</p>
              </div>
              <Switch
                checked={watch('accessAllLocations')}
                onCheckedChange={v => setValue('accessAllLocations', v)}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Hours tab ── */}
        <TabsContent value="hours" className="space-y-4 pt-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">Restrict Access Hours</p>
              <p className="text-xs text-muted-foreground">
                Limit when members on this plan can enter the gym
              </p>
            </div>
            <Switch
              checked={hasHourRestrictions}
              onCheckedChange={v => setValue('hasHourRestrictions', v)}
            />
          </div>

          {hasHourRestrictions && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Set the hours members can access the gym each day. Toggle a day closed to block access entirely.
              </p>
              {DAYS.map(day => {
                const dayData = operatingHours?.[day.key]
                const isClosed = dayData?.closed ?? false
                return (
                  <div key={day.key} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-medium">{day.label}</p>
                    </div>
                    <Switch
                      checked={!isClosed}
                      onCheckedChange={v =>
                        setValue(`operatingHours.${day.key}.closed`, !v)
                      }
                    />
                    {!isClosed ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="time"
                          className="h-8 text-xs"
                          defaultValue={dayData?.open ?? '06:00'}
                          {...register(`operatingHours.${day.key}.open`)}
                        />
                        <span className="text-xs text-muted-foreground shrink-0">to</span>
                        <Input
                          type="time"
                          className="h-8 text-xs"
                          defaultValue={dayData?.close ?? '22:00'}
                          {...register(`operatingHours.${day.key}.close`)}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Closed</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!hasHourRestrictions && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Members on this plan have 24/7 access.
              <br />Enable the toggle above to set specific hours.
            </div>
          )}
        </TabsContent>

        {/* ── Discounts tab ── */}
        <TabsContent value="discounts" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Add discounts that can be applied when assigning this plan to a member.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addDiscount({ label: '', type: 'percentage', value: 0, code: '', expiresAt: '' })}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Discount
            </Button>
          </div>

          {discountFields.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              No discounts yet. Click "Add Discount" to create one.
            </div>
          )}

          <div className="space-y-3">
            {discountFields.map((field, i) => (
              <div key={field.id} className="p-4 rounded-lg border space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Discount {i + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeDiscount(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Label</Label>
                    <Input
                      {...register(`discounts.${i}.label`)}
                      placeholder="Student Discount"
                      className="h-8 text-sm"
                    />
                    {errors.discounts?.[i]?.label && (
                      <p className="text-xs text-destructive">{errors.discounts[i]?.label?.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select
                      defaultValue="percentage"
                      onValueChange={v => setValue(`discounts.${i}.type`, v as 'percentage' | 'fixed')}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed Amount (₦)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Value {watch(`discounts.${i}.type`) === 'percentage' ? '(%)' : '(₦)'}
                    </Label>
                    <Input
                      type="number"
                      {...register(`discounts.${i}.value`, { valueAsNumber: true })}
                      placeholder={watch(`discounts.${i}.type`) === 'percentage' ? '10' : '1500'}
                      className="h-8 text-sm"
                    />
                    {errors.discounts?.[i]?.value && (
                      <p className="text-xs text-destructive">{errors.discounts[i]?.value?.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Promo Code <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      {...register(`discounts.${i}.code`)}
                      placeholder="STUDENT10"
                      className="h-8 text-sm uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Expires At <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    type="date"
                    {...register(`discounts.${i}.expiresAt`)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : isEdit ? 'Update Plan' : 'Create Plan'}
        </Button>
      </div>
    </form>
  )
}
