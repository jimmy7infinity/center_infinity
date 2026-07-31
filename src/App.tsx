import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Overlay } from './ui/Overlay'
import { StaticBackdrop } from './ui/StaticBackdrop'
import { LoadingScreen } from './ui/LoadingScreen'
import { enterSite, useSmoothScroll } from './lib/scroll'
import { usePointerTracking } from './lib/pointer'
import { detectQuality, type QualityTier } from './lib/quality'

const Scene = lazy(() =>
  import('./scene/Scene').then((m) => ({ default: m.Scene })),
)

export function App() {
  const [tier, setTier] = useState<QualityTier | null>(null)
  const [entered, setEntered] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)

  useEffect(() => {
    setTier(detectQuality())
  }, [])

  const webgl = tier === 'high' || tier === 'medium'
  useSmoothScroll(webgl, tier !== null)
  usePointerTracking(webgl && entered)

  // Static path — no warp intro; dismiss loader once tier is known.
  useEffect(() => {
    if (tier !== 'static') return
    setSceneReady(true)
    setEntered(true)
  }, [tier])

  const onSceneReady = useCallback(() => {
    setSceneReady(true)
  }, [])

  // Start the warp the moment the scene has drawn — not while the chunk is still loading.
  useEffect(() => {
    if (!webgl || !sceneReady || entered) return
    enterSite()
    setEntered(true)
  }, [webgl, sceneReady, entered])

  const showLoader = tier === null || (webgl && !sceneReady)

  return (
    <>
      <LoadingScreen visible={showLoader} />
      {tier === 'static' || tier === null ? (
        <StaticBackdrop />
      ) : (
        <Suspense fallback={<StaticBackdrop />}>
          <Scene tier={tier} onReady={onSceneReady} />
        </Suspense>
      )}
      {/* Keep copy mounted under the loader so anchors/Lenis measure correctly. */}
      <Overlay showChrome={entered && !showLoader} />
    </>
  )
}
