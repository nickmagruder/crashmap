'use client'

import { useEffect, useState } from 'react'
import { format, parseISO, isBefore, isAfter } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@apollo/client/react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFilterContext } from '@/context/FilterContext'
import { GET_FILTER_OPTIONS, type GetFilterOptionsQuery } from '@/lib/graphql/queries'

const CURRENT_YEAR = new Date().getFullYear()
const QUICK_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4]
const DATE_DISPLAY_FORMAT = 'MM/dd/yyyy'

export function DateFilter() {
  const { filterState, dispatch } = useFilterContext()
  const [open, setOpen] = useState(false)
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>()
  const [month, setMonth] = useState<Date>(() => new Date())

  const { data: boundsData } = useQuery<GetFilterOptionsQuery>(GET_FILTER_OPTIONS)

  useEffect(() => {
    const { minDate, maxDate } = boundsData?.filterOptions ?? {}
    if (minDate && maxDate) {
      dispatch({ type: 'SET_DATE_BOUNDS', payload: { minDate, maxDate } })
    }
  }, [boundsData, dispatch])

  const selectedYear = filterState.dateFilter.type === 'year' ? filterState.dateFilter.year : null
  const selectedRange = filterState.dateFilter.type === 'range' ? filterState.dateFilter : null
  const dataBounds = filterState.dataBounds
  const calendarSelected: DateRange | undefined =
    pendingRange ??
    (selectedRange
      ? { from: parseISO(selectedRange.startDate), to: parseISO(selectedRange.endDate) }
      : undefined)
  const rangeLabel = selectedRange
    ? `${selectedRange.startDate} – ${selectedRange.endDate}`
    : 'Custom range…'
  const canClear = !!(selectedRange || pendingRange?.from)

  function validateRange(from: Date, to: Date): string | null {
    if (isBefore(to, from)) return 'Start date must be before end date'
    if (dataBounds) {
      const min = parseISO(dataBounds.minDate)
      const max = parseISO(dataBounds.maxDate)
      if (isBefore(from, min))
        return `Data starts ${format(min, DATE_DISPLAY_FORMAT)} — no earlier records available`
      if (isAfter(to, max))
        return `Data ends ${format(max, DATE_DISPLAY_FORMAT)} — no later records available`
    }
    return null
  }

  function doCommit(from: Date, to: Date): boolean {
    const error = validateRange(from, to)
    if (error) {
      toast.error(error)
      return false
    }
    dispatch({
      type: 'SET_DATE_RANGE',
      payload: {
        startDate: format(from, 'yyyy-MM-dd'),
        endDate: format(to, 'yyyy-MM-dd'),
      },
    })
    return true
  }

  function handleYearClick(year: number) {
    if (selectedYear === year) {
      dispatch({ type: 'CLEAR_DATE' })
    } else {
      dispatch({ type: 'SET_DATE_YEAR', payload: year })
    }
  }

  function handleRangeSelect(range: DateRange | undefined) {
    // DayPicker v9 sets from === to on the first click; treat that as start-only
    if (range?.from && range?.to && range.from.getTime() === range.to.getTime()) {
      setPendingRange({ from: range.from, to: undefined })
      return
    }
    setPendingRange(range)
    if (range?.from && range?.to) {
      const committed = doCommit(range.from, range.to)
      if (committed) {
        setPendingRange(undefined)
        setOpen(false)
      }
    }
  }

  function handleOpenChange(next: boolean) {
    if (next && selectedRange) setMonth(parseISO(selectedRange.startDate))
    if (!next) setPendingRange(undefined)
    setOpen(next)
  }

  function handleMonthChange(newMonth: Date) {
    setMonth(newMonth)
  }

  function handleClear() {
    dispatch({ type: 'CLEAR_DATE' })
    setPendingRange(undefined)
  }

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
            captionLayout="dropdown"
            month={month}
            onMonthChange={handleMonthChange}
            startMonth={dataBounds ? parseISO(dataBounds.minDate) : undefined}
            endMonth={dataBounds ? parseISO(dataBounds.maxDate) : undefined}
          />
          {canClear && (
            <div className="border-t px-3 py-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={handleClear}>
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
