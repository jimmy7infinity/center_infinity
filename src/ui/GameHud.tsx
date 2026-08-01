import { useEffect, useState } from 'react'
import {
  exitGame,
  GAME_DURATION_SEC,
  GAME_OVER_HOLD_MS,
  getGameScore,
  getGameTimeLeft,
  isGameActive,
  isGameOver,
  subscribeGameMode,
} from '../lib/gameMode'
import { flyerControls } from '../game/spaceFlyer/controls'

const HINT_MS = 3200

/** Countdown, score, hint, reticle, and classic GAME OVER while a minigame runs. */
export function GameHud() {
  const [active, setActive] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [seconds, setSeconds] = useState(GAME_DURATION_SEC)
  const [score, setScore] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [target, setTarget] = useState({ x: 0, y: 0 })

  useEffect(() => {
    return subscribeGameMode(() => {
      const on = isGameActive()
      const over = isGameOver()
      setActive(on)
      setGameOver(over)
      if (on) {
        if (!over) setShowHint(true)
        setSeconds(Math.ceil(getGameTimeLeft()))
        setScore(getGameScore())
      } else {
        setShowHint(false)
        setGameOver(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!active || gameOver) return

    let frame = 0
    const loop = () => {
      setSeconds(Math.ceil(getGameTimeLeft()))
      setScore(getGameScore())
      setTarget({ x: flyerControls.clientX, y: flyerControls.clientY })
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    const hintTimer = window.setTimeout(() => setShowHint(false), HINT_MS)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(hintTimer)
    }
  }, [active, gameOver])

  useEffect(() => {
    if (!gameOver) return
    setShowHint(false)
    const timer = window.setTimeout(() => exitGame(), GAME_OVER_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [gameOver])

  if (!active) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div className="absolute left-6 top-6 font-mono text-sm tracking-[0.18em] text-rim/80 md:left-12">
        {String(score).padStart(4, '0')}
      </div>
      <div className="absolute right-6 top-6 font-mono text-sm tracking-[0.2em] text-rim/80 md:right-12">
        {String(seconds).padStart(2, '0')}
      </div>

      {gameOver ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          <p className="game-over-title">GAME OVER</p>
          <p className="game-over-score">
            SCORE {String(score).padStart(4, '0')}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`absolute inset-x-0 bottom-10 flex justify-center transition-opacity duration-500 ${
              showHint ? 'opacity-70' : 'opacity-0'
            }`}
          >
            <p className="label text-[0.625rem] text-regolith">
              aim · W thrust · WW burst · click/space fire · A D bank
            </p>
          </div>

          <div
            className="absolute text-rim/85"
            style={{
              left: target.x,
              top: target.y,
              transform: 'translate(-50%, -50%)',
            }}
            aria-hidden
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <polygon
                points="12,1.5 21.2,6.75 21.2,17.25 12,22.5 2.8,17.25 2.8,6.75"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="1.15" fill="currentColor" />
            </svg>
          </div>
        </>
      )}
    </div>
  )
}
