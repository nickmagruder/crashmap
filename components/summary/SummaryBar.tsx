'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SummaryBarProps {
  activeFilters?: string[]
  isLoading?: boolean
  actions?: React.ReactNode
}

export function SummaryBar({ activeFilters = [], isLoading = false, actions }: SummaryBarProps) {
  return (
    <div
      // Mobile: fixed strip flush against the viewport bottom, full width, minimal height.
      // Desktop: floating centered pill above the bottom edge of the map area.
      className="fixed bottom-0 left-0 right-0 z-10 flex items-center gap-2 border-t bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-sm md:absolute md:bottom-3 md:left-1/2 md:right-auto md:w-auto md:-translate-x-1/2 md:rounded-md md:border md:px-4 md:py-1 md:shadow-md"
      role="status"
      aria-live="polite"
      aria-label="Summary"
    >
      {isLoading && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.map((filter) => (
            <Badge key={filter} variant="secondary" className="text-xs">
              {filter}
            </Badge>
          ))}
        </div>
      )}

      {/* Actions (e.g. export button) — desktop only */}
      {actions && (
        <div className="hidden md:flex items-center gap-1 ml-auto">
          <div className="h-4 w-px bg-border" aria-hidden="true" />
          {actions}
        </div>
      )}
    </div>
  )
}
