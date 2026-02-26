'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoPanelContent } from './InfoPanelContent'
import { SupportPanelContent } from './SupportPanelContent'

export type InfoPanelView = 'info' | 'support'

interface InfoSidePanelProps {
  onClose: () => void
  view?: InfoPanelView
  onSwitchView?: (view: InfoPanelView) => void
}

const titles: Record<InfoPanelView, string> = {
  info: '💥CrashMap',
  support: '💥CrashMap',
}

function PanelBody({
  view,
  onSwitchView,
}: {
  view: InfoPanelView
  onSwitchView?: (view: InfoPanelView) => void
}) {
  return view === 'support' ? (
    <SupportPanelContent onSwitchView={onSwitchView ? () => onSwitchView('info') : undefined} />
  ) : (
    <InfoPanelContent onSwitchView={onSwitchView ? () => onSwitchView('support') : undefined} />
  )
}

export function InfoSidePanel({ onClose, view = 'info', onSwitchView }: InfoSidePanelProps) {
  return (
    <div className="hidden md:flex flex-col w-80 flex-shrink-0 border-r bg-background h-full overflow-hidden">
      <div className="flex items-center gap-1 border-b px-4 py-3">
        <h2 className="text-base font-semibold flex-1">{titles[view]}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <PanelBody view={view} onSwitchView={onSwitchView} />
      </div>
    </div>
  )
}
