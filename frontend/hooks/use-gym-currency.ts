'use client'

// frontend/hooks/use-gym-currency.ts
// Use this hook in your layout to load and cache the gym currency once.
// Then all formatCurrency() calls across the app automatically use the right symbol.

import { useEffect } from 'react'
import { useQuery }  from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { setGymCurrency, getCurrencySymbol } from '@/lib/utils'

export function useGymCurrency() {
  const { data } = useQuery({
    queryKey: ['gym-profile'],
    queryFn:  () => api.get('/gym').then(r => r.data.data),
    staleTime: 10 * 60 * 1000, // 10 min
  })

  useEffect(() => {
    if (data?.currency) {
      setGymCurrency(data.currency)
    }
  }, [data?.currency])

  return {
    currency:       data?.currency ?? 'NGN',
    currencySymbol: getCurrencySymbol(data?.currency),
  }
}
