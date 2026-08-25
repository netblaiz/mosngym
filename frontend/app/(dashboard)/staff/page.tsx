'use client'

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, MoreHorizontal, Shield,
  UserX, UserCheck, Pencil, Key,
} from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Badge }          from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton }       from '@/components/ui/skeleton'
import {
  Card, CardContent,
} from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import {
  cn, formatDate, formatTimeAgo,
  getInitials,
} from '@/lib/utils'
import type { Staff }     from '@/types'
import { InviteStaffForm } from '@/components/modules/staff/invite-staff-form'
import { StaffPermissions } from '@/components/modules/staff/staff-permissions'

async function fetchStaff() {
  const { data } = await api.get('/staff', { params: { limit: 100 } })
  return data.data as Staff[]
}

const ROLE_COLORS: Record<string, string> = {
  owner:       'bg-purple-500/10 text-purple-500',
  manager:     'bg-blue-500/10 text-blue-500',
  trainer:     'bg-teal-500/10 text-teal-500',
  front_desk:  'bg-green-500/10 text-green-500',
  instructor:  'bg-amber-500/10 text-amber-500',
}

export default function StaffPage() {
  const qc = useQueryClient()

  const [inviteOpen,      setInviteOpen]      = useState(false)
  const [permissionsStaff, setPermissionsStaff] = useState<Staff | null>(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState<Staff | null>(null)

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn:  fetchStaff,
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/staff/${id}/deactivate`),
    onSuccess: () => {
      notify.success('Staff member deactivated')
      qc.invalidateQueries({ queryKey: ['staff'] })
      setDeactivateConfirm(null)
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed'),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/staff/${id}/reactivate`),
    onSuccess: () => {
      notify.success('Staff member reactivated')
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed'),
  })

  const activeStaff   = staffList.filter(s => s.is_active)
  const inactiveStaff = staffList.filter(s => !s.is_active)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Staff</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activeStaff.length} active staff member{activeStaff.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Invite staff
        </Button>
      </div>

      {/* Active staff grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : activeStaff.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm">No staff members yet</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setInviteOpen(true)}>
            Invite your first staff member
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeStaff.map(staff => (
            <StaffCard
              key={staff.id}
              staff={staff}
              onPermissions={() => setPermissionsStaff(staff)}
              onDeactivate={() => setDeactivateConfirm(staff)}
              onReactivate={() => reactivateMutation.mutate(staff.id)}
            />
          ))}
        </div>
      )}

      {/* Inactive staff */}
      {inactiveStaff.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Inactive ({inactiveStaff.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
            {inactiveStaff.map(staff => (
              <StaffCard
                key={staff.id}
                staff={staff}
                onPermissions={() => setPermissionsStaff(staff)}
                onDeactivate={() => setDeactivateConfirm(staff)}
                onReactivate={() => reactivateMutation.mutate(staff.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite staff member</DialogTitle>
            <DialogDescription>
              Send an invitation to a new staff member
            </DialogDescription>
          </DialogHeader>
          <InviteStaffForm
            onSuccess={() => {
              setInviteOpen(false)
              qc.invalidateQueries({ queryKey: ['staff'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Permissions dialog */}
      <Dialog open={!!permissionsStaff} onOpenChange={() => setPermissionsStaff(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {permissionsStaff?.email} — Permissions
            </DialogTitle>
            <DialogDescription>
              Manage role assignments and permission overrides
            </DialogDescription>
          </DialogHeader>
          {permissionsStaff && (
            <StaffPermissions
              staff={permissionsStaff}
              onSuccess={() => {
                setPermissionsStaff(null)
                qc.invalidateQueries({ queryKey: ['staff'] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog open={!!deactivateConfirm} onOpenChange={() => setDeactivateConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate staff member?</DialogTitle>
            <DialogDescription>
              {deactivateConfirm?.email} will lose access immediately.
              You can reactivate them at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setDeactivateConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deactivateConfirm && deactivateMutation.mutate(deactivateConfirm.id)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ─── Staff card ───────────────────────────────────────────────────────────────

function StaffCard({ staff, onPermissions, onDeactivate, onReactivate }: {
  staff:         Staff
  onPermissions: () => void
  onDeactivate:  () => void
  onReactivate:  () => void
}) {
  return (
    <Card className={cn(!staff.is_active && 'opacity-70')}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-11 h-11">
              <AvatarFallback className="text-sm bg-primary/10 text-primary">
                {getInitials(staff.email?.split('@')[0] ?? 'S')}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium truncate max-w-36">{staff.email}</p>
              <Badge className={cn('text-xs mt-1', ROLE_COLORS[staff.role] ?? 'bg-slate-500/10 text-slate-500')}>
                {staff.role.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 -mr-1 -mt-1">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onPermissions}>
                <Key className="w-4 h-4 mr-2" /> Permissions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {staff.is_active ? (
                <DropdownMenuItem
                  onClick={onDeactivate}
                  className="text-destructive focus:text-destructive"
                >
                  <UserX className="w-4 h-4 mr-2" /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onReactivate}>
                  <UserCheck className="w-4 h-4 mr-2" /> Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Role templates */}
        {staff.role_templates && staff.role_templates.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {staff.role_templates.map(rt => (
              <span
                key={rt.id}
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: `${rt.color}20`,
                  color:       rt.color,
                }}
              >
                {rt.name}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {staff.accepted_at
              ? `Joined ${formatDate(staff.accepted_at)}`
              : 'Invite pending'}
          </span>
          {staff.is_active ? (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Active
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Inactive</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}