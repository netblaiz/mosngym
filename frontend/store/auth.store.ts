import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { api, setTokens, clearTokens } from '@/lib/api'

export interface AuthUser {
  userId:      string
  gymId:       string
  staffId?:    string
  memberId?:   string
  role?:       string
  permissions: string[]
  gym: {
    name:     string
    slug:     string
    logoUrl?: string
  }
}

interface AuthState {
  user:           AuthUser | null
  isLoading:      boolean
  _hasHydrated:   boolean

  setHasHydrated: (val: boolean) => void
  login:          (email: string, password: string, gymSlug: string) => Promise<void>
  logout:         () => Promise<void>
  fetchMe:        () => Promise<void>
  hasPermission:  (permission: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:         null,
      isLoading:    false,
      _hasHydrated: false,

      setHasHydrated: (val) => set({ _hasHydrated: val }),

      login: async (email, password, gymSlug) => {
        set({ isLoading: true })
        try {
          const { data } = await api.post('/auth/login', { email, password, gymSlug })
          setTokens(data.data.accessToken, data.data.refreshToken)
          await get().fetchMe()
        } finally {
          set({ isLoading: false })
        }
      },

      logout: async () => {
        try {
          const refreshToken = localStorage.getItem('gym_refresh_token')
          if (refreshToken) await api.post('/auth/logout', { refreshToken })
        } catch { /* ignore */ } finally {
          clearTokens()
          set({ user: null })
          window.location.href = '/login'
        }
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get('/auth/me')
          const d = data.data
          set({
            user: {
              userId:      d.userId,
              gymId:       d.gymId,
              staffId:     d.staffId,
              memberId:    d.memberId,
              role:        d.role,
              permissions: d.permissions ?? [],
              gym: {
                name:    d.gym?.name ?? '',
                slug:    d.gym?.slug ?? '',
                logoUrl: d.gym?.logo_url,
              },
            },
          })
        } catch {
          clearTokens()
          set({ user: null })
        }
      },

      hasPermission: (permission) => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'owner') return true
        return user.permissions.includes(permission)
      },
    }),
    {
      name:    'gym-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
