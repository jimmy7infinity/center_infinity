/**
 * Hand-drawn line icons rather than an icon package: there are six of them, and
 * a dependency would cost more bytes than the whole set. Geometric and
 * instrument-like on purpose — nothing rounded or friendly.
 */

type IconProps = {
  className?: string
}

const BASE = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.1,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Layered planes — full-stack work. */
export function StackIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M8 1.8 14.2 5 8 8.2 1.8 5 8 1.8Z" />
      <path d="M1.8 8 8 11.2 14.2 8" />
      <path d="M1.8 11 8 14.2 14.2 11" />
    </svg>
  )
}

/** A grid with one cell taken — booking and marketplace inventory. */
export function GridIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="1.8" y="1.8" width="5" height="5" rx="0.8" />
      <rect x="9.2" y="1.8" width="5" height="5" rx="0.8" />
      <rect x="1.8" y="9.2" width="5" height="5" rx="0.8" />
      <rect
        x="9.2"
        y="9.2"
        width="5"
        height="5"
        rx="0.8"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

/** A node fanning out to three others — inference, not a magic wand. */
export function NodeIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="3.4" cy="8" r="1.6" />
      <circle cx="12.6" cy="3.6" r="1.4" />
      <circle cx="12.6" cy="12.4" r="1.4" />
      <path d="M4.9 7.3 11.2 4.2M4.9 8.7l6.3 3.1" />
    </svg>
  )
}

/** A body with an orbit — the 3D and interactive work, and the site itself. */
export function OrbitIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="8" cy="8" r="3.1" />
      <ellipse cx="8" cy="8" rx="6.4" ry="2.6" transform="rotate(-28 8 8)" />
    </svg>
  )
}

export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M2.8 8h10.4M9.2 4.2 13.2 8l-4 3.8" />
    </svg>
  )
}

export const SERVICE_ICONS = {
  stack: StackIcon,
  grid: GridIcon,
  node: NodeIcon,
  orbit: OrbitIcon,
} as const

export type ServiceIconName = keyof typeof SERVICE_ICONS
