'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserPlus, Phone, Mail, Calendar, MoreHorizontal, ArrowRight } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { notify } from '@/lib/toast'
import { LeadForm } from '@/components/modules/leads/lead-form'
import { LeadDetail } from '@/components/modules/leads/lead-detail'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const STAGES = [
  { key: 'new',          label: 'New',          color: 'bg-slate-500/10  text-slate-400  border-slate-500/20'  },
  { key: 'contacted',    label: 'Contacted',     color: 'bg-blue-500/10   text-blue-400   border-blue-500/20'   },
  { key: 'trial_booked', label: 'Trial Booked',  color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { key: 'trial_done',   label: 'Trial Done',    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { key: 'converted',    label: 'Converted',     color: 'bg-green-500/10  text-green-400  border-green-500/20'  },
  { key: 'lost',         label: 'Lost',          color: 'bg-red-500/10    text-red-400    border-red-500/20'    },
]

const NEXT_STAGE: Record<string, string> = {
  new:          'contacted',
  contacted:    'trial_booked',
  trial_booked: 'trial_done',
  trial_done:   'converted',
}

export default function LeadsPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen]   = useState(false)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [view, setView]               = useState<'kanban' | 'list'>('kanban')

  const { data, isLoading } = useQuery({
    queryKey: ['leads-pipeline'],
    queryFn:  () => api.get('/leads/pipeline').then(r => r.data),
  })

  const moveStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/leads/${id}/stage`, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
    },
    onError: () => notify.error('Failed to update stage'),
  })

  const convertLead = useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/convert`),
    onSuccess: () => {
      notify.success('Lead converted to member!')
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
      setSelectedLead(null)
    },
    onError: (e: any) => notify.error('Conversion failed', e.response?.data?.error?.message),
  })

  const deleteLead = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => {
      notify.success('Lead deleted')
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
    },
    onError: () => notify.error('Failed to delete lead'),
  })

  // Pipeline data: { new: [...], contacted: [...], ... }
  const pipeline = data?.data ?? {}

  const totalLeads = STAGES.reduce((sum, s) => {
    const arr = pipeline[s.key]
    return sum + (Array.isArray(arr) ? arr.length : (arr?.leads?.length ?? 0))
  }, 0)

  function getLeads(stageKey: string): any[] {
    const val = pipeline[stageKey]
    if (Array.isArray(val)) return val
    if (val?.leads) return val.leads
    return []
  }

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalLeads} leads in pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              List
            </button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Lead
          </Button>
        </div>
      </div>

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {STAGES.map(stage => {
            const leads = getLeads(stage.key)
            return (
              <div key={stage.key} className="flex-shrink-0 w-72 space-y-3">
                {/* Column header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{stage.label}</span>
                    <Badge variant="outline" className={stage.color}>
                      {leads.length}
                    </Badge>
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {isLoading
                    ? Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-xl" />
                      ))
                    : leads.map((lead: any) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          stage={stage}
                          nextStage={NEXT_STAGE[stage.key]}
                          onOpen={() => setSelectedLead(lead)}
                          onMove={(s: string) => moveStage.mutate({ id: lead.id, stage: s })}
                          onConvert={() => convertLead.mutate(lead.id)}
                          onDelete={() => deleteLead.mutate(lead.id)}
                        />
                      ))
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <LeadListView
          pipeline={pipeline}
          isLoading={isLoading}
          onOpen={setSelectedLead}
          onMove={(id: string, stage: string) => moveStage.mutate({ id, stage })}
          onConvert={(id: string) => convertLead.mutate(id)}
          onDelete={(id: string) => deleteLead.mutate(id)}
          getLeads={getLeads}
        />
      )}

      {/* Create lead dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Add Lead</DialogTitle></DialogHeader>
          <LeadForm onSuccess={() => {
            setCreateOpen(false)
            qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
          }} />
        </DialogContent>
      </Dialog>

      {/* Lead detail sheet */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onMove={(stage) => moveStage.mutate({ id: selectedLead.id, stage })}
          onConvert={() => convertLead.mutate(selectedLead.id)}
          onDelete={() => { deleteLead.mutate(selectedLead.id); setSelectedLead(null) }}
          isConverting={convertLead.isPending}
        />
      )}
    </div>
  )
}

// ── Lead card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, stage, nextStage, onOpen, onMove, onConvert, onDelete }: any) {
  return (
    <div
      className="rounded-xl border bg-card p-3 space-y-2 cursor-pointer hover:border-primary/50 transition-colors group"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium leading-tight">
            {lead.first_name} {lead.last_name}
          </p>
          {lead.source && (
            <p className="text-xs text-muted-foreground capitalize">{lead.source.replace('_', ' ')}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
            {nextStage && (
              <DropdownMenuItem onClick={() => onMove(nextStage)}>
                <ArrowRight className="h-3 w-3 mr-2" />
                Move to {STAGES.find(s => s.key === nextStage)?.label}
              </DropdownMenuItem>
            )}
            {stage.key !== 'converted' && stage.key !== 'lost' && (
              <DropdownMenuItem onClick={onConvert}>
                Convert to Member
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1">
        {lead.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>{lead.phone}</span>
          </div>
        )}
        {lead.trial_date && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{lead.trial_date}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {lead.created_at
          ? formatDistanceToNow(parseISO(lead.created_at), { addSuffix: true })
          : ''}
      </p>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────
function LeadListView({ pipeline, isLoading, onOpen, onMove, onConvert, onDelete, getLeads }: any) {
  const allLeads = STAGES.flatMap(s => getLeads(s.key).map((l: any) => ({ ...l, _stage: s })))

  if (isLoading) return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
    </div>
  )

  if (allLeads.length === 0) return (
    <div className="text-center py-16 text-muted-foreground text-sm">
      No leads yet. Add your first lead to get started.
    </div>
  )

  return (
    <div className="rounded-xl border divide-y">
      {allLeads.map((lead: any) => (
        <div
          key={lead.id}
          className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => onOpen(lead)}
        >
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-medium">{lead.first_name} {lead.last_name}</p>
              <p className="text-xs text-muted-foreground">{lead.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={lead._stage.color}>
              {lead._stage.label}
            </Badge>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {lead.created_at ? formatDistanceToNow(parseISO(lead.created_at), { addSuffix: true }) : ''}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onConvert(lead.id)}>
                  Convert to Member
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(lead.id)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  )
}
