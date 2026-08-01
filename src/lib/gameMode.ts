import type { GameId } from '../game/types'
import { unlockAchievement } from './achievements'
import {
  hasEntered,
  isIntroWarpActive,
  setSectionPagingPaused,
  triggerSiteLoop,
} from './scroll'

export const GAME_DURATION_SEC = 30
export const POINTS_PER_ROCK = 100
/** Hold on GAME OVER before warping home. */
export const GAME_OVER_HOLD_MS = 2600

export const gameMode = {
  active: false,
  gameId: null as GameId | null,
  startedAt: 0,
  /** Frozen clock when the run ends in a crash (keeps the HUD timer still). */
  endedAt: 0,
  /** Planet crash — show GAME OVER, then exit. */
  gameOver: false,
  /** Points earned in the current (or just-finished) run. */
  score: 0,
  /** Last completed run — shown under “Start a project”. */
  lastScore: 0,
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function setGameVeil(value: number) {
  document.documentElement.style.setProperty('--game-veil', value.toFixed(3))
  document.documentElement.classList.toggle('game-active', value > 0.01)
}

export function subscribeGameMode(listener: () => void) {
  listeners.add(listener)
  listener()
  return () => {
    listeners.delete(listener)
  }
}

export function isGameActive() {
  return gameMode.active
}

export function isGameOver() {
  return gameMode.gameOver
}

export function getGameTimeLeft() {
  if (!gameMode.active) return 0
  const now = gameMode.gameOver ? gameMode.endedAt : performance.now()
  const elapsed = (now - gameMode.startedAt) / 1000
  return Math.max(0, GAME_DURATION_SEC - elapsed)
}

export function getGameScore() {
  return gameMode.score
}

export function getLastGameScore() {
  return gameMode.lastScore
}

export function addGameScore(points: number) {
  if (!gameMode.active || gameMode.gameOver || points === 0) return
  gameMode.score += points
  notify()
}

/** WebGL path only — caller should already know the scene is up. */
export function canEnterGame() {
  if (gameMode.active) return false
  if (!hasEntered()) return false
  if (isIntroWarpActive()) return false
  return true
}

export function enterGame(id: GameId) {
  if (!canEnterGame()) return false

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }

  gameMode.active = true
  gameMode.gameId = id
  gameMode.startedAt = performance.now()
  gameMode.endedAt = 0
  gameMode.gameOver = false
  gameMode.score = 0

  // Stay on the current tableau — no scroll/camera jump.
  setSectionPagingPaused(true)
  setGameVeil(1)
  unlockAchievement('gamer')
  notify()
  return true
}

/**
 * Planet crash — freezes the run and signals the HUD to show GAME OVER.
 * Caller should destroy the ship; HUD schedules exitGame after the hold.
 */
export function triggerGameOver() {
  if (!gameMode.active || gameMode.gameOver) return
  gameMode.gameOver = true
  gameMode.endedAt = performance.now()
  unlockAchievement('kamikaze')
  notify()
}

/**
 * Ends the run, restores site systems, then fires the existing loop/warp back
 * to the hero. Safe to call once; subsequent calls while inactive are no-ops.
 */
export function exitGame() {
  if (!gameMode.active) return

  gameMode.lastScore = gameMode.score
  gameMode.active = false
  gameMode.gameId = null
  gameMode.startedAt = 0
  gameMode.endedAt = 0
  gameMode.gameOver = false

  setSectionPagingPaused(false)
  // Raise warp veil before dropping the game veil so copy never flashes mid-cut.
  document.documentElement.style.setProperty('--warp-veil', '1')
  triggerSiteLoop()
  setGameVeil(0)
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  notify()
}
