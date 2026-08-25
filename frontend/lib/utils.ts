import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

// shadcn class merger
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatCurrency(amount: number | string, currency = 'NGN'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(num)
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

export function formatTimeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'h:mm a')
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active:     'bg-green-500/10 text-green-500',
    inactive:   'bg-slate-500/10 text-slate-500',
    frozen:     'bg-blue-500/10 text-blue-500',
    banned:     'bg-red-500/10 text-red-500',
    cancelled:  'bg-red-500/10 text-red-500',
    past_due:   'bg-amber-500/10 text-amber-500',
    expired:    'bg-slate-500/10 text-slate-500',
    confirmed:  'bg-green-500/10 text-green-500',
    waitlisted: 'bg-amber-500/10 text-amber-500',
    succeeded:  'bg-green-500/10 text-green-500',
    failed:     'bg-red-500/10 text-red-500',
    pending:    'bg-amber-500/10 text-amber-500',
    scheduled:  'bg-blue-500/10 text-blue-500',
    completed:  'bg-slate-500/10 text-slate-500',
    new:        'bg-blue-500/10 text-blue-500',
    contacted:  'bg-purple-500/10 text-purple-500',
    converted:  'bg-green-500/10 text-green-500',
    lost:       'bg-red-500/10 text-red-500',
  }
  return map[status] ?? 'bg-slate-500/10 text-slate-500'
}

export function getStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function getInitials(firstName: string, lastName?: string): string {
  return `${firstName[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
}

export function truncate(str: string, length = 40): string {
  return str.length > length ? `${str.slice(0, length)}...` : str
}

export function pluralize(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`
}
