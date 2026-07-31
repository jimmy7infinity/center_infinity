import { BrandMark } from './BrandMark'

/**
 * Visible from first paint until the WebGL scene is ready to start the warp.
 * Keeps the page from reading as frozen during the silent load gap.
 */
export function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center bg-void transition-opacity duration-500 ${
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!visible}
      aria-busy={visible}
      role="status"
    >
      <BrandMark size="lg" className="mb-6 opacity-95" decorative />
      <p className="label text-regolith">
        Loading
        <span className="loading-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    </div>
  )
}
