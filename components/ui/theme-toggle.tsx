'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="outline"
      size="icon"
      className={className}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="size-4 dark:hidden" suppressHydrationWarning />
      <Moon className="size-4 hidden dark:block" suppressHydrationWarning />
    </Button>
  )
}
