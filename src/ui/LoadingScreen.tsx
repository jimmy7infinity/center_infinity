/**
 * The panel before its first page. It leaves inside the entry refresh, so the
 * type is simply gone when the panel redraws.
 */
export function LoadingScreen({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-void"
      aria-busy
      role="status"
    >
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
