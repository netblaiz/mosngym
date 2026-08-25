'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notify } from '@/lib/toast'
import { Plug, CheckCircle2, XCircle, AlertCircle, Trash2, TestTube } from 'lucide-react'

const PROVIDERS = [
  {
    key:    'paystack',
    label:  'Paystack',
    desc:   'Accept payments from Nigerian members via card, bank transfer, USSD',
    fields: [{ name: 'secret_key', label: 'Secret Key', placeholder: 'sk_live_...' }],
    recommended: true,
  },
  {
    key:    'flutterwave',
    label:  'Flutterwave',
    desc:   'Multi-currency payments across Africa',
    fields: [{ name: 'secret_key', label: 'Secret Key', placeholder: 'FLWSECK_...' }],
  },
  {
    key:    'stripe',
    label:  'Stripe',
    desc:   'International card payments',
    fields: [
      { name: 'secret_key',      label: 'Secret Key',      placeholder: 'sk_live_...' },
      { name: 'webhook_secret',  label: 'Webhook Secret',  placeholder: 'whsec_...'   },
    ],
  },
  {
    key:    'twilio',
    label:  'Twilio',
    desc:   'SMS notifications to members',
    fields: [
      { name: 'account_sid', label: 'Account SID', placeholder: 'AC...' },
      { name: 'auth_token',  label: 'Auth Token',  placeholder: ''       },
      { name: 'from_number', label: 'From Number', placeholder: '+1...'  },
    ],
  },
  {
    key:    'sendgrid',
    label:  'SendGrid',
    desc:   'Transactional email (receipts, welcome emails, reminders)',
    fields: [{ name: 'api_key', label: 'API Key', placeholder: 'SG...' }],
  },
]

const STATUS_STYLES: Record<string, string> = {
  connected:    'bg-green-500/10 text-green-400 border-green-500/20',
  disconnected: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  error:        'bg-red-500/10   text-red-400   border-red-500/20',
}

export function IntegrationsSettings() {
  const qc = useQueryClient()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [testing, setTesting]       = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['gym-integrations'],
    queryFn:  () => api.get('/gym/integrations').then(r => r.data.data ?? r.data),
  })

  const integrations: any[] = Array.isArray(data) ? data : []

  const getStatus = (key: string) =>
    integrations.find(i => i.provider === key)

  const connect = useMutation({
    mutationFn: ({ provider, credentials }: { provider: string; credentials: Record<string, string> }) =>
      api.post('/gym/integrations/connect', { provider, credentials }),
    onSuccess: (_, { provider }) => {
      notify.success(`${provider} connected`)
      qc.invalidateQueries({ queryKey: ['gym-integrations'] })
      setConnecting(null)
    },
    onError: (e: any) => notify.error('Connection failed', e.response?.data?.error?.message),
  })

  const disconnect = useMutation({
    mutationFn: (provider: string) => api.delete(`/gym/integrations/${provider}`),
    onSuccess: (_, provider) => {
      notify.success(`${provider} disconnected`)
      qc.invalidateQueries({ queryKey: ['gym-integrations'] })
    },
    onError: () => notify.error('Failed to disconnect'),
  })

  const testConnection = useMutation({
    mutationFn: (provider: string) => api.post(`/gym/integrations/${provider}/test`),
    onSuccess: (res, provider) => {
      const ok = res.data?.data?.success ?? res.data?.success
      if (ok) notify.success(`${provider} connection is working`)
      else notify.error(`${provider} test failed`, res.data?.data?.message)
      qc.invalidateQueries({ queryKey: ['gym-integrations'] })
      setTesting(null)
    },
    onError: () => { notify.error('Test failed'); setTesting(null) },
  })

  if (isLoading) return (
    <div className="space-y-3 max-w-2xl">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
    </div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Connect payment providers, SMS, and email services to automate billing and communications.
      </p>

      {PROVIDERS.map(provider => {
        const status = getStatus(provider.key)
        const isConnected = status?.status === 'connected'

        return (
          <div key={provider.key} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Plug className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{provider.label}</p>
                    {provider.recommended && (
                      <Badge variant="secondary" className="text-xs">Recommended</Badge>
                    )}
                    {status && (
                      <Badge variant="outline" className={STATUS_STYLES[status.status] ?? ''}>
                        {status.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{provider.desc}</p>
                  {status?.error_message && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {status.error_message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                {isConnected && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => { setTesting(provider.key); testConnection.mutate(provider.key) }}
                      disabled={testConnection.isPending && testing === provider.key}
                    >
                      <TestTube className="h-3 w-3 mr-1" />
                      {testConnection.isPending && testing === provider.key ? 'Testing…' : 'Test'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 text-destructive"
                      onClick={() => disconnect.mutate(provider.key)}
                      disabled={disconnect.isPending}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Disconnect
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  className="text-xs h-7"
                  variant={isConnected ? 'outline' : 'default'}
                  onClick={() => setConnecting(provider.key)}
                >
                  {isConnected ? 'Update Keys' : 'Connect'}
                </Button>
              </div>
            </div>

            {/* Last synced */}
            {status?.last_synced_at && (
              <p className="text-xs text-muted-foreground">
                Last tested: {new Date(status.last_synced_at).toLocaleString()}
              </p>
            )}
          </div>
        )
      })}

      {/* Connect dialog */}
      {connecting && (
        <ConnectDialog
          provider={PROVIDERS.find(p => p.key === connecting)!}
          onClose={() => setConnecting(null)}
          onConnect={(credentials) => connect.mutate({ provider: connecting, credentials })}
          isPending={connect.isPending}
        />
      )}
    </div>
  )
}

// ── Connect dialog ────────────────────────────────────────────────────────────
function ConnectDialog({ provider, onClose, onConnect, isPending }: {
  provider:  typeof PROVIDERS[0]
  onClose:   () => void
  onConnect: (credentials: Record<string, string>) => void
  isPending: boolean
}) {
  const { register, handleSubmit } = useForm<Record<string, string>>()

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Connect {provider.label}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onConnect)} className="space-y-4 pt-2">
          {provider.fields.map(field => (
            <div key={field.name} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Input
                {...register(field.name)}
                type="password"
                placeholder={field.placeholder}
                autoComplete="off"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Keys are stored securely and never returned in API responses.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Connecting…' : `Connect ${provider.label}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
