'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { notify } from '@/lib/toast'
import {
  Mail, Phone, Calendar, Tag, MessageSquare,
  UserCheck, Trash2, ArrowRight,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

const STAGES = [
  { key: 'new',          label: 'New'          },
  { key: 'contacted',    label: 'Contacted'    },
  { key: 'trial_booked', label: 'Trial Booked' },
  { key: 'trial_done',   label: 'Trial Done'   },
  { key: 'converted',    label: 'Converted'    },
  { key: 'lost',         label: 'Lost'         },
]

const STAGE_COLORS: Record<string, string> = {
  new:          'bg-slate-500/10  text-slate-400',
  contacted:    'bg-blue-500/10   text-blue-400',
  trial_booked: 'bg-yellow-500/10 text-yellow-400',
  trial_done:   'bg-purple-500/10 text-purple-400',
  converted:    'bg-green-500/10  text-green-400',
  lost:         'bg-red-500/10    text-red-400',
}

interface Props {
  lead:        any
  onClose:     () => void
  onMove:      (stage: string) => void
  onConvert:   () => void
  onDelete:    () => void
  isConverting: boolean
}

export function LeadDetail({ lead, onClose, onMove, onConvert, onDelete, isConverting }: Props) {
  const qc = useQueryClient()
  const [note, setNote]       = useState('')
  const [delConfirm, setDelConfirm] = useState(false)

  const addNote = useMutation({
    mutationFn: () => api.post(`/leads/${lead.id}/notes`, { content: note }),
    onSuccess: () => {
      notify.success('Note added')
      setNote('')
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
    },
    onError: () => notify.error('Failed to add note'),
  })

  const infoRows = [
    { icon: Mail,     label: 'Email',      value: lead.email    },
    { icon: Phone,    label: 'Phone',      value: lead.phone    },
    { icon: Calendar, label: 'Trial Date', value: lead.trial_date ? format(parseISO(lead.trial_date), 'dd MMM yyyy') : null },
    { icon: Tag,      label: 'Source',     value: lead.source?.replace('_', ' ') },
    { icon: Tag,      label: 'Interest',   value: lead.interest },
  ].filter(r => r.value)

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle>{lead.first_name} {lead.last_name}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Added {lead.created_at ? format(parseISO(lead.created_at), 'dd MMM yyyy') : ''}
              </p>
            </div>
            <Badge className={STAGE_COLORS[lead.stage] ?? ''} variant="outline">
              {STAGES.find(s => s.key === lead.stage)?.label ?? lead.stage}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Info */}
          <div className="space-y-2">
            {infoRows.map(r => (
              <div key={r.label} className="flex items-center gap-3 text-sm">
                <r.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground w-20 shrink-0">{r.label}</span>
                <span className="font-medium capitalize">{r.value}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Move stage */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Move Stage</p>
            <div className="flex gap-2">
              <Select value={lead.stage} onValueChange={onMove}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Notes
            </p>
            {lead.notes && (
              <div className="p-3 rounded-lg bg-accent/50 text-sm text-muted-foreground">
                {lead.notes}
              </div>
            )}
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note…"
              rows={2}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!note.trim() || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              {addNote.isPending ? 'Saving…' : 'Add Note'}
            </Button>
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            {lead.stage !== 'converted' && (
              <Button
                className="w-full"
                onClick={onConvert}
                disabled={isConverting}
              >
                <UserCheck className="h-4 w-4 mr-2" />
                {isConverting ? 'Converting…' : 'Convert to Member'}
              </Button>
            )}

            {!delConfirm ? (
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setDelConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Lead
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDelConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" className="flex-1" onClick={onDelete}>
                  Confirm Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
