'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { useFilterContext, type SeverityBucket } from '@/context/FilterContext'
import { STANDARD_COLORS, ACCESSIBLE_COLORS } from '@/lib/crashColors'

const BUCKETS: SeverityBucket[] = ['Death', 'Major Injury', 'Minor Injury']

export function SeverityFilter() {
  const { filterState, dispatch } = useFilterContext()
  const colors = filterState.accessibleColors ? ACCESSIBLE_COLORS : STANDARD_COLORS

  function toggleBucket(bucket: SeverityBucket, checked: boolean) {
    const next = checked
      ? [...filterState.severity, bucket]
      : filterState.severity.filter((b) => b !== bucket)
    dispatch({ type: 'SET_SEVERITY', payload: next })
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Severity</p>

      <div className="space-y-2">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className="flex items-center gap-2">
            <Checkbox
              id={`severity-${bucket}`}
              checked={filterState.severity.includes(bucket)}
              onCheckedChange={(checked) => toggleBucket(bucket, checked === true)}
            />
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[bucket] }}
              aria-hidden="true"
            />
            <label htmlFor={`severity-${bucket}`} className="cursor-pointer text-sm leading-none">
              {bucket}
            </label>
          </div>
        ))}
      </div>

      <div className="border-t pt-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="severity-none"
            checked={filterState.includeNoInjury}
            onCheckedChange={() => dispatch({ type: 'TOGGLE_NO_INJURY' })}
          />
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colors['None'] }}
            aria-hidden="true"
          />
          <label htmlFor="severity-none" className="cursor-pointer text-sm leading-none">
            No Injury / Unknown
          </label>
        </div>
      </div>
    </div>
  )
}
