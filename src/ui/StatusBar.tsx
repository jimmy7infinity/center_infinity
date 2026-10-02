import { useEffect, useRef, useState } from 'react'
import { BrandMark } from './BrandMark'
import { Emitter } from './StatusLight'
import { Achievements } from './Achievements'
import {
  canEnterGame,
  enterGame,
  getLastGameScore,
  subscribeGameMode,
} from '../lib/gameMode'
import { pointerState } from '../lib/pointer'

const MARK_TRIPLE_CLICK_MS = 1000
const MARK_TRIPLE_CLICKS = 3

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

/** Triple-click the crescent to open the flyer. */
function useMarkUnlock() {
  const timesRef = useRef<number[]>([])

  return () => {
    const now = performance.now()
    const times = timesRef.current.filter((t) => now - t < MARK_TRIPLE_CLICK_MS)
    times.push(now)
    timesRef.current = times
    if (times.length < MARK_TRIPLE_CLICKS) return
    timesRef.current = []
    if (!canEnterGame()) return
    // The mark isn't a button, so the click also latched a comet — clear it.
    pointerState.spaceClick = false
    enterGame('space-flyer')
  }
}

/** The reader's own time, redrawn on the minute like a real panel would. */
function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer = 0
    const schedule = () => {
      const msToMinute = 60_000 - (Date.now() % 60_000)
      timer = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msToMinute + 50)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <time className="tabular-nums" dateTime={now.toISOString()}>
      {clockFormat.format(now)}
    </time>
  )
}

export function StatusBar({ title }: { title: string }) {
  const onMarkClick = useMarkUnlock()
  const [lastScore, setLastScore] = useState(0)

  useEffect(() => {
    return subscribeGameMode(() => setLastScore(getLastGameScore()))
  }, [])

  return (
    <header className="ink-statusbar ink-label pointer-events-auto">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-6 cursor-pointer items-center" onClick={onMarkClick}>
          <BrandMark size="xs" decorative={false} />
        </span>
        <span className="ink-wordmark hidden sm:inline">Center Infinity</span>
      </div>

      {/* Announced on every turn; the refresh itself is silent. */}
      <p className="ink-statusbar__title truncate" aria-live="polite">
        {title}
      </p>

      <div className="flex items-center justify-end gap-4 sm:gap-5">
        <Achievements placement="header" />
        {lastScore > 0 ? (
          <span className="hidden tabular-nums md:inline">
            Score {String(lastScore).padStart(4, '0')}
          </span>
        ) : null}
        <a href="#contact" className="ink-link inline-flex items-center gap-2.5">
          <Emitter breathe />
          <span className="hidden sm:inline">Taking work</span>
        </a>
        <Clock />
      </div>
    </header>
  )
}
