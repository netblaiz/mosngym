'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, UserCheck, Users, Clock,
  CheckCircle, XCircle, Wifi, WifiOff,
} from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Badge }          from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton }       from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import {
  cn, formatDateTime, formatTimeAgo, getInitials,
} from '@/lib/utils'
import type { CheckIn }   from '@/types'
import { ManualCheckin }  from '@/components/modules/checkins/manual-checkin'

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCheckins(params: { page: number; limit: number }) {
  const { data } = await api.get('/checkins', { params })
  return data
}

async function fetchToday() {
  const { data } = await api.get('/checkins/today')
  return data.data
}

async function fetchLive() {
  const { data } = await api.get('/checkins/live')
  return data.data?.members ?? []
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckInsPage() {
  const qc = useQueryClient()
  const [page,        setPage]        = useState(1)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [activeTab,   setActiveTab]   = useState<'live' | 'log'>('live')
  const limit = 20

  // Today stats
  const { data: todayStats } = useQuery({
    queryKey: ['checkins-today'],
    queryFn:  fetchToday,
    refetchInterval: 30_000,
  })

  // Live — who's currently inside
  const { data: liveMembers = [], isLoading: loadingLive } = useQuery({
    queryKey: ['checkins-live'],
    queryFn:  fetchLive,
    refetchInterval: 15_000,
  })

  // Full check-in log
  const { data, isLoading: loadingLog } = useQuery({
    queryKey: ['checkins', page],
    queryFn:  () => fetchCheckins({ page, limit }),
    placeholderData: (prev) => prev,
    enabled:  activeTab === 'log',
  })

  const checkins: CheckIn[] = data?.data ?? []
  const meta                = data?.meta

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Check-ins</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live entry tracking and visit history
          </p>
        </div>
        <Button onClick={() => setCheckinOpen(true)}>
          <UserCheck className="w-4 h-4 mr-2" />
          Manual check-in
        </Button>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Check-ins today</p>
                <p className="text-3xl font-bold mt-1">
                  {todayStats?.total_today ?? 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unique members</p>
                <p className="text-3xl font-bold mt-1">
                  {todayStats?.unique_members ?? 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Currently inside</p>
                <p className="text-3xl font-bold mt-1">
                  {todayStats?.currently_inside ?? liveMembers.length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('live')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'live'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live ({liveMembers.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'log'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Check-in log
        </button>
      </div>

      {/* Live view */}
      {activeTab === 'live' && (
        <div>
          {loadingLive ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : liveMembers.length === 0 ? (
            <div className="border rounded-lg p-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No members currently inside</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {liveMembers.map((member: any) => (
                <Card key={member.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="text-sm bg-green-500/10 text-green-500">
                          {getInitials(member.first_name, member.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="overflow-hidden">
                        <p className="text-sm font-medium truncate">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(member.checked_in_at)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Log view */}
      {activeTab === 'log' && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLog ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : checkins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No check-ins yet
                  </TableCell>
                </TableRow>
              ) : (
                checkins.map(ci => (
                  <TableRow key={ci.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(ci.first_name ?? '', ci.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-sm font-medium">
                          {ci.first_name} {ci.last_name}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {ci.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ci.location_name}
                    </TableCell>
                    <TableCell>
                      {ci.result === 'granted' ? (
                        <span className="flex items-center gap-1 text-green-500 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Granted
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Denied
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(ci.checked_in_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ci.checked_out_at ? formatDateTime(ci.checked_out_at) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual check-in dialog */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manual check-in</DialogTitle>
            <DialogDescription>Check a member into the gym</DialogDescription>
          </DialogHeader>
          <ManualCheckin
            onSuccess={() => {
              setCheckinOpen(false)
              qc.invalidateQueries({ queryKey: ['checkins-live'] })
              qc.invalidateQueries({ queryKey: ['checkins-today'] })
              qc.invalidateQueries({ queryKey: ['checkins'] })
            }}
          />
        </DialogContent>
      </Dialog>

    </div>
  )
}