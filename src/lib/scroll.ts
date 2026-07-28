import { useEffect } from 'react'
import Lenis from 'lenis'

/**
 * Scroll is read every frame by the WebGL scene. Keeping it in a mutable
 * singleton instead of React state avoids a re-render per frame.
 */
export const scrollState = {
  progress: 0,
  velocity: 0,
}

let lenisInstance: Lenis | null = null

export function getLenis() {
  return lenisInstance
}

export function useSmoothScroll(smooth: boolean) {
  useEffect(() => {
    if (!smooth) {
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        scrollState.progress = max > 0 ? window.scrollY / max : 0
        scrollState.velocity = 0
      }
      onScroll()
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll)
      return () => {
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('resize', onScroll)
      }
    }

    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
    })
    lenisInstance = lenis

    lenis.on('scroll', (instance: Lenis) => {
      scrollState.progress = instance.progress ?? 0
      scrollState.velocity = instance.velocity ?? 0
    })

    let frame = 0
    const loop = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      lenisInstance = null
    }
  }, [smooth])
}
