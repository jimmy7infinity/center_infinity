/**
 * The panel before its first page: bare. It leaves inside the entry refresh,
 * so it simply isn't there when the panel redraws.
 */
export function LoadingScreen({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[80] bg-void" aria-busy aria-label="Loading" role="status" />
  )
}
