type CrashRow = {
  colliRptNum: string
  crashDate?: string | null
  time?: string | null
  injuryType?: string | null
  mode?: string | null
  state?: string | null
  county?: string | null
  city?: string | null
  jurisdiction?: string | null
  region?: string | null
  ageGroup?: string | null
  involvedPersons?: number | null
  latitude?: number | null
  longitude?: number | null
}

const HEADERS = [
  'Collision Report #',
  'Date',
  'Time',
  'Injury Type',
  'Mode',
  'State',
  'County',
  'City',
  'Jurisdiction',
  'Region',
  'Age Group',
  'Involved Persons',
  'Latitude',
  'Longitude',
]

function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function generateCsv(items: CrashRow[]): string {
  const rows = items.map((item) => [
    item.colliRptNum,
    item.crashDate ?? '',
    item.time ?? '',
    item.injuryType ?? '',
    item.mode ?? '',
    item.state ?? '',
    item.county ?? '',
    item.city ?? '',
    item.jurisdiction ?? '',
    item.region ?? '',
    item.ageGroup ?? '',
    item.involvedPersons?.toString() ?? '',
    item.latitude?.toString() ?? '',
    item.longitude?.toString() ?? '',
  ])

  const lines = [HEADERS, ...rows].map((row) => row.map(escapeCell).join(','))
  return '\ufeff' + lines.join('\r\n') // BOM prefix for Excel compatibility
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
