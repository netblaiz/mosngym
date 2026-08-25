'use client'

import { useQuery }        from '@tanstack/react-query'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge }           from '@/components/ui/badge'
import { Skeleton }        from '@/components/ui/skeleton'
import { api }             from '@/lib/api'
import { cn, getInitials, getStatusColor, getStatusLabel } from '@/lib/utils'

interface Attendee {
  booking_id:       string
  member_id:        string
  first_name:       string
  last_name:        string
  email:            string
  photo_url:        string | null
  status:           string
  waitlist_position: number | null
  checked_in_at:    string | null
  booked_at:        string
}

export function AttendeesList({ sessionId }: { sessionId: string }) {
  const { data: attendees = [], isLoading } = useQuery<Attendee[]>({
    queryKey: ['attendees', sessionId],
    queryFn:  () => api.get(`/classes/sessions/${sessionId}/attendees`).then(r => r.data.data),
  })

  const confirmed  = attendees.filter(a => a.status === 'confirmed' || a.status === 'attended')
  const waitlisted = attendees.filter(a => a.status === 'waitlisted')

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (attendees.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No bookings yet
      </p>
    )
  }

  return (
    <div className="space-y-4">

      {/* Confirmed */}
      {confirmed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Confirmed ({confirmed.length})
          </p>
          {confirmed.map(a => (
            <AttendeeRow key={a.booking_id} attendee={a} />
          ))}
        </div>
      )}

      {/* Waitlist */}
      {waitlisted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Waitlist ({waitlisted.length})
          </p>
          {waitlisted.map(a => (
            <AttendeeRow key={a.booking_id} attendee={a} />
          ))}
        </div>
      )}

    </div>
  )
}

function AttendeeRow({ attendee: a }: { attendee: Attendee }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {getInitials(a.first_name, a.last_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{a.first_name} {a.last_name}</p>
          <p className="text-xs text-muted-foreground">{a.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {a.waitlist_position && (
          <span className="text-xs text-muted-foreground">#{a.waitlist_position}</span>
        )}
        <Badge className={cn('text-xs', getStatusColor(a.status))}>
          {a.checked_in_at ? 'Checked in' : getStatusLabel(a.status)}
        </Badge>
      </div>
    </div>
  )
}
