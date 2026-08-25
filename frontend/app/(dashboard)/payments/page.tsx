'use client'

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Download, MoreHorizontal,
  RotateCcw, TrendingUp, DollarSign,
  XCircle, CheckCircle, Clock,
} from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Badge }          from '@/components/ui/badge'
import { Skeleton }       from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
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
  cn, formatDate, formatCurrency,
  getInitials, getStatusColor, getStatusLabel,
} from '@/lib/utils'
import type { Payment }   from '@/types'
import { ChargeForm }     from '@/components/modules/payments/charge-form'
import { RefundForm }     from '@/components/modules/payments/refund-form'

async function fetchPayments(params: {
  page: number; limit: number; status?: string; type?: string
}) {
  const { data } = await api.get('/payments', { params })
  return data
}

async function fetchOverview() {
  const { data } = await api.get('/analytics/overview')
  return data.data
}

export default function PaymentsPage() {
  const qc = useQueryClient()

  const [status,       setStatus]       = useState('all')
  const [type,         setType]         = useState('all')
  const [page,         setPage]         = useState(1)
  const [chargeOpen,   setChargeOpen]   = useState(false)
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, status, type],
    queryFn:  () => fetchPayments({
      page, limit,
      status: status === 'all' ? undefined : status,
      type:   type   === 'all' ? undefined : type,
    }),
    placeholderData: (prev) => prev,
  })

  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn:  fetchOverview,
  })

  const payments: Payment[] = data?.data ?? []
  const meta                = data?.meta

  const statusIcon = (status: string) => {
    if (status === 'succeeded') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />
    if (status === 'failed')    return <XCircle     className="w-3.5 h-3.5 text-red-500" />
    return                             <Clock       className="w-3.5 h-3.5 text-amber-500" />
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Payments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {meta ? `${meta.total} transactions` : 'Loading...'}
          </p>
        </div>
        <Button onClick={() => setChargeOpen(true)}>
          <DollarSign className="w-4 h-4 mr-2" />
          Charge member
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This month</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(overview?.revenue?.revenue_this_month ?? 0)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-green-500/10">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last month</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(overview?.revenue?.revenue_last_month ?? 0)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed (7 days)</p>
                <p className="text-2xl font-bold mt-1">
                  {overview?.revenue?.failed_last_7d ?? 0}
                </p>
              </div>
              <div className={cn(
                'p-2.5 rounded-lg',
                (overview?.revenue?.failed_last_7d ?? 0) > 0
                  ? 'bg-red-500/10'
                  : 'bg-muted'
              )}>
                <XCircle className={cn(
                  'w-5 h-5',
                  (overview?.revenue?.failed_last_7d ?? 0) > 0
                    ? 'text-red-500'
                    : 'text-muted-foreground'
                )} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={v => { setType(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="subscription">Subscription</SelectItem>
            <SelectItem value="one_off">One-off</SelectItem>
            <SelectItem value="pos_sale">POS sale</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
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
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No payments found
                </TableCell>
              </TableRow>
            ) : (
              payments.map(payment => (
                <TableRow key={payment.id} className="hover:bg-muted/50">
                  <TableCell>
                    {payment.first_name ? (
                      <div>
                        <p className="text-sm font-medium">
                          {payment.first_name} {payment.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{payment.email}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.plan_name ?? payment.type.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {payment.type.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">
                        {formatCurrency(payment.amount, payment.currency)}
                      </p>
                      {parseFloat(payment.amount_refunded) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          -{formatCurrency(payment.amount_refunded, payment.currency)} refunded
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {statusIcon(payment.status)}
                      <Badge className={cn('text-xs', getStatusColor(payment.status))}>
                        {getStatusLabel(payment.status)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.paid_at
                      ? formatDate(payment.paid_at)
                      : formatDate(payment.created_at)}
                  </TableCell>
                  <TableCell>
                    {payment.status === 'succeeded' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setRefundTarget(payment)}>
                            <RotateCcw className="w-4 h-4 mr-2" /> Refund
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

      {/* Charge dialog */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Charge member</DialogTitle>
            <DialogDescription>Process a one-off payment</DialogDescription>
          </DialogHeader>
          <ChargeForm
            onSuccess={() => {
              setChargeOpen(false)
              qc.invalidateQueries({ queryKey: ['payments'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={!!refundTarget} onOpenChange={() => setRefundTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              Issue a full or partial refund for this payment
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <RefundForm
              payment={refundTarget}
              onSuccess={() => {
                setRefundTarget(null)
                qc.invalidateQueries({ queryKey: ['payments'] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}