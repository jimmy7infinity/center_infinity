import { Suspense, lazy, useEffect, useState } from 'react'
import { Overlay } from './ui/Overlay'
import { StaticBackdrop } from './ui/StaticBackdrop'
import { useSmoothScroll } from './lib/scroll'
import { detectQuality, type QualityTier } from './lib/quality'

// The 3D bundle is the heavy part, so it never blocks first paint of the copy.
const Scene = lazy(() =>
  import('./scene/Scene').then((m) => ({ default: m.Scene })),
)

export function App() {
  const [tier, setTier] = useState<QualityTier | null>(null)

  useEffect(() => {
    setTier(detectQuality())
  }, [])

  useSmoothScroll(tier === 'high' || tier === 'medium')

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
