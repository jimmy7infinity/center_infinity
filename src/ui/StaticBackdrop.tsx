/**
 * Shown on low-capability devices, with reduced-motion enabled, and as the
 * Suspense fallback while the 3D chunk loads. Pure CSS: no WebGL, no payload.
 */
export function StaticBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 bg-void" aria-hidden>
      <div
        className="absolute top-1/2 left-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{
          background:
            'radial-gradient(circle at 32% 24%, rgba(200,212,235,0.30) 0%, rgba(140,150,170,0.10) 34%, rgba(0,0,0,0) 62%)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 h-[62vmin] w-[62vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(circle at 38% 28%, rgba(210,222,245,0.34) 0%, rgba(130,140,160,0.09) 40%, rgba(0,0,0,0) 66%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.72) 100%)',
        }}
      />
    </div>
  )
}
