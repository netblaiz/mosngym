'use client'

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, startOfWeek } from 'date-fns'
import {
  Plus, ChevronLeft, ChevronRight,
  Clock, Users, MapPin, MoreHorizontal,
  Pencil, XCircle, Eye, LayoutGrid, List,
} from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Badge }          from '@/components/ui/badge'
import { Skeleton }       from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import { cn, formatTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import type { ClassSession, ClassTemplate } from '@/types'
import { SessionForm }    from '@/components/modules/classes/session-form'
import { TemplateForm }   from '@/components/modules/classes/template-form'
import { AttendeesList }  from '@/components/modules/classes/attendees-list'

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSessions(from: string, to: string) {
  const { data } = await api.get('/classes/sessions', { params: { from, to, limit: 100 } })
  return data.data as ClassSession[]
}

async function fetchTemplates() {
  const { data } = await api.get('/classes/templates')
  return data.data as ClassTemplate[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const qc = useQueryClient()

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [createOpen,    setCreateOpen]    = useState(false)
  const [templateOpen,  setTemplateOpen]  = useState(false)
  const [editSession,   setEditSession]   = useState<ClassSession | null>(null)
  const [viewAttendees, setViewAttendees] = useState<ClassSession | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<ClassSession | null>(null)
  const [activeTab,     setActiveTab]     = useState('timetable')

  const weekEnd  = addDays(weekStart, 6)
  const fromStr  = format(weekStart, "yyyy-MM-dd'T'00:00:00'Z'")
  const toStr    = format(weekEnd,   "yyyy-MM-dd'T'23:59:59'Z'")

  const { data: sessions  = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['sessions', fromStr],
    queryFn:  () => fetchSessions(fromStr, toStr),
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn:  fetchTemplates,
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/classes/sessions/${id}/cancel`, { reason }),
    onSuccess: () => {
      notify.success('Session cancelled')
      qc.invalidateQueries({ queryKey: ['sessions'] })
      setCancelConfirm(null)
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed to cancel'),
  })

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Classes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateOpen(true)}>
            <LayoutGrid className="w-4 h-4 mr-2" />
            Templates
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add session
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="timetable"><LayoutGrid className="w-3.5 h-3.5 mr-1.5" />Timetable</TabsTrigger>
            <TabsTrigger value="list"><List className="w-3.5 h-3.5 mr-1.5" />List</TabsTrigger>
          </TabsList>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="w-8 h-8"
              onClick={() => setWeekStart(d => addDays(d, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="w-8 h-8"
              onClick={() => setWeekStart(d => addDays(d, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Timetable view */}
        <TabsContent value="timetable" className="mt-4">
          <div className="grid grid-cols-7 gap-2">
            {days.map(day => {
              const daySessions = sessions.filter(s =>
                format(new Date(s.starts_at), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
              )
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

              return (
                <div key={day.toISOString()} className="space-y-2">
                  {/* Day header */}
                  <div className={cn(
                    'text-center py-2 rounded-lg',
                    isToday ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
                  )}>
                    <p className="text-xs font-medium">{format(day, 'EEE')}</p>
                    <p className={cn('text-lg font-bold', !isToday && 'text-muted-foreground')}>
                      {format(day, 'd')}
                    </p>
                  </div>

                  {/* Sessions */}
                  <div className="space-y-1.5 min-h-32">
                    {loadingSessions ? (
                      <Skeleton className="h-16 w-full rounded-lg" />
                    ) : daySessions.length === 0 ? (
                      <div className="h-16 border border-dashed rounded-lg flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">No classes</p>
                      </div>
                    ) : (
                      daySessions.map(session => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          onView={() => setViewAttendees(session)}
                          onEdit={() => setEditSession(session)}
                          onCancel={() => setCancelConfirm(session)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        {/* List view */}
        <TabsContent value="list" className="mt-4">
          <div className="border rounded-lg overflow-hidden divide-y divide-border">
            {loadingSessions ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))
            ) : sessions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                No sessions this week
              </div>
            ) : (
              sessions
                .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
                .map(session => (
                  <div key={session.id} className="flex items-center justify-between p-4 hover:bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-3 h-12 rounded-full"
                        style={{ backgroundColor: session.color ?? '#6366f1' }}
                      />
                      <div>
                        <p className="font-medium text-sm">{session.class_name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(session.starts_at), 'EEE MMM d')} · {formatTime(session.starts_at)} – {formatTime(session.ends_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {session.location_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {session.confirmed_count ?? 0}/{session.capacity}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={cn('text-xs', getStatusColor(session.status))}>
                        {getStatusLabel(session.status)}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewAttendees(session)}>
                            <Eye className="w-4 h-4 mr-2" /> Attendees
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditSession(session)}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {session.status !== 'cancelled' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setCancelConfirm(session)}
                                className="text-destructive focus:text-destructive"
                              >
                                <XCircle className="w-4 h-4 mr-2" /> Cancel
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create session dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add session</DialogTitle>
            <DialogDescription>Schedule a new class session</DialogDescription>
          </DialogHeader>
          <SessionForm
            templates={templates}
            onSuccess={() => {
              setCreateOpen(false)
              qc.invalidateQueries({ queryKey: ['sessions'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit session dialog */}
      <Dialog open={!!editSession} onOpenChange={() => setEditSession(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
            <DialogDescription>Update session details</DialogDescription>
          </DialogHeader>
          {editSession && (
            <SessionForm
              session={editSession}
              templates={templates}
              onSuccess={() => {
                setEditSession(null)
                qc.invalidateQueries({ queryKey: ['sessions'] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Templates dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Class templates</DialogTitle>
            <DialogDescription>Manage reusable class types</DialogDescription>
          </DialogHeader>
          <TemplateForm
            templates={templates}
            onSuccess={() => qc.invalidateQueries({ queryKey: ['templates'] })}
          />
        </DialogContent>
      </Dialog>

      {/* Attendees dialog */}
      <Dialog open={!!viewAttendees} onOpenChange={() => setViewAttendees(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewAttendees?.class_name} — Attendees</DialogTitle>
            <DialogDescription>
              {viewAttendees && `${formatTime(viewAttendees.starts_at)} · ${viewAttendees.confirmed_count ?? 0}/${viewAttendees.capacity} confirmed`}
            </DialogDescription>
          </DialogHeader>
          {viewAttendees && <AttendeesList sessionId={viewAttendees.id} />}
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={!!cancelConfirm} onOpenChange={() => setCancelConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel session?</DialogTitle>
            <DialogDescription>
              All bookings will be cancelled and credits refunded to members.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setCancelConfirm(null)}>Keep</Button>
            <Button
              variant="destructive"
              onClick={() => cancelConfirm && cancelMutation.mutate({ id: cancelConfirm.id })}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ─── Session card (timetable view) ────────────────────────────────────────────

function SessionCard({ session, onView, onEdit, onCancel }: {
  session:  ClassSession
  onView:   () => void
  onEdit:   () => void
  onCancel: () => void
}) {
  const isFull      = (session.confirmed_count ?? 0) >= session.capacity
  const isCancelled = session.status === 'cancelled'

  return (
    <div
      className={cn(
        'rounded-lg p-2 text-xs cursor-pointer border',
        isCancelled ? 'opacity-50 border-dashed' : 'hover:opacity-90'
      )}
      style={{
        backgroundColor: `${session.color ?? '#6366f1'}20`,
        borderColor:      session.color ?? '#6366f1',
      }}
      onClick={onView}
    >
      <p className="font-semibold truncate" style={{ color: session.color ?? '#6366f1' }}>
        {session.class_name}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {formatTime(session.starts_at)}
      </p>
      <div className="flex items-center justify-between mt-1">
        <span className={cn('text-muted-foreground', isFull && 'text-amber-500 font-medium')}>
          {session.confirmed_count ?? 0}/{session.capacity}
        </span>
        {!isCancelled && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onView() }}>
                <Eye className="w-3.5 h-3.5 mr-2" /> Attendees
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit() }}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={e => { e.stopPropagation(); onCancel() }}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="w-3.5 h-3.5 mr-2" /> Cancel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
