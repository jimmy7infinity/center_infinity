import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Overlay } from './ui/Overlay'
import { LoadingScreen } from './ui/LoadingScreen'
import { enterSite, usePageInput } from './lib/pages'
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
  usePageInput(entered)
  usePointerTracking(webgl && entered)

  const onSceneReady = useCallback(() => {
    setSceneReady(true)
  }, [])

  // The first page draws once the scene has a frame — the static panel needs none.
  useEffect(() => {
    if (tier === null || entered) return
    if (webgl && !sceneReady) return
    enterSite(() => setEntered(true))
  }, [tier, webgl, sceneReady, entered])

  return (
    <>
      <LoadingScreen visible={!entered} />
      {webgl ? (
        <Suspense fallback={null}>
          <Scene tier={tier} onReady={onSceneReady} />
        </Suspense>
      ) : null}
      <Overlay showChrome={entered} />
    </>
  )
}
