import { BrandMark } from './BrandMark'

/**
 * The panel before its first page: bare, with the mark. It leaves inside the
 * entry refresh, so it simply isn't there when the panel redraws.
 */
export function LoadingScreen({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-void"
      aria-busy
      role="status"
    >
      <BrandMark size="md" className="mb-5" decorative />
      <p className="ink-label">
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
