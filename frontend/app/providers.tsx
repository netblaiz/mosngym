'use client'

import { QueryClientProvider }            from '@tanstack/react-query'
import { ReactQueryDevtools }             from '@tanstack/react-query-devtools'
import { ThemeProvider }                  from 'next-themes'
import { queryClient }                    from '@/lib/query-client'
import { Toaster }                        from 'sonner'
import { useThemeStore, applyTheme }      from '@/store/theme.store'
import { useEffect }                      from 'react'

// Applies the saved gym theme on every mount/hydration
function ThemeInitializer() {
  const { themeId } = useThemeStore()
  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        <ThemeInitializer />
        {children}
        <Toaster richColors position="top-right" />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}