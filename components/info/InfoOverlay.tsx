'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoPanelContent } from './InfoPanelContent'
import { SupportPanelContent } from './SupportPanelContent'
import type { InfoPanelView } from './InfoSidePanel'

interface InfoOverlayProps {
  isOpen: boolean
  onClose: () => void
  view?: InfoPanelView
  onSwitchView?: (view: InfoPanelView) => void
}

export function InfoOverlay({ isOpen, onClose, view = 'info', onSwitchView }: InfoOverlayProps) {
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
      aria-labelledby="info-overlay-title"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="info-overlay-title" className="text-base font-semibold">
          <span aria-hidden="true">💥</span>CrashMap
        </h2>
        <Button
          ref={closeButtonRef}
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {view === 'support' ? (
          <SupportPanelContent
            onSwitchView={onSwitchView ? () => onSwitchView('info') : undefined}
          />
        ) : (
          <InfoPanelContent
            onSwitchView={onSwitchView ? () => onSwitchView('support') : undefined}
          />
        )}
      </div>
    </div>
  )
}
