'use client'

import { useState }       from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Loader2, Shield, Plus, X } from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Badge }          from '@/components/ui/badge'
import { Skeleton }       from '@/components/ui/skeleton'
import { Separator }      from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api }            from '@/lib/api'
import { notify }         from '@/lib/toast'
import { cn }             from '@/lib/utils'
import type { Staff, RoleTemplate } from '@/types'

interface Permissions {
  effectivePermissions: string[]
  overrides: { permission_key: string; effect: 'grant' | 'revoke'; reason: string | null }[]
  roleTemplates: RoleTemplate[]
}

const PERMISSION_GROUPS: Record<string, string[]> = {
  'Members':       ['members:read','members:create','members:edit','members:delete','members:export'],
  'Subscriptions': ['subscriptions:read','subscriptions:create','subscriptions:edit','subscriptions:cancel'],
  'Billing':       ['billing:read','billing:charge','billing:refund','billing:export'],
  'Classes':       ['classes:read','classes:create','classes:edit','classes:cancel','bookings:read','bookings:manage'],
  'Check-ins':     ['checkins:read','checkins:create'],
  'Staff':         ['staff:read','staff:invite','staff:edit','staff:permissions','staff:schedule:read','staff:schedule:edit'],
  'CRM':           ['leads:read','leads:create','leads:edit','leads:convert'],
  'Communications':['communications:read','communications:send','automations:edit'],
  'Point of Sale': ['pos:read','pos:sell','pos:refund','pos:products:edit'],
  'Analytics':     ['analytics:read','analytics:export'],
  'Settings':      ['settings:read','settings:edit','integrations:manage','audit:read','plans:manage'],
}

interface Props {
  staff:     Staff
  onSuccess: () => void
}

export function StaffPermissions({ staff, onSuccess }: Props) {
  const [selectedRole, setSelectedRole] = useState('')

  // Fetch current permissions
  const { data: perms, isLoading, refetch } = useQuery<Permissions>({
    queryKey: ['staff-permissions', staff.id],
    queryFn:  () => api.get(`/staff/${staff.id}/permissions`).then(r => r.data.data),
  })

  // Fetch available role templates
  const { data: allRoles = [] } = useQuery<RoleTemplate[]>({
    queryKey: ['role-templates'],
    queryFn:  () => api.get('/staff').then(() =>
      // Get from permissions endpoint which includes system roles
      api.get(`/staff/${staff.id}/permissions`).then(r => r.data.data.roleTemplates)
    ),
  })

  // Assign role mutation
  const assignRoleMutation = useMutation({
    mutationFn: (roleTemplateIds: string[]) =>
      api.put(`/staff/${staff.id}/roles`, { roleTemplateIds }),
    onSuccess: () => {
      notify.success('Roles updated')
      refetch()
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed'),
  })

  // Set override mutation
  const setOverrideMutation = useMutation({
    mutationFn: ({ key, effect }: { key: string; effect: 'grant' | 'revoke' }) =>
      api.post(`/staff/${staff.id}/overrides`, { permissionKey: key, effect }),
    onSuccess: () => {
      notify.success('Override set')
      refetch()
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed'),
  })

  // Remove override mutation
  const removeOverrideMutation = useMutation({
    mutationFn: (key: string) =>
      api.delete(`/staff/${staff.id}/overrides`, { data: { permissionKey: key } }),
    onSuccess: () => {
      notify.success('Override removed')
      refetch()
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed'),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  const currentRoleIds    = perms?.roleTemplates.map(r => r.id) ?? []
  const effectivePerms    = new Set(perms?.effectivePermissions ?? [])
  const overrideMap       = new Map(perms?.overrides.map(o => [o.permission_key, o.effect]) ?? [])

  return (
    <div className="space-y-6">

      {/* Current roles */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Assigned roles</h3>
        <div className="flex flex-wrap gap-2">
          {perms?.roleTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground">No roles assigned</p>
          )}
          {perms?.roleTemplates.map(rt => (
            <span
              key={rt.id}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
              style={{ background: `${rt.color}20`, color: rt.color }}
            >
              {rt.name}
              <button
                onClick={() => {
                  const newIds = currentRoleIds.filter(id => id !== rt.id)
                  assignRoleMutation.mutate(newIds)
                }}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        {/* Add role */}
        <div className="flex gap-2">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Add a role template..." />
            </SelectTrigger>
            <SelectContent>
              {[
                { id: 'manager',    name: 'Manager',          color: '#7c3aed' },
                { id: 'trainer',    name: 'Personal Trainer',  color: '#0891b2' },
                { id: 'front_desk', name: 'Front Desk',        color: '#059669' },
                { id: 'instructor', name: 'Group Instructor',  color: '#d97706' },
                { id: 'sales',      name: 'Sales',             color: '#db2777' },
                { id: 'readonly',   name: 'Read Only',         color: '#64748b' },
              ]
              .filter(r => !currentRoleIds.includes(r.id))
              .map(r => (
                <SelectItem key={r.id} value={r.id}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedRole || assignRoleMutation.isPending}
            onClick={() => {
              if (selectedRole) {
                assignRoleMutation.mutate([...currentRoleIds, selectedRole])
                setSelectedRole('')
              }
            }}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Permission matrix */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Permissions</h3>
        <p className="text-xs text-muted-foreground">
          Green = has permission · Click to grant/revoke individually
        </p>

        {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {keys.map(key => {
                const has      = effectivePerms.has(key)
                const override = overrideMap.get(key)
                const label    = key.split(':')[1]

                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (override) {
                        removeOverrideMutation.mutate(key)
                      } else if (has) {
                        setOverrideMutation.mutate({ key, effect: 'revoke' })
                      } else {
                        setOverrideMutation.mutate({ key, effect: 'grant' })
                      }
                    }}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-all',
                      has
                        ? 'bg-green-500/10 border-green-500/30 text-green-500 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500'
                        : 'bg-muted border-border text-muted-foreground hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-500',
                      override === 'grant'  && 'ring-1 ring-green-500',
                      override === 'revoke' && 'ring-1 ring-red-500',
                    )}
                    title={override ? `Override: ${override}` : has ? 'Click to revoke' : 'Click to grant'}
                  >
                    {label}
                    {override && (
                      <span className={cn(
                        'ml-1 text-xs',
                        override === 'grant' ? 'text-green-500' : 'text-red-500'
                      )}>
                        ★
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}