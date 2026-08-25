'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools }  from '@tanstack/react-query-devtools'
import { ThemeProvider }       from 'next-themes'
import { queryClient }         from '@/lib/query-client'
import { Toaster }             from '@/components/ui/toaster'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
