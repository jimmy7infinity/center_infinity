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
import { flyerControls, isTouchFlight } from '../game/spaceFlyer/controls'
import { prefersTouchControls } from '../lib/touch'
import { MobileGamePad } from './MobileGamePad'

const HINT_MS = 3200

/** Countdown, score, hint, reticle, and classic GAME OVER while a minigame runs. */
export function GameHud() {
  const [active, setActive] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [seconds, setSeconds] = useState(GAME_DURATION_SEC)
  const [score, setScore] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [target, setTarget] = useState({ x: 0, y: 0 })
  const [touchFlight, setTouchFlight] = useState(false)

  useEffect(() => {
    return subscribeGameMode(() => {
      const on = isGameActive()
      const over = isGameOver()
      setActive(on)
      setGameOver(over)
      if (on) {
        // Controls attach one paint later — preferTouch is the optimistic UI cue.
        setTouchFlight(isTouchFlight() || prefersTouchControls())
        if (!over) setShowHint(true)
        setSeconds(Math.ceil(getGameTimeLeft()))
        setScore(getGameScore())
      } else {
        setShowHint(false)
        setGameOver(false)
        setTouchFlight(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!active || gameOver) return

    let frame = 0
    let lastTouch = false
    const loop = () => {
      setSeconds(Math.ceil(getGameTimeLeft()))
      setScore(getGameScore())
      setTarget({ x: flyerControls.clientX, y: flyerControls.clientY })
      // Latch to the real control mode once SpaceFlyer has attached listeners.
      const touch = isTouchFlight()
      if (touch !== lastTouch) {
        lastTouch = touch
        setTouchFlight(touch)
      }
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
      <div className="absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[max(1.25rem,env(safe-area-inset-top))] font-mono text-sm tracking-[0.18em] text-rim/80 md:left-12">
        {String(score).padStart(4, '0')}
      </div>
      <div className="absolute right-[max(1.25rem,env(safe-area-inset-right))] top-[max(1.25rem,env(safe-area-inset-top))] font-mono text-sm tracking-[0.2em] text-rim/80 md:right-12">
        {String(seconds).padStart(2, '0')}
      </div>

      {gameOver ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
          <p className="game-over-title">GAME OVER</p>
          <p className="game-over-score">
            SCORE {String(score).padStart(4, '0')}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`absolute inset-x-0 flex justify-center px-4 transition-opacity duration-500 ${
              touchFlight
                ? 'bottom-[calc(7.5rem+env(safe-area-inset-bottom))]'
                : 'bottom-10'
            } ${showHint ? 'opacity-70' : 'opacity-0'}`}
          >
            <p className="label text-center text-[0.625rem] text-regolith">
              {touchFlight
                ? 'stick · thrust · double-tap burst · auto fire'
                : 'aim · W thrust · WW burst · click/space fire · A D bank'}
            </p>
          </div>

          {/* Desktop reticle tracks the cursor; touch flights hide it — the
              stick already says where you're pointed, and a floating hex over
              thumbs reads as noise. */}
          {!touchFlight ? (
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
          ) : null}

          {touchFlight ? <MobileGamePad /> : null}
        </>
      )}
    </div>
  )
}
