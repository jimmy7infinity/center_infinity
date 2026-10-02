/**
 * Hand-drawn line icons rather than an icon package: there are only a handful,
 * and a dependency would cost more bytes than the whole set. Geometric and
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

/** Double chevron down — hero scroll cue. */
export function ChevronDownDoubleIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} viewBox="0 0 16 16">
      <path d="M3.2 3.6 8 7.8l4.8-4.2" />
      <path d="M3.2 8.4 8 12.6l4.8-4.2" />
    </svg>
  )
}

/* Social marks: the brands' own glyphs, filled, not redrawn as line icons. */

const BRAND = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
}

export function XIcon({ className }: IconProps) {
  return (
    <svg {...BRAND} className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function GitHubIcon({ className }: IconProps) {
  return (
    <svg {...BRAND} className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      className={className}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.6" cy="6.4" r="1.25" fill="currentColor" stroke="none" />
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
