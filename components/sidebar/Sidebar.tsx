import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ModeToggle } from '@/components/filters/ModeToggle'
import { SeverityFilter } from '@/components/filters/SeverityFilter'
import { DateFilter } from '@/components/filters/DateFilter'
import { GeographicFilter } from '@/components/filters/GeographicFilter'
import { ExportButton } from '@/components/export/ExportButton'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-80 sm:max-w-80">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-4">
          <ModeToggle />
          <DateFilter />
          <SeverityFilter />
          <GeographicFilter />
          <ExportButton variant="full" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
