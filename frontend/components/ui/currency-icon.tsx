'use client'

// frontend/components/ui/currency-icon.tsx
// Renders the gym's currency symbol as a styled icon
// — drop-in replacement for the static DollarSign icon

import { getCurrencySymbol } from '@/lib/utils'

interface Props {
  currency?: string
  className?: string
  style?:    React.CSSProperties
}

export function CurrencyIcon({ currency, className = 'h-4 w-4', style }: Props) {
  const symbol = getCurrencySymbol(currency)

  return (
    <span
      className={`inline-flex items-center justify-center font-bold leading-none ${className}`}
      style={{ fontSize: '0.85em', ...style }}
    >
      {symbol}
    </span>
  )
}
