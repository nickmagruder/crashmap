import { ExternalLink } from 'lucide-react'
import { PanelCredit } from './PanelCredit'

const resources = [
  {
    href: 'https://wabikes.org/',
    label: 'Washington Bikes: The Political Voice for People Who Bike',
  },
  {
    href: 'https://www.seattlegreenways.org/',
    label: 'Seattle Neighborhood Greenways',
  },
  {
    href: 'https://spokanereimagined.org/',
    label: 'Spokane Reimagined',
  },
  {
    href: 'https://www.safest.org/',
    label: 'Safe Streets Pierce County',
  },
  {
    href: 'https://www.cityofvancouver.us/business/planning-development-and-zoning/transportation-planning/complete-streets/',
    label: 'Vancouver Complete Streets',
  },
]

interface InfoPanelContentProps {
  onSwitchView?: () => void
}

export function InfoPanelContent({ onSwitchView }: InfoPanelContentProps) {
  return (
    <div className="space-y-6">
      <PanelCredit />

      <section>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This map is dedicated to all victims of traffic violence and their loved ones, across
          Washington State and the world. Traffic violence is an epidemic that leaves countless
          lives irreparably damaged or ended far too soon. I hope this can be used as a tool to
          conceptualize and ingrain the true scale of the damage this violence bares on our
          communities. For each dot on this map, let&apos;s fight for safe streets.
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">The Data</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each record represents a reported crash involving at least one &quot;pedacyclist&quot; or
          pedestrian with a known location. Crashes are classified by the most severe injury to any
          person involved. Currently includes data from Washington State. In the case of duplicate
          reports, I used the most vulnerable mode listed on the report(pedestrian &gt; bicycle &gt;
          car). All data is from WSDOT, mirroring the data from the{' '}
          <a
            href="https://remoteapps.wsdot.wa.gov/highwaysafety/collision/data/portal/public/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            WSDOT Crash Data Portal
            <ExternalLink className="size-3 flex-shrink-0" />
          </a>
          , which is compiled from police reports.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mt-3">
          Find this project on{' '}
          <a
            href="https://github.com/nickmagruder/crashmap"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            GitHub
            <ExternalLink className="size-3 flex-shrink-0" />
          </a>
          .
        </p>
      </section>

      {onSwitchView && (
        <button
          onClick={onSwitchView}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          ❤️ Support this App
        </button>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-3">Map Key</h3>
        <ul className="space-y-2">
          {[
            { color: '#B71C1C', opacity: 0.85, size: 14, label: 'Fatal' },
            { color: '#E65100', opacity: 0.7, size: 12, label: 'Major Injury' },
            { color: '#F9A825', opacity: 0.55, size: 11, label: 'Minor Injury' },
            { color: '#C5E1A5', opacity: 0.5, size: 10, label: 'No Injury / Unknown' },
          ].map(({ color, opacity, size, label }) => (
            <li key={label} className="flex items-center gap-2.5">
              <span
                className="flex-shrink-0 rounded-full"
                style={{ width: size, height: size, backgroundColor: color, opacity }}
              />
              <span className="text-sm text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">📣 Get Involved!</h3>
        <ul className="space-y-2.5">
          {resources.map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
              >
                {label}
                <ExternalLink className="size-3 flex-shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Data Disclaimer</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This data is self-collected from publicly available state transportation department
          records. It may be incomplete, contain errors, or not reflect the most recent crashes. It
          should not be used as the sole basis for safety decisions or policy.
        </p>
      </section>
      <section>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Version 0.6.0 &middot; Updated 2/23/2026
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">© Copyright 2026 Nick Magruder</p>
      </section>
    </div>
  )
}
