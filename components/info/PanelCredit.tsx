export function PanelCredit() {
  return (
    <div className="pb-4 border-b mb-6">
      <p className="text-sm text-muted-foreground">
        Created by{' '}
        <a
          href="https://www.magruder.info/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Nick Magruder
        </a>
      </p>
      <p className="text-xs text-muted-foreground/60 mt-0.5">
        A former bike mechanic turned internet mechanic
      </p>
    </div>
  )
}
