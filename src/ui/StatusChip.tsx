import type { ProjectStatus } from '../content/projects'

type Presentation = {
  text: string
  /**
   * Full literal class strings. Tailwind scans source statically, so an
   * interpolated `bg-${tone}` would compile to nothing at all.
   */
  chip: string
  dot: string
  /** Only shipped work gets the live pulse; everything else is a static dot. */
  live: boolean
}

function present(status: ProjectStatus): Presentation {
  switch (status) {
    case 'shipping':
      return {
        text: 'Shipping',
        chip: 'border-live/25 bg-live/10 text-live',
        dot: 'bg-live',
        live: true,
      }
    case 'beta':
      return {
        text: 'Beta',
        chip: 'border-beta/25 bg-beta/10 text-beta',
        dot: 'bg-beta',
        live: false,
      }
    case 'demo':
      return {
        text: 'Demo',
        chip: 'border-demo/25 bg-demo/10 text-demo',
        dot: 'bg-demo',
        live: false,
      }
    case 'planned':
      return {
        text: 'Reserved',
        chip: 'border-dashed border-white/20 text-regolith',
        dot: 'bg-regolith',
        live: false,
      }
    default: {
      const exhaustive: never = status
      throw new Error(`Unhandled project status: ${exhaustive}`)
    }
  }
}

export function StatusChip({ status }: { status: ProjectStatus }) {
  const { text, chip, dot, live } = present(status)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] ${chip}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {text}
    </span>
  )
}
