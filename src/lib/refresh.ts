/**
 * E-ink full refresh: the panel inverts, flashes to full pigment, clears to
 * bare panel, then the new page is simply there. The swap happens while the
 * panel is blank, so nothing ever slides or fades between pages.
 *
 * Timings must match the `ink-refresh` keyframes in index.css.
 */
const REFRESH_MS = 440
/** Inside the full-pigment flash — the old page is already gone. */
const SWAP_MS = 130

let pendingSwap: (() => void) | null = null
let swapTimer = 0
let endTimer = 0
let finishCurrent: (() => void) | null = null

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Runs one refresh; `swap` changes what the panel shows. */
export function runRefresh(swap: () => void): Promise<void> {
  // A new refresh supersedes the old one, but the old page change still lands.
  if (pendingSwap) {
    window.clearTimeout(swapTimer)
    const previous = pendingSwap
    pendingSwap = null
    previous()
  }
  window.clearTimeout(endTimer)
  finishCurrent?.()
  finishCurrent = null

  if (prefersReducedMotion()) {
    swap()
    return Promise.resolve()
  }

  const root = document.documentElement
  root.classList.remove('is-refreshing')
  // Restart the keyframes even when refreshes arrive back to back.
  void root.offsetWidth
  root.classList.add('is-refreshing')

  pendingSwap = swap
  swapTimer = window.setTimeout(() => {
    const run = pendingSwap
    pendingSwap = null
    run?.()
  }, SWAP_MS)

  return new Promise((resolve) => {
    finishCurrent = resolve
    endTimer = window.setTimeout(() => {
      root.classList.remove('is-refreshing')
      finishCurrent = null
      resolve()
    }, REFRESH_MS)
  })
}
