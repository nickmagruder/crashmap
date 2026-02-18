import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

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
        <div className="px-4 pb-4">
          <p className="text-sm text-muted-foreground">Filter controls coming soon.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
