import { useEffect, useState, type ReactElement } from 'react'
import {
  dismissAchievementAnnounce,
  getAchievement,
  getAnnouncingAchievement,
  subscribeAchievements,
  type AchievementId,
} from '../lib/achievements'

const ANNOUNCE_MS = 3400

type IconProps = { className?: string }

const ICON_BASE = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.15,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function GamerIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <path d="M8 2.4 12.6 5v6L8 13.6 3.4 11V5L8 2.4Z" />
      <circle cx="8" cy="8" r="1.2" />
    </svg>
  )
}

function GoFasterIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <path d="M2.4 4.4 6.2 8 2.4 11.6" />
      <path d="M7 4.4 10.8 8 7 11.6" />
      <path d="M11.6 4.4 14.2 8l-2.6 3.6" />
    </svg>
  )
}

function SharpShooterIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <circle cx="8" cy="8" r="4.4" />
      <path d="M8 2.2v2.4M8 11.4v2.4M2.2 8h2.4M11.4 8h2.4" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function DestroyerIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <path d="M4.2 5.2 6 3.6l2.2 1.2 2.4-.8 1.6 2.2-.6 2.4 1.4 2.2-2.2 1.4-1.8-.4-2.4 1.2-1.8-1.8.2-2.4L4.2 5.2Z" />
      <path d="M6.2 7.2 9.8 10.6M9.6 6.8 6.4 10.4" />
    </svg>
  )
}

function MeteorStrikeIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <circle cx="11.2" cy="11" r="2.6" />
      <path d="M2.2 3.4 9.4 9.2" />
      <path d="M7.8 8.4 9.8 7.2 8.8 9.6" />
    </svg>
  )
}

function StarGazerIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <path d="M2.4 5.2 13.6 9.4" />
      <path d="M11.2 7.6 13.8 6.4 12.8 9.2" />
      <path d="M4.6 3.4 5.2 4.8 3.8 4.2" />
      <path d="M7.4 11.6 8 13 6.6 12.4" />
    </svg>
  )
}

function KamikazeIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <circle cx="8" cy="8" r="5.2" />
      <path d="M3.2 3.2 12.8 12.8M12.8 3.2 3.2 12.8" />
    </svg>
  )
}

const ICONS: Record<AchievementId, (props: IconProps) => ReactElement> = {
  gamer: GamerIcon,
  go_faster: GoFasterIcon,
  sharp_shooter: SharpShooterIcon,
  destroyer: DestroyerIcon,
  meteor_strike: MeteorStrikeIcon,
  star_gazer: StarGazerIcon,
  kamikaze: KamikazeIcon,
}

function AchievementIcon({
  id,
  className,
}: {
  id: AchievementId
  className?: string
}) {
  const Icon = ICONS[id]
  return <Icon className={className} />
}

/** One unlock, under the header, then gone. Nothing stays in the bar. */
export function Achievements() {
  const [id, setId] = useState<AchievementId | null>(() =>
    getAnnouncingAchievement(),
  )

  useEffect(() => {
    return subscribeAchievements(() => {
      setId(getAnnouncingAchievement())
    })
  }, [])

  useEffect(() => {
    if (!id) return
    const timer = window.setTimeout(() => dismissAchievementAnnounce(), ANNOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [id])

  if (!id) return null
  const def = getAchievement(id)

  return (
    <div key={id} className="achievement-toast" role="status" aria-live="polite">
      <span className="achievement-toast__icon" aria-hidden>
        <AchievementIcon id={id} className="h-3.5 w-3.5" />
      </span>
      <span className="achievement-toast__copy">
        <span className="achievement-toast__name">{def.name}</span>
        <span className="achievement-toast__blurb">{def.blurb}</span>
      </span>
    </div>
  )
}
