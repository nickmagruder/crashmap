'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFilterContext } from '@/context/FilterContext'
import { decodeFilterParams, encodeFilterParams } from '@/lib/filterUrlState'

/**
 * Invisible bridge component that keeps URL query params and FilterContext in sync.
 *
 * Effect 1 (mount only): reads current URL params → dispatches INIT_FROM_URL.
 * Effect 2 (every filterState change): encodes current filter state → router.replace.
 *
 * skipFirstSyncRef prevents Effect 2 from overwriting the incoming URL on the
 * first render (before Effect 1's dispatch has been processed by the reducer).
 *
 * Must be rendered inside <FilterProvider> and wrapped in <Suspense> at the
 * call site (required by useSearchParams in the Next.js App Router).
 */
export function FilterUrlSync() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { filterState, dispatch } = useFilterContext()

  // Skip the first firing of Effect 2, which runs against initialState before
  // INIT_FROM_URL has been processed. Set to true initially, consumed once.
  const skipFirstSyncRef = useRef(true)

  // Effect 1: URL → state (mount only)
  useEffect(() => {
    dispatch({ type: 'INIT_FROM_URL', payload: decodeFilterParams(searchParams) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Effect 2: state → URL (runs after every filterState change)
  useEffect(() => {
    if (skipFirstSyncRef.current) {
      skipFirstSyncRef.current = false
      return
    }
    const params = encodeFilterParams(filterState)
    const search = params.toString()
    router.replace(search ? `?${search}` : '/', { scroll: false })
  }, [filterState, router])

  return null
}
