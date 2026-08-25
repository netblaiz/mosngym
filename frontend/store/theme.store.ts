// store/theme.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeId } from '@/lib/themes'

interface ThemeStore {
  themeId:  ThemeId
  setTheme: (id: ThemeId) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeId: 'dark',
      setTheme: (id) => {
        set({ themeId: id })
        applyTheme(id)
      },
    }),
    { name: 'gym-theme' }
  )
)

export function applyTheme(id: ThemeId) {
  const root = document.documentElement

  // Set data-theme on <html> — CSS selectors in globals.css handle the rest
  root.setAttribute('data-theme', id)

  // Toggle dark/light class for shadcn compatibility
  if (id === 'light') {
    root.classList.remove('dark')
    root.classList.add('light')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }

  // Store accent gradient as CSS var for sidebar/topbar use
  const gradients: Record<ThemeId, string> = {
    dark:     'linear-gradient(135deg, #3b82f6, #6366f1)',
    light:    'linear-gradient(135deg, #3b82f6, #6366f1)',
    vibrant:  'linear-gradient(135deg, #8b5cf6, #ec4899)',
    midnight: 'linear-gradient(135deg, #1e3a8a, #06b6d4)',
    forest:   'linear-gradient(135deg, #14532d, #10b981)',
  }

  const sidebarBg: Record<ThemeId, string> = {
    dark:     '#0b1120',
    light:    '#f8fafc',
    vibrant:  '#130c26',
    midnight: '#080f1f',
    forest:   '#071210',
  }

  const sidebarActive: Record<ThemeId, string> = {
    dark:     '#60a5fa',
    light:    '#2563eb',
    vibrant:  '#a78bfa',
    midnight: '#22d3ee',
    forest:   '#34d399',
  }

  const sidebarActiveBg: Record<ThemeId, string> = {
    dark:     'rgba(59,130,246,0.12)',
    light:    'rgba(37,99,235,0.08)',
    vibrant:  'rgba(139,92,246,0.18)',
    midnight: 'rgba(6,182,212,0.12)',
    forest:   'rgba(16,185,129,0.12)',
  }

  root.style.setProperty('--accent-grad',       gradients[id])
  root.style.setProperty('--sidebar-bg',         sidebarBg[id])
  root.style.setProperty('--sidebar-active',     sidebarActive[id])
  root.style.setProperty('--sidebar-active-bg',  sidebarActiveBg[id])
  root.style.setProperty('--sidebar-border',     id === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)')
}
