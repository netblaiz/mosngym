'use client'

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, MoreHorizontal,
  XCircle, Users, Calendar, Clock,
} from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Badge }          from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton }       from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import {
  cn, formatDate, formatTime,
  getInitials, getStatusColor, getStatusLabel,
} from '@/lib/utils'
import type { Booking }   from '@/types'
import { BookingForm }    from '@/components/modules/bookings/booking-form'

async function fetchBookings(params: {
  page: number; limit: number; status?: string; search?: string
}) {
  const { data } = await api.get('/bookings', { params })
  return data
}

export default function BookingsPage() {
  const qc = useQueryClient()

  const [search,        setSearch]        = useState('')
  const [status,        setStatus]        = useState('all')
  const [page,          setPage]          = useState(1)
  const [createOpen,    setCreateOpen]    = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null)
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', page, status, search],
    queryFn:  () => fetchBookings({
      page, limit,
      status: status === 'all' ? undefined : status,
    }),
    placeholderData: (prev) => prev,
  })

  const bookings: Booking[] = data?.data ?? []
  const meta                = data?.meta

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`, {
      data: { reason: 'Cancelled by staff' },
    }),
    onSuccess: () => {
      notify.success('Booking cancelled')
      qc.invalidateQueries({ queryKey: ['bookings'] })
      setCancelConfirm(null)
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed to cancel'),
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Bookings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {meta ? `${meta.total} total bookings` : 'Loading...'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New booking
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="waitlisted">Waitlisted</SelectItem>
            <SelectItem value="attended">Attended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Booked</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No bookings found
                </TableCell>
              </TableRow>
            ) : (
              bookings.map(booking => (
                <TableRow key={booking.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(booking.first_name ?? '', booking.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {booking.first_name} {booking.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{booking.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm">{booking.class_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {booking.starts_at ? (
                      <div className="text-sm">
                        <p>{formatDate(booking.starts_at)}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(booking.starts_at)}
                        </p>
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs', getStatusColor(booking.status))}>
                      {getStatusLabel(booking.status)}
                      {booking.waitlist_position && ` #${booking.waitlist_position}`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {booking.credits_used > 0 ? booking.credits_used : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(booking.booked_at)}
                  </TableCell>
                  <TableCell>
                    {booking.status !== 'cancelled' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setCancelConfirm(booking)}
                            className="text-destructive focus:text-destructive"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Cancel booking
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create booking dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>Book a member into a class session</DialogDescription>
          </DialogHeader>
          <BookingForm
            onSuccess={() => {
              setCreateOpen(false)
              qc.invalidateQueries({ queryKey: ['bookings'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={!!cancelConfirm} onOpenChange={() => setCancelConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel booking?</DialogTitle>
            <DialogDescription>
              This will cancel {cancelConfirm?.first_name}'s booking
              {cancelConfirm?.class_name ? ` for ${cancelConfirm.class_name}` : ''}.
              Credits will be refunded if within the cancellation window.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setCancelConfirm(null)}>Keep</Button>
            <Button
              variant="destructive"
              onClick={() => cancelConfirm && cancelMutation.mutate(cancelConfirm.id)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel booking'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}