'use client'

import { Badge } from '@/components/ui/badge'

interface SummaryBarProps {
  crashCount?: number | null
  activeFilters?: string[]
}

export function SummaryBar({ crashCount = null, activeFilters = [] }: SummaryBarProps) {
  const countLabel = crashCount === null ? '—' : crashCount.toLocaleString()

  return (
    <div
      className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background/90 px-4 py-2 shadow-md backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Summary"
    >
      <span className="text-sm font-medium tabular-nums whitespace-nowrap">
        {countLabel} crashes
      </span>

      {activeFilters.length > 0 && (
        <>
          <div className="h-4 w-px bg-border" aria-hidden="true" />
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map((filter) => (
              <Badge key={filter} variant="secondary" className="text-xs">
                {filter}
              </Badge>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
