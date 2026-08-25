'use client'

import { useState }       from 'react'
import { useForm }        from 'react-hook-form'
import { zodResolver }    from '@hookform/resolvers/zod'
import { z }              from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { format }         from 'date-fns'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import { cn, getInitials, formatTime } from '@/lib/utils'
import type { Member, ClassSession } from '@/types'

const schema = z.object({
  memberId:  z.string().uuid('Select a member'),
  sessionId: z.string().uuid('Select a session'),
})

type FormValues = z.infer<typeof schema>

export function BookingForm({ onSuccess }: { onSuccess: () => void }) {
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { memberId: '', sessionId: '' },
  })

  // Search members
  const { data: memberData } = useQuery({
    queryKey: ['members-search', memberSearch],
    queryFn:  () => api.get('/members', {
      params: { search: memberSearch, limit: 10, status: 'active' }
    }).then(r => r.data.data as Member[]),
    enabled: memberSearch.length > 1,
  })

  // Upcoming sessions
  const { data: sessions = [] } = useQuery<ClassSession[]>({
    queryKey: ['sessions-upcoming'],
    queryFn:  () => {
      const from = new Date().toISOString()
      const to   = new Date(Date.now() + 7 * 86_400_000).toISOString()
      return api.get('/classes/sessions', {
        params: { from, to, status: 'scheduled', limit: 50 }
      }).then(r => r.data.data)
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post('/bookings', { memberId: values.memberId, sessionId: values.sessionId }),
    onSuccess: (res) => {
      const status = res.data.data.status
      notify.success(
        status === 'confirmed'
          ? 'Booking confirmed'
          : `Added to waitlist (position #${res.data.data.waitlistPosition})`
      )
      onSuccess()
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Booking failed'),
  })

  return (
    <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">

      {/* Member search */}
      <div className="space-y-1.5">
        <Label>Member *</Label>
        {selectedMember ? (
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(selectedMember.first_name, selectedMember.last_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">
                  {selectedMember.first_name} {selectedMember.last_name}
                </p>
                <p className="text-xs text-muted-foreground">{selectedMember.email}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedMember(null)
                form.setValue('memberId', '')
                setMemberSearch('')
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search member name or email..."
                className="pl-9"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
              />
            </div>
            {memberData && memberData.length > 0 && (
              <div className="border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                {memberData.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                    onClick={() => {
                      setSelectedMember(m)
                      form.setValue('memberId', m.id)
                      setMemberSearch('')
                    }}
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(m.first_name, m.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.first_name} {m.last_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {memberSearch.length > 1 && memberData?.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No members found</p>
            )}
          </div>
        )}
        {form.formState.errors.memberId && (
          <p className="text-xs text-destructive">{form.formState.errors.memberId.message}</p>
        )}
      </div>

      {/* Session select */}
      <div className="space-y-1.5">
        <Label>Class session *</Label>
        <Select
          value={form.watch('sessionId')}
          onValueChange={v => form.setValue('sessionId', v)}
        >
          <SelectTrigger className={cn(form.formState.errors.sessionId && 'border-destructive')}>
            <SelectValue placeholder="Select a session" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {sessions.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                No upcoming sessions
              </div>
            ) : (
              sessions.map(s => {
                const spotsLeft = s.capacity - (s.confirmed_count ?? 0)
                return (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color ?? '#6366f1' }} />
                      <span>
                        {s.class_name} · {format(new Date(s.starts_at), 'EEE MMM d')} {formatTime(s.starts_at)}
                        {' '}
                        <span className={cn(
                          'text-xs',
                          spotsLeft === 0 ? 'text-amber-500' : 'text-muted-foreground'
                        )}>
                          ({spotsLeft > 0 ? `${spotsLeft} spots` : 'Waitlist'})
                        </span>
                      </span>
                    </div>
                  </SelectItem>
                )
              })
            )}
          </SelectContent>
        </Select>
        {form.formState.errors.sessionId && (
          <p className="text-xs text-destructive">{form.formState.errors.sessionId.message}</p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Book session
        </Button>
      </div>

    </form>
  )
}