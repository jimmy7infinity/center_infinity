import { useEffect, useState } from 'react'
import { scrollState } from '../lib/scroll'
import { isGameActive, subscribeGameMode } from '../lib/gameMode'

/**
 * True while intro/runway/loop hyperjump or a minigame should hide chrome.
 * Uses `jump`, not `warp` — warp includes velocity stretch from section paging,
 * which was flashing the header on every beat change.
 */
export function useWarpHide(threshold = 0.12) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      setHidden(isGameActive() || scrollState.jump > threshold)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const unsubscribe = subscribeGameMode(() => {
      setHidden(isGameActive() || scrollState.jump > threshold)
    })
    return () => {
      cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [threshold])

  return hidden
}
