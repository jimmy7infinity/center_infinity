import { useCallback, useEffect, useState } from 'react'

type EnterGateProps = {
  onEnter: () => void
}

export function EnterGate({ onEnter }: EnterGateProps) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  const trigger = useCallback(() => {
    if (fading) return
    setFading(true)
    onEnter()
    window.setTimeout(() => setVisible(false), 300)
  }, [fading, onEnter])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        trigger()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trigger])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="Enter site"
      onClick={trigger}
      className={`fixed inset-0 z-30 flex cursor-pointer flex-col items-center justify-center border-0 bg-[#121214] transition-opacity duration-300 ${
        fading ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <img
        src="/logo.png"
        alt=""
        className="w-[min(42vw,220px)] opacity-90"
        draggable={false}
      />
      <span className="label mt-8">click to enter</span>
    </button>
  )
}
