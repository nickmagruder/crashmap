'use client'

import { Pin, PinOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { InfoPanelContent } from './InfoPanelContent'

interface InfoSidePanelProps {
  pinned: boolean
  onClose: () => void
  onTogglePin: () => void
  isOpen?: boolean
}

export function InfoSidePanel({ pinned, onClose, onTogglePin, isOpen }: InfoSidePanelProps) {
  if (pinned) {
    return (
      <div className="hidden md:flex flex-col w-80 flex-shrink-0 border-r bg-background h-full overflow-hidden">
        <div className="flex items-center gap-1 border-b px-4 py-3">
          <h2 className="text-base font-semibold flex-1">💥CrashMap</h2>
          <Button variant="ghost" size="icon" onClick={onTogglePin} aria-label="Unpin panel">
            <PinOff className="size-4" />
          </Button>
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

  return (
    <Sheet open={isOpen ?? false} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        className="w-80 sm:max-w-80 flex flex-col gap-0"
        showCloseButton={false}
      >
        <div className="flex items-center gap-1 border-b px-4 py-3">
          <SheetTitle className="flex-1">💥CrashMap</SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onTogglePin}
            aria-label="Pin panel"
            className="hidden md:flex"
          >
            <Pin className="size-4" />
          </Button>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X className="size-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <InfoPanelContent />
        </div>
      </SheetContent>
    </Sheet>
  )
}
