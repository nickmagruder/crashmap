'use client'

import { Download, Loader2 } from 'lucide-react'
import { useLazyQuery } from '@apollo/client/react'
import { Button } from '@/components/ui/button'
import { useFilterContext, toCrashFilter } from '@/context/FilterContext'
import { GET_CRASHES_EXPORT, type GetCrashesExportQuery } from '@/lib/graphql/queries'
import { generateCsv, downloadCsv } from '@/lib/csv-export'
import type { FilterState } from '@/context/FilterContext'

function buildFilename(filterState: FilterState): string {
  const parts: string[] = ['crashmap']

  if (filterState.state) {
    parts.push(filterState.state.toLowerCase().replace(/\s+/g, '-'))
  }
  if (filterState.county) {
    parts.push(filterState.county.toLowerCase().replace(/\s+/g, '-'))
  }
  if (filterState.city) {
    parts.push(filterState.city.toLowerCase().replace(/\s+/g, '-'))
  }

  if (filterState.dateFilter.type === 'year') {
    parts.push(String(filterState.dateFilter.year))
  } else if (filterState.dateFilter.type === 'range') {
    parts.push(filterState.dateFilter.startDate.slice(0, 10))
    parts.push(filterState.dateFilter.endDate.slice(0, 10))
  }

  parts.push(new Date().toISOString().slice(0, 10))
  return parts.join('-') + '.csv'
}

interface ExportButtonProps {
  variant?: 'icon' | 'full'
}

export function ExportButton({ variant = 'icon' }: ExportButtonProps) {
  const { filterState } = useFilterContext()
  const [fetchCrashes, { loading }] = useLazyQuery<GetCrashesExportQuery>(GET_CRASHES_EXPORT)

  async function handleExport() {
    const { data } = await fetchCrashes({
      variables: { filter: toCrashFilter(filterState), limit: 5000 },
    })
    if (!data) return

    const csv = generateCsv(data.crashes.items)
    downloadCsv(csv, buildFilename(filterState))
  }

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={loading}
        className="w-full gap-2"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {loading ? 'Exporting…' : 'Export CSV'}
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleExport}
      disabled={loading}
      aria-label="Export CSV"
      title="Export CSV"
    >
      {loading ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
    </Button>
  )
}
