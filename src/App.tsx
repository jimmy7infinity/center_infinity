import { Suspense, lazy, useEffect, useState } from 'react'
import { Overlay } from './ui/Overlay'
import { StaticBackdrop } from './ui/StaticBackdrop'
import { enterSite, useSmoothScroll } from './lib/scroll'
import { usePointerTracking } from './lib/pointer'
import { detectQuality, type QualityTier } from './lib/quality'

// The 3D bundle is the heavy part, so it never blocks first paint of the copy.
const Scene = lazy(() =>
  import('./scene/Scene').then((m) => ({ default: m.Scene })),
)

export function App() {
  const [tier, setTier] = useState<QualityTier | null>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    setTier(detectQuality())
  }, [])

  useEffect(() => {
    if (tier === 'static') {
      setEntered(true)
    }
  }, [tier])

  const webgl = tier === 'high' || tier === 'medium'
  useSmoothScroll(webgl, tier !== null)
  usePointerTracking(webgl && entered)

  // Skip the gate — warp intro starts as soon as the WebGL path is ready.
  useEffect(() => {
    if (!webgl || tier === null) return
    enterSite()
    setEntered(true)
  }, [webgl, tier])

  return (
    <>
      {tier === 'static' || tier === null ? (
        <StaticBackdrop />
      ) : (
        <Suspense fallback={<StaticBackdrop />}>
          <Scene tier={tier} />
        </Suspense>
      )}
      <Overlay />
    </>
  )
}
