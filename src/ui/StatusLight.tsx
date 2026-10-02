import type { ProjectStatus } from '../content/projects'

type Presentation = {
  text: string
  lit: boolean
}

function present(status: ProjectStatus): Presentation {
  switch (status) {
    case 'shipping':
      return { text: 'Shipping', lit: true }
    case 'beta':
      return { text: 'Beta', lit: true }
    case 'demo':
      return { text: 'Demo', lit: true }
    case 'planned':
      return { text: 'Reserved', lit: false }
    default: {
      const exhaustive: never = status
      throw new Error(`Unhandled project status: ${exhaustive}`)
    }
  }
}

/**
 * A point of real light set into the panel. Everything else is pigment;
 * these glow, all in the same white.
 */
export function Emitter({
  lit = true,
  breathe = false,
}: {
  lit?: boolean
  breathe?: boolean
}) {
  const state = lit ? (breathe ? ' emitter--breathe' : '') : ' emitter--off'
  return <span className={`emitter${state}`} aria-hidden />
}

export function StatusLight({ status }: { status: ProjectStatus }) {
  const { text, lit } = present(status)

  return (
    <span className="ink-label inline-flex items-center gap-2.5">
      <Emitter lit={lit} breathe={status === 'shipping'} />
      {text}
    </span>
  )
}
