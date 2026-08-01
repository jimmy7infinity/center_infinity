export type AchievementId =
  | 'storm_bringer'
  | 'zeus'
  | 'gamer'
  | 'go_faster'
  | 'sharp_shooter'
  | 'destroyer'
  | 'star_gazer'
  | 'kamikaze'

export type AchievementDef = {
  id: AchievementId
  /** Display name — snake_case, same as the id. */
  name: string
  /** Short line shown under the name in the unlock drawer. */
  blurb: string
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'storm_bringer',
    name: 'storm_bringer',
    blurb: 'Grew a storm to full size',
  },
  {
    id: 'zeus',
    name: 'zeus',
    blurb: 'Struck lightning 5 times in a full storm',
  },
  {
    id: 'gamer',
    name: 'gamer',
    blurb: 'Launched the space flyer',
  },
  {
    id: 'go_faster',
    name: 'go_faster',
    blurb: 'Triggered a burst boost',
  },
  {
    id: 'sharp_shooter',
    name: 'sharp_shooter',
    blurb: 'Destroyed a space rock',
  },
  {
    id: 'destroyer',
    name: 'destroyer',
    blurb: 'Destroyed 10 space rocks',
  },
  {
    id: 'star_gazer',
    name: 'star_gazer',
    blurb: 'Triggered 5 shooting stars',
  },
  {
    id: 'kamikaze',
    name: 'kamikaze',
    blurb: 'Crashed into a planet',
  },
] as const

const BY_ID = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<AchievementId, AchievementDef>

const DESTROYER_TARGET = 10
const STAR_GAZER_TARGET = 5
const ZEUS_TARGET = 5

const unlocked = new Set<AchievementId>()
/** Discovery order — newest unlocks append at the end of the tray. */
const unlockedOrder: AchievementId[] = []
let rockKills = 0
let starTriggers = 0
let lightningStrikes = 0
/** Head of queue is the chip currently announcing via its drawer. */
const announceQueue: AchievementId[] = []
const listeners = new Set<() => void>()

// Drop any leftover persistence from earlier builds — session-only now.
try {
  localStorage.removeItem('ci-achievements')
} catch {
  // ignore
}

function notify() {
  for (const listener of listeners) listener()
}

export function getAchievement(id: AchievementId) {
  return BY_ID[id]
}

export function getUnlockedAchievements(): AchievementId[] {
  return unlockedOrder.slice()
}

export function isAchievementUnlocked(id: AchievementId) {
  return unlocked.has(id)
}

export function getAnnouncingAchievement(): AchievementId | null {
  return announceQueue[0] ?? null
}

export function dismissAchievementAnnounce() {
  if (announceQueue.length === 0) return
  announceQueue.shift()
  notify()
}

export function subscribeAchievements(listener: () => void) {
  listeners.add(listener)
  listener()
  return () => {
    listeners.delete(listener)
  }
}

/** Idempotent. Returns true when the achievement was newly unlocked. */
export function unlockAchievement(id: AchievementId) {
  if (!(id in BY_ID) || unlocked.has(id)) return false
  unlocked.add(id)
  unlockedOrder.push(id)
  announceQueue.push(id)
  notify()
  return true
}

/** Call once per destroyed rock. Handles sharp_shooter + destroyer. */
export function recordRockDestroyed() {
  rockKills += 1
  unlockAchievement('sharp_shooter')
  if (rockKills >= DESTROYER_TARGET) unlockAchievement('destroyer')
}

/** Call once per click-spawned shooting star. Handles star_gazer. */
export function recordShootingStarTriggered() {
  starTriggers += 1
  if (starTriggers >= STAR_GAZER_TARGET) unlockAchievement('star_gazer')
}

/** Call once per lightning strike in a fully grown storm. Handles zeus. */
export function recordLightningStrike() {
  lightningStrikes += 1
  if (lightningStrikes >= ZEUS_TARGET) unlockAchievement('zeus')
}
