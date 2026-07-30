import { useEffect, useState } from 'react'

const PHRASES = [
  'websites',
  'backends',
  'applications',
  'systems',
  'interfaces',
] as const

const TYPE_MS = 58
const DELETE_MS = 36
const HOLD_MS = 1600
const GAP_MS = 320

/**
 * Quiet typewriter under the hero mark. Reduced motion gets the first phrase
 * static — the animation is atmosphere, not information.
 */
export function TypingLine() {
  const [text, setText] = useState<string>(PHRASES[0])
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (reduced) {
      setText(PHRASES[0])
      return
    }

    let phraseIndex = 0
    let charIndex = PHRASES[0].length
    let deleting = false
    let timer = 0

    const tick = () => {
      const phrase = PHRASES[phraseIndex]

      if (!deleting && charIndex === phrase.length) {
        timer = window.setTimeout(() => {
          deleting = true
          tick()
        }, HOLD_MS)
        return
      }

      if (deleting && charIndex === 0) {
        phraseIndex = (phraseIndex + 1) % PHRASES.length
        deleting = false
        timer = window.setTimeout(tick, GAP_MS)
        return
      }

      charIndex += deleting ? -1 : 1
      setText(PHRASES[phraseIndex].slice(0, charIndex))
      timer = window.setTimeout(tick, deleting ? DELETE_MS : TYPE_MS)
    }

    timer = window.setTimeout(tick, HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [reduced])

  return (
    <p
      className="mt-4 font-mono text-[0.6875rem] tracking-wide text-regolith/70 md:text-[0.75rem]"
      aria-live="polite"
    >
      <span className="text-regolith/45">we build:</span>{' '}
      <span className="text-rim/80">{text}</span>
      {!reduced ? (
        <span
          className="hero-caret ml-0.5 inline-block w-[0.55ch] translate-y-px bg-regolith/55"
          aria-hidden
        />
      ) : null}
    </p>
  )
}
