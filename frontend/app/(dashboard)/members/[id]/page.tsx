'use client'

import { useState, use }  from 'react'
import { useRouter }       from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AccountsBillingTab } from '@/components/modules/members/accounts-billing-tab'
import { MembershipTab } from '@/components/modules/members/membership-tab'
import {
  ArrowLeft, Pencil, UserCheck, History,
  BookOpen, ShoppingCart, CreditCard,
  MessageSquare, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { Badge }           from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton }        from '@/components/ui/skeleton'
import { Separator }       from '@/components/ui/separator'
import { Textarea }        from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api }             from '@/lib/api'
import { notify }          from '@/lib/toast'
import {
  cn, formatDate, formatDateTime, formatCurrency,
  getInitials, getStatusLabel,
} from '@/lib/utils'
import { MemberForm }       from '@/components/modules/members/member-form'
import { AssignPlanDialog } from '@/components/modules/members/assign-plan-dialog'

const STATUS_BADGE: Record<string, string> = {
  active:             'bg-green-500/10  text-green-400  border-green-500/20',
  inactive:           'bg-slate-500/10  text-slate-400  border-slate-500/20',
  frozen:             'bg-blue-500/10   text-blue-400   border-blue-500/20',
  banned:             'bg-red-500/10    text-red-400    border-red-500/20',
  succeeded:          'bg-green-500/10  text-green-400  border-green-500/20',
  pending:            'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  failed:             'bg-red-500/10    text-red-400    border-red-500/20',
  refunded:           'bg-slate-500/10  text-slate-400  border-slate-500/20',
  confirmed:          'bg-green-500/10  text-green-400  border-green-500/20',
  cancelled:          'bg-red-500/10    text-red-400    border-red-500/20',
  waitlisted:         'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function MemberDetailPage({ params }: PageProps) {
  const router = useRouter()
  const qc     = useQueryClient()
  const { id } = use(params)

  const [editOpen,   setEditOpen]   = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [note, setNote]             = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const { data: memberData, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn:  () => api.get(`/members/${id}`).then(r => r.data.data),
  })

  const { data: checkins = [] } = useQuery<any[]>({
    queryKey: ['member-checkins', id],
    queryFn:  () => api.get(`/members/${id}/checkins`, { params: { limit: 20 } }).then(r => r.data.data ?? []),
  })

  const { data: payments = [] } = useQuery<any[]>({
    queryKey: ['member-payments', id],
    queryFn:  () => api.get(`/members/${id}/payments`, { params: { limit: 20 } }).then(r => r.data.data ?? []),
  })

  const { data: bookings = [] } = useQuery<any[]>({
    queryKey: ['member-bookings', id],
    queryFn:  () => api.get('/bookings', { params: { memberId: id, limit: 20 } }).then(r => r.data.data ?? []),
  })

  const checkin = useMutation({
    mutationFn: () => api.post('/checkins', { memberId: id, method: 'manual' }),
    onSuccess:  () => {
      notify.success('Checked in', `${m?.first_name} has been checked in`)
      qc.invalidateQueries({ queryKey: ['member-checkins', id] })
    },
    onError: (e: any) => notify.error('Check-in failed', e.response?.data?.error?.message),
  })

  async function saveNote() {
    if (!note.trim()) return
    setSavingNote(true)
    try {
      await api.patch(`/members/${id}`, { healthNotes: note })
      notify.success('Note saved')
      qc.invalidateQueries({ queryKey: ['member', id] })
      setNote('')
    } catch {
      notify.error('Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  const m   = memberData
  const sub = m?.subscription

  const totalOwed = payments
    .filter((p: any) => ['pending', 'failed'].includes(p.status))
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0)

  if (isLoading) return <MemberDetailSkeleton />

  if (!m) return (
    <div className="flex flex-col items-center justify-center h-96 gap-3">
      <AlertCircle className="h-10 w-10 text-muted-foreground" />
      <p className="text-muted-foreground">Member not found</p>
      <Button variant="outline" onClick={() => router.back()}>Go back</Button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold uppercase tracking-wide">
            {m.last_name}, {m.first_name}
          </h1>
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        </div>
        <Button size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Member
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <div className="w-56 shrink-0 border-r flex flex-col overflow-y-auto bg-muted/10">

          {/* Avatar + status */}
          <div className="flex flex-col items-center gap-3 p-6 border-b">
            <Avatar className="w-24 h-24">
              <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                {getInitials(m.first_name, m.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">{m.first_name} {m.last_name}</p>
              <Badge variant="outline" className={cn('text-xs', STATUS_BADGE[m.status] ?? '')}>
                {getStatusLabel(m.status)}
              </Badge>
            </div>
          </div>

          {/* Quick actions */}
          <div className="p-3 space-y-2 border-b">
            <Button
              size="sm"
              className="w-full justify-start gap-2 text-xs h-8"
              onClick={() => checkin.mutate()}
              disabled={checkin.isPending}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {checkin.isPending ? 'Checking in…' : 'Check-in'}
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs h-8">
              <History className="h-3.5 w-3.5" /> Visit History
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs h-8">
              <BookOpen className="h-3.5 w-3.5" /> Booking
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs h-8">
              <ShoppingCart className="h-3.5 w-3.5" /> Purchase
            </Button>
          </div>

          {/* Account summary */}
          <div className="p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Member Owes</span>
                <span className={cn('font-semibold', totalOwed > 0 ? 'text-red-400' : 'text-foreground')}>
                  {formatCurrency(totalOwed, 'NGN')}
                </span>
              </div>

              {sub ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium text-right ml-2 truncate max-w-[100px]">{sub.planName}</span>
                  </div>
                  {sub.credits != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Credits</span>
                      <span className="font-medium">{sub.credits} left</span>
                    </div>
                  )}
                  {sub.endDate && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Expires</span>
                      <span className="font-medium">{formatDate(sub.endDate)}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground italic text-xs">No active plan</p>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-8"
              onClick={() => setAssignOpen(true)}
            >
              <CreditCard className="h-3 w-3 mr-1.5" /> Subscriptions
            </Button>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details">
            <TabsList className="w-full rounded-none border-b h-11 justify-start px-6 gap-0 bg-transparent sticky top-0 z-10 bg-background">
              {[
                { value: 'details',    label: 'Details'            },
                { value: 'membership', label: 'Membership'         },
                { value: 'billing',    label: 'Accounts & Billing' },
                { value: 'comms',      label: 'Communication'      },
                { value: 'bookings',   label: 'Bookings'           },
                { value: 'training',   label: 'Training'           },
              ].map(t => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="text-xs px-4 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Details ── */}
            <TabsContent value="details" className="p-8">
              <div className="grid grid-cols-2 gap-10 max-w-3xl">
                <div className="space-y-6">
                  <Section title="Details">
                    <Field label="First Name"    value={m.first_name} />
                    <Field label="Last Name"     value={m.last_name}  />
                    <Field label="Date of Birth" value={m.date_of_birth ? formatDate(m.date_of_birth) : '—'} />
                    <Field label="Gender"        value={m.gender ?? '—'} />
                    <Field label="Member Since"  value={formatDate(m.joined_at)} />
                  </Section>

                  <Section title="Note">
                    <Textarea
                      placeholder="Add a note about this member…"
                      rows={4}
                      value={note || m.health_notes || ''}
                      onChange={e => setNote(e.target.value)}
                      className="text-sm resize-none"
                    />
                    {note && (
                      <Button size="sm" className="mt-2 text-xs" onClick={saveNote} disabled={savingNote}>
                        {savingNote ? 'Saving…' : 'Save Note'}
                      </Button>
                    )}
                  </Section>
                </div>

                <div className="space-y-6">
                  <Section title="Contact">
                    <Field label="Email" value={m.email} />
                    <Field label="Cell"  value={m.phone ?? '—'} />
                  </Section>

                  <Section title="Emergency Contact">
                    {m.emergency_contact ? (
                      <>
                        <Field label="Name"         value={m.emergency_contact.name} />
                        <Field label="Phone"        value={m.emergency_contact.phone} />
                        <Field label="Relationship" value={m.emergency_contact.relationship} />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not set</p>
                    )}
                  </Section>

                  <Section title="Club">
                    <Field label="Gym" value="Benfit Lagos" />
                  </Section>
                </div>
              </div>
            </TabsContent>

            {/* ── Membership ── */}
<TabsContent value="membership" className="p-0">
  <MembershipTab
    memberId={id}
    memberName={`${m.first_name} ${m.last_name}`}
    member={m}
  />
</TabsContent>

            {/* ── Billing ── */}
            
           <TabsContent value="billing" className="p-0">
  <AccountsBillingTab memberId={id} member={m} />
</TabsContent>

            {/* ── Communication ── */}
            <TabsContent value="comms" className="p-8 max-w-2xl">
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground space-y-2">
                <MessageSquare className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">Communication history coming soon</p>
              </div>
            </TabsContent>

            {/* ── Bookings ── */}
            <TabsContent value="bookings" className="p-8 max-w-2xl space-y-4">
              <h3 className="text-sm font-semibold">Bookings</h3>
              {bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet</p>
              ) : (
                <div className="rounded-xl border overflow-hidden divide-y">
                  {bookings.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium">{b.session?.template_name ?? 'Class'}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.session?.starts_at ? formatDateTime(b.session.starts_at) : '—'}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn('text-xs', STATUS_BADGE[b.status] ?? '')}>
                        {b.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Training ── */}
            <TabsContent value="training" className="p-8 max-w-2xl space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <StatBox label="Total Check-ins"  value={(m as any).total_checkins   ?? 0} />
                <StatBox label="Classes Attended" value={(m as any).classes_attended ?? 0} />
                <StatBox label="Last Visit"       value={m.last_seen_at ? formatDate(m.last_seen_at) : 'Never'} />
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Check-ins</h4>
                {checkins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No check-ins yet</p>
                ) : (
                  <div className="rounded-xl border overflow-hidden divide-y">
                    {checkins.slice(0, 15).map((ci: any) => (
                      <div key={ci.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            ci.result === 'granted' ? 'bg-green-500' : 'bg-red-500'
                          )} />
                          <div>
                            <p className="text-sm">{ci.location_name ?? 'Main Gym'}</p>
                            <p className="text-xs text-muted-foreground capitalize">{ci.method}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(ci.checked_in_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

          </Tabs>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Edit Member</DialogTitle></DialogHeader>
          {m && (
            <MemberForm
              member={m}
              onSuccess={() => {
                setEditOpen(false)
                qc.invalidateQueries({ queryKey: ['member', id] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Assign plan dialog */}
      {assignOpen && m && (
        <AssignPlanDialog
          member={m}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function MemberDetailSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-56 border-r p-6 space-y-4">
        <Skeleton className="h-24 w-24 rounded-full mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="flex-1 p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold border-b pb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 items-center">
      <label className="text-xs text-muted-foreground">{label} *</label>
      <div className="border rounded-md px-3 py-2 text-sm bg-muted/30">{value || '—'}</div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center space-y-1">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
