import { useEffect, useState, type ReactElement } from 'react'
import {
  dismissAchievementAnnounce,
  getAchievement,
  getAnnouncingAchievement,
  getUnlockedAchievements,
  subscribeAchievements,
  type AchievementId,
} from '../lib/achievements'
import { scrollState } from '../lib/scroll'

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

function StormBringerIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <path d="M8 2.2c2.2 1.4 3.6 3.2 3.6 5.4S10.2 12.4 8 13.8C5.8 12.4 4.4 10.6 4.4 8.4S5.8 3.6 8 2.2Z" />
      <path d="M8 4.4c1.2.8 2 1.8 2 3s-.8 2.2-2 3c-1.2-.8-2-1.8-2-3s.8-2.2 2-3Z" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ZeusIcon({ className }: IconProps) {
  return (
    <svg {...ICON_BASE} className={className}>
      <path d="M9.2 1.8 5.4 8.2h2.6L6.6 14.2 12.4 6.6H9.4L9.2 1.8Z" />
    </svg>
  )
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
  storm_bringer: StormBringerIcon,
  zeus: ZeusIcon,
  gamer: GamerIcon,
  go_faster: GoFasterIcon,
  sharp_shooter: SharpShooterIcon,
  destroyer: DestroyerIcon,
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

function AchievementChip({
  id,
  announcing,
}: {
  id: AchievementId
  announcing: boolean
}) {
  const def = getAchievement(id)
  return (
    <li className={`achievement-chip${announcing ? ' is-announcing' : ''}`}>
      <button
        type="button"
        className="achievement-chip__hit"
        aria-label={
          announcing ? `achievement unlocked: ${def.name}` : def.name
        }
      >
        <span className="achievement-chip__icon" aria-hidden>
          <AchievementIcon id={id} className="h-3.5 w-3.5" />
        </span>
        <span className="achievement-chip__drawer" aria-hidden={!announcing}>
          <span className="achievement-chip__panel">
            <span className="achievement-chip__name">
              {announcing ? `achievement unlocked: ${def.name}` : def.name}
            </span>
          </span>
        </span>
      </button>
      {announcing ? (
        <span className="sr-only" role="status" aria-live="polite">
          achievement unlocked: {def.name}
        </span>
      ) : null}
    </li>
  )
}

/** Discovered achievement icons — new unlocks append and announce via drawer. */
export function Achievements() {
  const [warpHidden, setWarpHidden] = useState(false)
  const [unlocked, setUnlocked] = useState<AchievementId[]>(() =>
    getUnlockedAchievements(),
  )
  const [announcingId, setAnnouncingId] = useState<AchievementId | null>(() =>
    getAnnouncingAchievement(),
  )

  // Stay visible during the minigame (in-game unlocks); only dim for warp.
  useEffect(() => {
    let frame = 0
    const loop = () => {
      setWarpHidden(scrollState.jump > 0.12)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    return subscribeAchievements(() => {
      setUnlocked(getUnlockedAchievements())
      setAnnouncingId(getAnnouncingAchievement())
    })
  }, [])

  useEffect(() => {
    if (!announcingId) return
    const timer = window.setTimeout(
      () => dismissAchievementAnnounce(),
      ANNOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [announcingId])

  if (unlocked.length === 0) return null

  return (
    <div
      className={`pointer-events-none fixed inset-x-6 top-16 z-[55] md:inset-x-12 md:top-[4.25rem] ${
        warpHidden ? 'opacity-0' : 'opacity-100'
      } transition-opacity duration-300`}
      aria-hidden={warpHidden}
    >
      <ul className="achievement-tray pointer-events-auto">
        {unlocked.map((id) => (
          <AchievementChip
            key={id}
            id={id}
            announcing={id === announcingId}
          />
        ))}
      </ul>
    </div>
  )
}
