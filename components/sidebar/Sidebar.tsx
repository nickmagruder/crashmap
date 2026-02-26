'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/filters/ModeToggle'
import { SeverityFilter } from '@/components/filters/SeverityFilter'
import { DateFilter } from '@/components/filters/DateFilter'
import { GeographicFilter } from '@/components/filters/GeographicFilter'
import { ExportButton } from '@/components/export/ExportButton'
import { useFilterContext } from '@/context/FilterContext'

interface SidebarProps {
  onClose: () => void
}

function FilterContent() {
  const { filterState } = useFilterContext()
  return (
    <div className="space-y-6 px-4 py-4">
      {filterState.totalCount !== null && (
        <p className="text-sm text-muted-foreground">
          {filterState.totalCount.toLocaleString()} crashes
        </p>
      )}
      <ModeToggle />
      <DateFilter />
      <SeverityFilter />
      <GeographicFilter />
      <ExportButton variant="full" />
    </div>
  )
}

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <div className="hidden md:flex flex-col w-80 flex-shrink-0 border-l bg-background h-full overflow-hidden">
      <div className="flex items-center gap-1 border-b px-4 py-3">
        <h2 className="text-base font-semibold flex-1">Filters</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close filters">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FilterContent />
      </div>
    </div>
  )
}
