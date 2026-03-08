'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/filters/ModeToggle'
import { SeverityFilter } from '@/components/filters/SeverityFilter'
import { DateFilter } from '@/components/filters/DateFilter'
import { GeographicFilter } from '@/components/filters/GeographicFilter'
import { ExportButton } from '@/components/export/ExportButton'
import { useFilterContext } from '@/context/FilterContext'

interface FilterOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export function FilterOverlay({ isOpen, onClose }: FilterOverlayProps) {
  const { filterState } = useFilterContext()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col bg-background md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-overlay-title"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 id="filter-overlay-title" className="text-base font-semibold">
            Filters
          </h2>
          {filterState.totalCount !== null && (
            <p className="text-xs text-muted-foreground">
              {filterState.totalCount.toLocaleString()} crashes
            </p>
          )}
        </div>
        <Button
          ref={closeButtonRef}
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close filters"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <ModeToggle />
        <DateFilter />
        <SeverityFilter />
        <GeographicFilter />
      </div>

      <div className="border-t px-4 py-3">
        <ExportButton variant="full" />
      </div>
    </div>
  )
}
