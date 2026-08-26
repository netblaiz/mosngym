'use client'

import { useState } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { notify } from '@/lib/toast'
import {
  cn,
  formatDate,
  formatCurrency,
} from '@/lib/utils'

import {
  ChevronDown,
  Plus,
  PauseCircle,
  Gift,
} from 'lucide-react'

import { AssignPlanDialog } from '@/components/modules/members/assign-plan-dialog'

const STATUS_STYLES: Record<string, string> = {
  active:
    'bg-green-500/10 text-green-400 border-green-500/20',

  expired:
    'bg-red-500/10 text-red-400 border-red-500/20',

  cancelled:
    'bg-slate-500/10 text-slate-400 border-slate-500/20',

  frozen:
    'bg-blue-500/10 text-blue-400 border-blue-500/20',

  pending:
    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

interface Props {
  memberId: string
  memberName: string
  member: any
}

interface Subscription {
  id: string
  plan_name?: string | null
  status: string
  price_paid: number
  currency?: string | null
  start_date?: string | null
  end_date?: string | null
  credits_total?: number | null
  credits_remaining?: number | null
  class_credits?: number | null
  last_used_at?: string | null
  auto_renew?: boolean
}

interface HoldDialogProps {
  open: boolean
  onClose: () => void
  activeSub?: Subscription
  onConfirm: (until: string) => void
  isPending: boolean
}

interface GiftDialogProps {
  open: boolean
  onClose: () => void
  activeSub?: Subscription
  onConfirm: (days: number) => void
  isPending: boolean
}

interface SubInfoDialogProps {
  sub: Subscription
  onClose: () => void
}

export function MembershipTab({
  memberId,
  memberName,
  member,
}: Props) {
  const qc = useQueryClient()

  const [assignOpen, setAssignOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [giftOpen, setGiftOpen] = useState(false)
  const [infoSub, setInfoSub] =
    useState<Subscription | null>(null)

  const [selectedMembership, setSelectedMembership] =
    useState('all')

  // Fetch all subscriptions
  const {
    data: subsData,
    isLoading: subsLoading,
  } = useQuery({
    queryKey: [
      'member-subscriptions',
      memberId,
    ],

    queryFn: () =>
      api
        .get('/subscriptions', {
          params: {
            memberId,
            limit: 50,
          },
        })
        .then((response) => response.data),
  })

  const subscriptions: Subscription[] =
    subsData?.data ?? []

  // Benefits derived from subscriptions
  const benefits = subscriptions.flatMap(
    (subscription) =>
      subscription.plan_name
        ? [
            {
              benefit:
                subscription.class_credits === null
                  ? 'All Classes (No Limits)'
                  : `${subscription.class_credits} Class Credits`,

              membership:
                subscription.plan_name,

              status:
                subscription.status,

              lastUsed:
                subscription.last_used_at ?? null,

              balance:
                subscription.credits_remaining === null
                  ? 'Unlimited'
                  : subscription.credits_remaining,

              subId:
                subscription.id,
            },
          ]
        : []
  )

  // Filter benefits
  const filteredBenefits =
    selectedMembership === 'all'
      ? benefits
      : benefits.filter(
          (benefit) =>
            benefit.subId === selectedMembership
        )

  // Freeze membership
  const freeze = useMutation({
    mutationFn: ({
      subId,
      until,
    }: {
      subId: string
      until: string
    }) =>
      api.post(
        `/subscriptions/${subId}/freeze`,
        {
          freezeUntil: until,
        }
      ),

    onSuccess: () => {
      notify.success(
        'Membership put on hold'
      )

      qc.invalidateQueries({
        queryKey: [
          'member-subscriptions',
          memberId,
        ],
      })

      qc.invalidateQueries({
        queryKey: ['member', memberId],
      })

      setHoldOpen(false)
    },

    onError: (error: any) => {
      notify.error(
        'Failed to hold membership',
        error.response?.data?.error?.message
      )
    },
  })

  // Gift time
  const giftTime = useMutation({
    mutationFn: ({
      subId,
      days,
    }: {
      subId: string
      days: number
    }) =>
      api.post(
        `/subscriptions/${subId}/gift`,
        {
          days,
        }
      ),

    onSuccess: () => {
      notify.success(
        'Time gifted successfully'
      )

      qc.invalidateQueries({
        queryKey: [
          'member-subscriptions',
          memberId,
        ],
      })

      setGiftOpen(false)
    },

    onError: (error: any) => {
      notify.error(
        'Failed to gift time',
        error.response?.data?.error?.message
      )
    },
  })

  const activeSub =
    subscriptions.find(
      (subscription) =>
        subscription.status === 'active'
    )

  return (
    <div className="p-8 space-y-8 max-w-5xl">

      {/* Action buttons */}

      <div className="flex items-center justify-end gap-3">

        <DropdownMenu>

          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
            >
              Actions

              <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">

            <DropdownMenuItem
              onClick={() =>
                setHoldOpen(true)
              }
              disabled={!activeSub}
            >
              <PauseCircle className="h-4 w-4 mr-2" />

              Hold Membership
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() =>
                setGiftOpen(true)
              }
              disabled={!activeSub}
            >
              <Gift className="h-4 w-4 mr-2" />

              Gift Time
            </DropdownMenuItem>

          </DropdownMenuContent>

        </DropdownMenu>

        <Button
          size="sm"
          onClick={() =>
            setAssignOpen(true)
          }
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />

          Add Membership
        </Button>

      </div>

      {/* Historic Memberships */}

      <div className="space-y-3">

        <h3 className="text-base font-semibold flex items-center gap-2">
          Historic Memberships

          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </h3>

        <div className="rounded-xl border overflow-hidden">

          <Table>

            <TableHeader>

              <TableRow className="bg-muted/50">

                <TableHead>
                  Membership Type
                </TableHead>

                <TableHead>
                  Price
                </TableHead>

                <TableHead>
                  Start Date
                </TableHead>

                <TableHead>
                  End Date
                </TableHead>

                <TableHead>
                  Status
                </TableHead>

                <TableHead>
                  Credits Used
                </TableHead>

                <TableHead className="w-16">
                  Actions
                </TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {subsLoading ? (

                Array.from({ length: 4 }).map(
                  (_, index) => (
                    <TableRow key={index}>

                      {Array.from({
                        length: 7,
                      }).map(
                        (_, cellIndex) => (
                          <TableCell
                            key={cellIndex}
                          >
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        )
                      )}

                    </TableRow>
                  )
                )

              ) : subscriptions.length === 0 ? (

                <TableRow>

                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground text-sm"
                  >
                    No membership history yet
                  </TableCell>

                </TableRow>

              ) : (

                subscriptions.map(
                  (subscription) => {

                    const creditsUsed =
                      subscription.credits_total !=
                        null &&
                      subscription.credits_remaining !=
                        null
                        ? subscription.credits_total -
                          subscription.credits_remaining
                        : null

                    const displayStatus =
                      subscription.status ===
                      'active'
                        ? 'Active'
                        : subscription.end_date &&
                            new Date(
                              subscription.end_date
                            ) < new Date()
                          ? 'Expired'
                          : subscription.status
                              .charAt(0)
                              .toUpperCase() +
                            subscription.status.slice(1)

                    return (
                      <TableRow
                        key={subscription.id}
                      >

                        <TableCell className="font-medium uppercase text-sm">
                          {subscription.plan_name ??
                            '—'}
                        </TableCell>

                        <TableCell className="text-sm">
                          {formatCurrency(
                            subscription.price_paid,
                            subscription.currency ??
                              'NGN'
                          )}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground">
                          {subscription.start_date
                            ? formatDate(
                                subscription.start_date
                              )
                            : '—'}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground">
                          {subscription.end_date
                            ? formatDate(
                                subscription.end_date
                              )
                            : 'Open-ended'}
                        </TableCell>

                        <TableCell>

                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              STATUS_STYLES[
                                subscription.status
                              ] ?? ''
                            )}
                          >
                            {displayStatus}
                          </Badge>

                        </TableCell>

                        <TableCell className="text-sm text-center">
                          {creditsUsed !== null
                            ? creditsUsed
                            : '—'}
                        </TableCell>

                        <TableCell>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-3"
                            onClick={() =>
                              setInfoSub(
                                subscription
                              )
                            }
                          >
                            Info
                          </Button>

                        </TableCell>

                      </TableRow>
                    )
                  }
                )
              )}

            </TableBody>

          </Table>

        </div>

      </div>

      {/* Historic Member Benefits */}

      <div className="space-y-3">

        <div className="flex items-center justify-between">

          <h3 className="text-base font-semibold">
            Historic Member Benefits
          </h3>

          <Select
            value={selectedMembership}
            onValueChange={
              setSelectedMembership
            }
          >

            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>

              <SelectItem value="all">
                All Memberships
              </SelectItem>

              {subscriptions.map(
                (subscription) => (
                  <SelectItem
                    key={subscription.id}
                    value={subscription.id}
                  >
                    {subscription.plan_name ??
                      subscription.id.slice(
                        0,
                        8
                      )}
                  </SelectItem>
                )
              )}

            </SelectContent>

          </Select>

        </div>

        <div className="rounded-xl border overflow-hidden">

          <Table>

            <TableHeader>

              <TableRow className="bg-muted/50">

                <TableHead>
                  Benefit
                </TableHead>

                <TableHead>
                  Membership
                </TableHead>

                <TableHead>
                  Last Used
                </TableHead>

                <TableHead>
                  Balance
                </TableHead>

                <TableHead className="w-16">
                  Actions
                </TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {subsLoading ? (

                Array.from({ length: 3 }).map(
                  (_, index) => (
                    <TableRow key={index}>

                      {Array.from({
                        length: 5,
                      }).map(
                        (_, cellIndex) => (
                          <TableCell
                            key={cellIndex}
                          >
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        )
                      )}

                    </TableRow>
                  )
                )

              ) : filteredBenefits.length === 0 ? (

                <TableRow>

                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground text-sm"
                  >
                    No benefits found
                  </TableCell>

                </TableRow>

              ) : (

                filteredBenefits.map(
                  (benefit, index) => (
                    <TableRow key={index}>

                      <TableCell className="text-sm">
                        {benefit.benefit}
                      </TableCell>

                      <TableCell className="text-sm">

                        <div>

                          <p className="font-medium uppercase">
                            {benefit.membership}
                          </p>

                          {benefit.status !==
                            'active' && (
                            <p className="text-xs text-red-400">
                              Expired
                            </p>
                          )}

                        </div>

                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {benefit.lastUsed
                          ? formatDate(
                              benefit.lastUsed
                            )
                          : '—'}
                      </TableCell>

                      <TableCell className="text-sm font-medium">
                        {benefit.balance}
                      </TableCell>

                      <TableCell>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-3"
                        >
                          Info
                        </Button>

                      </TableCell>

                    </TableRow>
                  )
                )
              )}

            </TableBody>

          </Table>

        </div>

      </div>

      {/* Assign plan dialog */}

      {assignOpen && (
        <AssignPlanDialog
          member={member}
          open={assignOpen}
          onClose={() => {
            setAssignOpen(false)

            qc.invalidateQueries({
              queryKey: [
                'member-subscriptions',
                memberId,
              ],
            })
          }}
        />
      )}

      {/* Hold membership dialog */}

      <HoldDialog
        open={holdOpen}
        onClose={() =>
          setHoldOpen(false)
        }
        activeSub={activeSub}
        onConfirm={(until) => {
          if (!activeSub?.id) {
            notify.error(
              'No active membership found'
            )
            return
          }

          freeze.mutate({
            subId: activeSub.id,
            until,
          })
        }}
        isPending={freeze.isPending}
      />

      {/* Gift time dialog */}

      <GiftDialog
        open={giftOpen}
        onClose={() =>
          setGiftOpen(false)
        }
        activeSub={activeSub}
        onConfirm={(days) => {
          if (!activeSub?.id) {
            notify.error(
              'No active membership found'
            )
            return
          }

          giftTime.mutate({
            subId: activeSub.id,
            days,
          })
        }}
        isPending={giftTime.isPending}
      />

      {/* Subscription info dialog */}

      {infoSub && (
        <SubInfoDialog
          sub={infoSub}
          onClose={() =>
            setInfoSub(null)
          }
        />
      )}

    </div>
  )
}

// ─────────────────────────────────────────────
// Hold dialog
// ─────────────────────────────────────────────

function HoldDialog({
  open,
  onClose,
  activeSub,
  onConfirm,
  isPending,
}: HoldDialogProps) {
  const [until, setUntil] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >

      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
      >

        <DialogHeader>

          <DialogTitle>
            Hold Membership
          </DialogTitle>

          <DialogDescription>
            Freeze {activeSub?.plan_name} until a
            specified date.
          </DialogDescription>

        </DialogHeader>

        <div className="space-y-4 pt-2">

          <div className="space-y-1.5">

            <Label>
              Hold Until
            </Label>

            <Input
              type="date"
              value={until}
              onChange={(event) =>
                setUntil(event.target.value)
              }
            />

          </div>

          <div className="flex justify-end gap-2">

            <Button
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button
              onClick={() =>
                onConfirm(until)
              }
              disabled={
                !until || isPending
              }
            >
              {isPending
                ? 'Holding…'
                : 'Confirm Hold'}
            </Button>

          </div>

        </div>

      </DialogContent>

    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Gift time dialog
// ─────────────────────────────────────────────

function GiftDialog({
  open,
  onClose,
  activeSub,
  onConfirm,
  isPending,
}: GiftDialogProps) {
  const [days, setDays] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >

      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
      >

        <DialogHeader>

          <DialogTitle>
            Gift Time
          </DialogTitle>

          <DialogDescription>
            Extend {activeSub?.plan_name} by a
            number of days.
          </DialogDescription>

        </DialogHeader>

        <div className="space-y-4 pt-2">

          <div className="space-y-1.5">

            <Label>
              Number of Days
            </Label>

            <Input
              type="number"
              placeholder="7"
              value={days}
              onChange={(event) =>
                setDays(event.target.value)
              }
            />

          </div>

          <div className="flex justify-end gap-2">

            <Button
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button
              onClick={() =>
                onConfirm(Number(days))
              }
              disabled={
                !days ||
                Number(days) <= 0 ||
                isPending
              }
            >
              {isPending
                ? 'Gifting…'
                : 'Gift Time'}
            </Button>

          </div>

        </div>

      </DialogContent>

    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Subscription info dialog
// ─────────────────────────────────────────────

function SubInfoDialog({
  sub,
  onClose,
}: SubInfoDialogProps) {
  const rows = [
    {
      label: 'Plan',
      value: sub.plan_name,
    },
    {
      label: 'Status',
      value: sub.status,
    },
    {
      label: 'Price Paid',
      value: formatCurrency(
        sub.price_paid,
        sub.currency ?? 'NGN'
      ),
    },
    {
      label: 'Start Date',
      value: sub.start_date
        ? formatDate(sub.start_date)
        : '—',
    },
    {
      label: 'End Date',
      value: sub.end_date
        ? formatDate(sub.end_date)
        : 'Open-ended',
    },
    {
      label: 'Credits Total',
      value:
        sub.credits_total ?? 'Unlimited',
    },
    {
      label: 'Credits Left',
      value:
        sub.credits_remaining ??
        'Unlimited',
    },
    {
      label: 'Auto Renew',
      value: sub.auto_renew
        ? 'Yes'
        : 'No',
    },
  ]

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >

      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
      >

        <DialogHeader>

          <DialogTitle>
            Subscription Info
          </DialogTitle>

        </DialogHeader>

        <div className="space-y-2 pt-2">

          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between text-sm py-1.5 border-b last:border-0"
            >

              <span className="text-muted-foreground">
                {row.label}
              </span>

              <span className="font-medium capitalize">
                {String(row.value)}
              </span>

            </div>
          ))}

        </div>

        <div className="flex justify-end pt-2">

          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>

        </div>

      </DialogContent>

    </Dialog>
  )
}