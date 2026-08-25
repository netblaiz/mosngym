'use client'

import { useEffect }      from 'react'
import { useRouter }      from 'next/navigation'
import { Sidebar }        from '@/components/layout/sidebar'
import { Topbar }         from '@/components/layout/topbar'
import { useAuthStore }   from '@/store/auth.store'
import { getAccessToken } from '@/lib/api'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router       = useRouter()
  const user         = useAuthStore(s => s.user)
  const fetchMe      = useAuthStore(s => s.fetchMe)
  const _hasHydrated = useAuthStore(s => s._hasHydrated)

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage
    if (!_hasHydrated) return

    const token = getAccessToken()

    if (!token) {
      router.replace('/login')
      return
    }

    // Token exists but no user in store — fetch from API
    if (!user) {
      fetchMe().then(() => {
        // fetchMe sets user or clears tokens on failure
        // the effect will re-run because _hasHydrated or user changes
      })
    }
  }, [_hasHydrated])

  useEffect(() => {
    if (!_hasHydrated) return
    const token = getAccessToken()
    if (_hasHydrated && !token && !user) {
      router.replace('/login')
    }
  }, [_hasHydrated, user])

  // Still hydrating — show nothing to prevent flash
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Hydrated but no user — redirect happening
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
