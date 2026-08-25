'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notify } from '@/lib/toast'
import { Plus, MapPin, Pencil, Trash2 } from 'lucide-react'

const schema = z.object({
  name:         z.string().min(1, 'Required'),
  addressLine1: z.string().optional(),
  city:         z.string().optional(),
  state:        z.string().optional(),
  country:      z.string().optional(),
  phone:        z.string().optional(),
  email:        z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function LocationsSettings() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['gym-locations'],
    queryFn:  () => api.get('/gym/locations').then(r => r.data.data ?? r.data),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const save = useMutation({
    mutationFn: (d: FormData) => editing
      ? api.patch(`/gym/locations/${editing.id}`, d)
      : api.post('/gym/locations', d),
    onSuccess: () => {
      notify.success(editing ? 'Location updated' : 'Location added')
      qc.invalidateQueries({ queryKey: ['gym-locations'] })
      setFormOpen(false)
      setEditing(null)
      reset()
    },
    onError: () => notify.error('Failed to save location'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/gym/locations/${id}`),
    onSuccess: () => {
      notify.success('Location removed')
      qc.invalidateQueries({ queryKey: ['gym-locations'] })
    },
    onError: (e: any) => notify.error('Failed to remove', e.response?.data?.error?.message),
  })

  const locations: any[] = Array.isArray(data) ? data : []

  function openEdit(loc: any) {
    setEditing(loc)
    reset({
      name:         loc.name         ?? '',
      addressLine1: loc.address_line1 ?? '',
      city:         loc.city         ?? '',
      state:        loc.state        ?? '',
      country:      loc.country      ?? '',
      phone:        loc.phone        ?? '',
      email:        loc.email        ?? '',
    })
    setFormOpen(true)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Gym Locations</h3>
        <Button size="sm" onClick={() => { setEditing(null); reset(); setFormOpen(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Location
        </Button>
      </div>

      {isLoading ? (
        Array.from({length: 2}).map((_,i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          No locations yet
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => (
            <div key={loc.id} className="rounded-xl border p-4 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{loc.name}</p>
                    {loc.is_primary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                  </div>
                  {loc.address_line1 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {loc.address_line1}{loc.city ? `, ${loc.city}` : ''}
                    </p>
                  )}
                  {loc.phone && <p className="text-xs text-muted-foreground">{loc.phone}</p>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!loc.is_primary && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove.mutate(loc.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={o => { if (!o) { setFormOpen(false); setEditing(null); reset() } }}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Location' : 'Add Location'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input {...register('name')} placeholder="Main Branch" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input {...register('addressLine1')} placeholder="12 Gym Street" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input {...register('city')} placeholder="Lagos" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input {...register('state')} placeholder="Lagos State" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="+2348012345678" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} placeholder="branch@gym.com" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : editing ? 'Update' : 'Add Location'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
