'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Button } from '@/components/ui/button'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <MapContainer />

      {/* Sidebar toggle button — desktop only */}
      <div className="absolute top-4 right-4 z-10 hidden md:block">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  )
}
