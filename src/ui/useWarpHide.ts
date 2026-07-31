import { useEffect, useState } from 'react'
import { scrollState } from '../lib/scroll'

/** True while intro/runway/loop warp is strong enough that chrome should vanish. */
export function useWarpHide(threshold = 0.12) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let frame = 0
    const loop = () => {
      setHidden(scrollState.warp > threshold)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [threshold])

  return hidden
}
