import { ExternalLink } from 'lucide-react'
import { PanelCredit } from './PanelCredit'

const paymentLinks = [
  {
    label: 'PayPal',
    href: 'https://paypal.me/nickmagruder?locale.x=en_US&country.x=US',
  },
  {
    label: 'CashApp',
    href: 'https://cash.app/$iamnotatgregs',
  },
  {
    label: 'Venmo',
    href: 'https://venmo.com/u/NickMagruder',
  },
]

interface SupportPanelContentProps {
  onSwitchView?: () => void
}

export function SupportPanelContent({ onSwitchView }: SupportPanelContentProps) {
  return (
    <div className="space-y-6">
      <PanelCredit />
      {onSwitchView && (
        <button
          onClick={onSwitchView}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 -mt-3"
        >
          ← Back to Info
        </button>
      )}
      <div>
        <h2 className="text-base font-semibold">Support this App</h2>
      </div>

      <section>
        <p className="text-sm text-muted-foreground leading-relaxed">
          CrashMap is built and maintained in my spare time. Hosting and infrastructure costs come
          out of pocket — the app is free and will always remain free. If you find it useful, any
          support is genuinely appreciated, thank you!
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3">Donate</h3>
        <ul className="space-y-3">
          {paymentLinks.map(({ label, href }) => (
            <li key={label}>
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
        <h3 className="text-sm font-semibold mb-2">Contact</h3>
        <a
          href="https://www.magruder.info/contact/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
        >
          Get in touch
          <ExternalLink className="size-3 flex-shrink-0" />
        </a>
      </section>
    </div>
  )
}
