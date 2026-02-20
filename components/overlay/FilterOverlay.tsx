'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/filters/ModeToggle'

interface FilterOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export function FilterOverlay({ isOpen, onClose }: FilterOverlayProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col bg-background md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Filters"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">Filters</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close filters">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <ModeToggle />
      </div>
    </div>
  )
}
