'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoPanelContent } from './InfoPanelContent'

interface InfoOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export function InfoOverlay({ isOpen, onClose }: InfoOverlayProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col bg-background md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="About"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">💥CrashMap</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <InfoPanelContent />
      </div>
    </div>
  )
}
