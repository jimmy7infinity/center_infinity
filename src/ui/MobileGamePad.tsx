import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  queueTouchBurst,
  setTouchAim,
  setTouchThrust,
} from '../game/spaceFlyer/controls'

const STICK_RADIUS = 52
const STICK_TRAVEL = 34
const DEADZONE = 0.12
/** Mirror desktop double-tap W — second thrust press within this window bursts. */
const DOUBLE_TAP_THRUST_MS = 300

type StickState = { x: number; y: number; active: boolean }

/**
 * Portrait flight pad: left stick aims, right holds thrust.
 * Double-tap thrust = burst (same muscle memory as WW on desktop).
 * Auto-fire lives in controls — no shoot button.
 */
export function MobileGamePad() {
  const stickBase = useRef<HTMLDivElement>(null)
  const stickPointer = useRef<number | null>(null)
  const lastThrustDownMs = useRef(0)
  const [stick, setStick] = useState<StickState>({
    x: 0,
    y: 0,
    active: false,
  })
  const [thrusting, setThrusting] = useState(false)

  const applyStick = useCallback((clientX: number, clientY: number) => {
    const el = stickBase.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > STICK_TRAVEL && len > 0) {
      dx = (dx / len) * STICK_TRAVEL
      dy = (dy / len) * STICK_TRAVEL
    }
    const nx = dx / STICK_TRAVEL
    const ny = -dy / STICK_TRAVEL
    const mag = Math.hypot(nx, ny)
    if (mag < DEADZONE) {
      setTouchAim(0, 0)
      setStick({ x: 0, y: 0, active: true })
      return
    }
    const scale = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag
    setTouchAim(nx * scale, ny * scale)
    setStick({ x: dx, y: dy, active: true })
  }, [])

  const resetStick = useCallback(() => {
    stickPointer.current = null
    setTouchAim(0, 0)
    setStick({ x: 0, y: 0, active: false })
  }, [])

  const onStickDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    stickPointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    applyStick(event.clientX, event.clientY)
  }

  const onStickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== event.pointerId) return
    event.preventDefault()
    applyStick(event.clientX, event.clientY)
  }

  const onStickUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== event.pointerId) return
    event.preventDefault()
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    resetStick()
  }

  const onThrustDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    const now = performance.now()
    if (
      lastThrustDownMs.current > 0 &&
      now - lastThrustDownMs.current <= DOUBLE_TAP_THRUST_MS
    ) {
      queueTouchBurst()
      lastThrustDownMs.current = 0
    } else {
      lastThrustDownMs.current = now
    }

    setThrusting(true)
    setTouchThrust(true)
  }

  const onThrustUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    setThrusting(false)
    setTouchThrust(false)
  }

  return (
    <div
      className="mobile-game-pad pointer-events-none absolute inset-x-0 bottom-0 z-[61] flex items-end justify-between px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8"
      aria-hidden
    >
      <div
        ref={stickBase}
        className="pointer-events-auto relative touch-none"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div
          className={`absolute inset-0 rounded-full border transition-colors duration-150 ${
            stick.active
              ? 'border-rim/35 bg-void/45'
              : 'border-rim/18 bg-void/30'
          }`}
        />
        <div
          className={`absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors duration-150 ${
            stick.active
              ? 'border-glow/50 bg-rim/25'
              : 'border-rim/25 bg-rim/12'
          }`}
          style={{
            transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))`,
          }}
        />
      </div>

      <button
        type="button"
        className={`pointer-events-auto mobile-pad-btn mobile-pad-btn--thrust touch-none ${
          thrusting ? 'is-active' : ''
        }`}
        aria-label="Thrust — double tap to burst"
        onPointerDown={onThrustDown}
        onPointerUp={onThrustUp}
        onPointerCancel={onThrustUp}
      >
        THRUST
      </button>
    </div>
  )
}
