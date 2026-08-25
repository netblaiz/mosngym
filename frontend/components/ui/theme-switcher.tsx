'use client'

import { useThemeStore, applyTheme } from '@/store/theme.store'
import { THEMES } from '@/lib/themes'
import { useEffect } from 'react'
import { Palette, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function ThemeSwitcher() {
  const { themeId, setTheme } = useThemeStore()

  // Apply theme on mount (rehydration)
  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-8 w-8 rounded-xl flex items-center justify-center transition-colors hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-active, #60a5fa)' }}
          title="Switch theme"
        >
          <Palette className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-64 p-3 space-y-1"
        style={{
          background:   'var(--sidebar-bg, #0f172a)',
          border:       '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider px-1 pb-2"
          style={{ color: 'var(--sidebar-active, #60a5fa)' }}>
          Choose Theme
        </p>

        {THEMES.map(theme => (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
              themeId === theme.id ? 'opacity-100' : 'opacity-70 hover:opacity-100'
            )}
            style={{
              background: themeId === theme.id
                ? 'rgba(255,255,255,0.08)'
                : 'transparent',
              border: themeId === theme.id
                ? '1px solid rgba(255,255,255,0.10)'
                : '1px solid transparent',
            }}
          >
            {/* Color swatch */}
            <div className="flex gap-0.5 shrink-0">
              {theme.preview.map((color, i) => (
                <div
                  key={i}
                  className="rounded-sm"
                  style={{
                    width:      i === 0 ? 18 : 8,
                    height:     18,
                    background: color,
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === theme.preview.length - 1 ? '0 4px 4px 0' : '0',
                  }}
                />
              ))}
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{theme.name}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {theme.description}
              </p>
            </div>

            {/* Active check */}
            {themeId === theme.id && (
              <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--sidebar-active, #60a5fa)' }} />
            )}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
