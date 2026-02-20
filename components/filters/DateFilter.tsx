'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFilterContext } from '@/context/FilterContext'

const CURRENT_YEAR = new Date().getFullYear()
const QUICK_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4]

export function DateFilter() {
  const { filterState, dispatch } = useFilterContext()
  const [open, setOpen] = useState(false)
  // Tracks the in-progress selection inside the popover before both dates are chosen.
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>()

  const selectedYear = filterState.dateFilter.type === 'year' ? filterState.dateFilter.year : null
  const selectedRange = filterState.dateFilter.type === 'range' ? filterState.dateFilter : null

  function handleYearClick(year: number) {
    if (selectedYear === year) {
      dispatch({ type: 'CLEAR_DATE' })
    } else {
      dispatch({ type: 'SET_DATE_YEAR', payload: year })
    }
  }

  function handleRangeSelect(range: DateRange | undefined) {
    setPendingRange(range)
    // Only commit once both ends are chosen.
    if (range?.from && range?.to) {
      dispatch({
        type: 'SET_DATE_RANGE',
        payload: {
          startDate: format(range.from, 'yyyy-MM-dd'),
          endDate: format(range.to, 'yyyy-MM-dd'),
        },
      })
      setOpen(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Discard incomplete selection when closing.
    if (!next) setPendingRange(undefined)
  }

  // Show the committed range as the Calendar's selection; fall back to in-progress selection.
  const calendarSelected: DateRange | undefined =
    pendingRange ??
    (selectedRange
      ? { from: parseISO(selectedRange.startDate), to: parseISO(selectedRange.endDate) }
      : undefined)

  const rangeLabel = selectedRange
    ? `${selectedRange.startDate} – ${selectedRange.endDate}`
    : 'Custom range…'

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Date</p>

      <div className="flex flex-wrap gap-2">
        {QUICK_YEARS.map((year) => (
          <Button
            key={year}
            variant={selectedYear === year ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleYearClick(year)}
            aria-pressed={selectedYear === year}
          >
            {year}
          </Button>
        ))}
      </div>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={selectedRange ? 'default' : 'outline'}
            size="sm"
            className="w-full justify-start gap-2"
          >
            <CalendarIcon className="size-3.5 shrink-0" />
            {rangeLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={calendarSelected}
            onSelect={handleRangeSelect}
            numberOfMonths={1}
          />
          {selectedRange && (
            <div className="border-t px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  dispatch({ type: 'CLEAR_DATE' })
                  setPendingRange(undefined)
                  setOpen(false)
                }}
              >
                Clear dates
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
