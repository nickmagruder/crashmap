import type { SeverityBucket } from '@/context/FilterContext'

type ColorMap = Record<SeverityBucket, string>

/**
 * Standard severity color palette.
 * Rendered bottom-to-top: None → Minor → Major → Death.
 */
export const STANDARD_COLORS: ColorMap = {
  None: '#C5E1A5',
  'Minor Injury': '#FDD835',
  'Major Injury': '#F57C00',
  Death: '#B71C1C',
}

/**
 * Accessible severity color palette — Paul Tol Muted scheme.
 * Distinguishable under all forms of color vision deficiency
 * (protanopia, deuteranopia, tritanopia).
 */
export const ACCESSIBLE_COLORS: ColorMap = {
  None: '#44AA99',
  'Minor Injury': '#DDCC77',
  'Major Injury': '#CC6677',
  Death: '#332288',
}
