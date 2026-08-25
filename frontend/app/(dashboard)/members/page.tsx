'use client'

import { useState }          from 'react'
import { useRouter }         from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, MoreHorizontal,
  Eye, Pencil, Trash2, CreditCard,
} from 'lucide-react'
import { Button }            from '@/components/ui/button'
import { Input }             from '@/components/ui/input'
import { Badge }             from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton }          from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { api }               from '@/lib/api'
import { notify }            from '@/lib/toast'
import {
  cn, formatDate, formatTimeAgo,
  getInitials, getStatusColor, getStatusLabel,
} from '@/lib/utils'
import type { Member }       from '@/types'
import { MemberForm }        from '@/components/modules/members/member-form'
import { AssignPlanDialog }  from '@/components/modules/members/assign-plan-dialog'

async function fetchMembers(params: {
  page: number; limit: number; search?: string; status?: string
}) {
  const { data } = await api.get('/members', { params })
  return data
}

export default function MembersPage() {
  const router = useRouter()
  const qc     = useQueryClient()

  const [search,        setSearch]        = useState('')
  const [status,        setStatus]        = useState('all')
  const [page,          setPage]          = useState(1)
  const [createOpen,    setCreateOpen]    = useState(false)
  const [editMember,    setEditMember]    = useState<Member | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null)
  const [assignMember,  setAssignMember]  = useState<Member | null>(null)
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['members', page, search, status],
    queryFn:  () => fetchMembers({
      page, limit,
      search: search || undefined,
      status: status === 'all' ? undefined : status,
    }),
    placeholderData: (prev) => prev,
  })

  const members: Member[] = data?.data ?? []
  const meta              = data?.meta

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`),
    onSuccess: () => {
      notify.success('Member deleted')
      qc.invalidateQueries({ queryKey: ['members'] })
      setDeleteConfirm(null)
    },
    onError: (err: any) => notify.error(err.response?.data?.error?.message ?? 'Failed to delete'),
  })

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {meta ? `${meta.total} total members` : 'Loading...'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add member
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name or email..."
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="frozen">Frozen</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last seen</TableHead>
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
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              members.map(member => (
                <TableRow
                  key={member.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/members/${member.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(member.first_name, member.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{member.first_name} {member.last_name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs', getStatusColor(member.status))}>
                      {getStatusLabel(member.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(member.subscription as any)?.planName ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(member.subscription as any)?.credits != null
                      ? `${(member.subscription as any).credits} left`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(member.joined_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {member.last_seen_at ? formatTimeAgo(member.last_seen_at) : 'Never'}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-8 h-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/members/${member.id}`)}>
                          <Eye className="w-4 h-4 mr-2" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditMember(member)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssignMember(member)}>
                          <CreditCard className="w-4 h-4 mr-2" /> Assign Plan
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteConfirm(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>Create a new member for this gym</DialogDescription>
          </DialogHeader>
          <MemberForm onSuccess={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ['members'] }) }} />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editMember} onOpenChange={() => setEditMember(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>Update member information</DialogDescription>
          </DialogHeader>
          {editMember && (
            <MemberForm
              member={editMember}
              onSuccess={() => { setEditMember(null); qc.invalidateQueries({ queryKey: ['members'] }) }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Assign plan */}
      {assignMember && (
        <AssignPlanDialog
          member={assignMember}
          open={!!assignMember}
          onClose={() => setAssignMember(null)}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete member?</DialogTitle>
            <DialogDescription>
              This will delete {deleteConfirm?.first_name} {deleteConfirm?.last_name} and cancel their subscriptions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
