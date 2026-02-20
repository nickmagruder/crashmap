'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { useFilterContext, type SeverityBucket } from '@/context/FilterContext'

// Colors match the circle layer styling in CrashLayer.tsx.
const SEVERITY_COLORS: Record<SeverityBucket | 'None', string> = {
  Death: '#B71C1C',
  'Major Injury': '#E65100',
  'Minor Injury': '#F9A825',
  None: '#C5E1A5',
}

const BUCKETS: SeverityBucket[] = ['Death', 'Major Injury', 'Minor Injury']

export function SeverityFilter() {
  const { filterState, dispatch } = useFilterContext()

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
              style={{ backgroundColor: SEVERITY_COLORS[bucket] }}
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
            style={{ backgroundColor: SEVERITY_COLORS['None'] }}
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
