'use client'

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, MoreHorizontal, Archive,
  Pencil, Users, CreditCard,
} from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Badge }          from '@/components/ui/badge'
import { Skeleton }       from '@/components/ui/skeleton'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
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
import { cn, formatCurrency } from '@/lib/utils'
import type { Plan }      from '@/types'
import { PlanForm }       from '@/components/modules/plans/plan-form'

async function fetchPlans() {
  const { data } = await api.get('/plans')
  return data.data as Plan[]
}

const BILLING_LABEL: Record<string, string> = {
  weekly:    'Weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly',
  one_time:  'One-time',
  drop_in:   'Drop-in',
}

export default function PlansPage() {
  const qc = useQueryClient()
  const [createOpen,  setCreateOpen]  = useState(false)
  const [editPlan,    setEditPlan]    = useState<Plan | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<Plan | null>(null)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn:  fetchPlans,
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/plans/${id}/archive`),
    onSuccess: () => {
      notify.success('Plan archived')
      qc.invalidateQueries({ queryKey: ['plans'] })
      setArchiveConfirm(null)
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed to archive'),
  })

  const activePlans   = plans.filter(p => !p.archived_at)
  const archivedPlans = plans.filter(p => p.archived_at)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Membership Plans</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activePlans.length} active plan{activePlans.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New plan
        </Button>
      </div>

      {/* Active plans */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : activePlans.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground text-sm">No plans yet</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            Create your first plan
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePlans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => setEditPlan(plan)}
              onArchive={() => setArchiveConfirm(plan)}
            />
          ))}
        </div>
      )}

      {/* Archived plans */}
      {archivedPlans.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Archived ({archivedPlans.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
            {archivedPlans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => {}}
                onArchive={() => {}}
                archived
              />
            ))}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New plan</DialogTitle>
            <DialogDescription>Create a membership plan for your gym</DialogDescription>
          </DialogHeader>
          <PlanForm
            onSuccess={() => {
              setCreateOpen(false)
              qc.invalidateQueries({ queryKey: ['plans'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editPlan} onOpenChange={() => setEditPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit plan</DialogTitle>
            <DialogDescription>Update plan details</DialogDescription>
          </DialogHeader>
          {editPlan && (
            <PlanForm
              onSuccess={() => {
                setEditPlan(null)
                qc.invalidateQueries({ queryKey: ['plans'] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog open={!!archiveConfirm} onOpenChange={() => setArchiveConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive plan?</DialogTitle>
            <DialogDescription>
              "{archiveConfirm?.name}" will be hidden from new signups.
              Existing members on this plan are not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setArchiveConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => archiveConfirm && archiveMutation.mutate(archiveConfirm.id)}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan, onEdit, onArchive, archived = false,
}: {
  plan:      Plan
  onEdit:    () => void
  onArchive: () => void
  archived?: boolean
}) {
  return (
    <Card className={cn('relative', archived && 'opacity-70')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{plan.name}</CardTitle>
            {plan.description && (
              <CardDescription className="mt-1 text-xs">{plan.description}</CardDescription>
            )}
          </div>
          {!archived && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-8 h-8 -mr-2 -mt-1">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onArchive}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="w-4 h-4 mr-2" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Price */}
        <div>
          <span className="text-3xl font-bold">
            {formatCurrency(plan.price)}
          </span>
          <span className="text-muted-foreground text-sm ml-1">
            / {BILLING_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
          </span>
        </div>

        {/* Features */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            {plan.class_credits === null
              ? 'Unlimited classes'
              : plan.class_credits === 0
                ? 'No class access'
                : `${plan.class_credits} class credits / cycle`
            }
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-3.5 h-3.5 shrink-0" />
            {plan.active_subscriptions ?? 0} active members
          </div>
        </div>

        {/* Badges */}
        <div className="flex gap-2 flex-wrap">
          {plan.is_public && (
            <Badge variant="secondary" className="text-xs">Public</Badge>
          )}
          {plan.duration_days && (
            <Badge variant="secondary" className="text-xs">{plan.duration_days} days</Badge>
          )}
          {archived && (
            <Badge variant="outline" className="text-xs text-muted-foreground">Archived</Badge>
          )}
        </div>

      </CardContent>
    </Card>
  )
}
