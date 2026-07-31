import { useEffect, useState } from 'react'
import { BEATS, type BeatId } from '../lib/beats'
import {
  getSectionIndex,
  goToSectionIndex,
  subscribeSection,
} from '../lib/scroll'
import { useWarpHide } from './useWarpHide'

const LABELS: Record<BeatId, string> = {
  hero: 'Intro',
  services: 'Services',
  'work-1': 'Work 1',
  'work-2': 'Work 2',
  'work-3': 'Work 3',
  'work-4': 'Work 4',
  'work-5': 'Work 5',
  contact: 'Contact',
  warp: 'Loop',
}

function Dot({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-full py-1 pl-1 pr-2 text-left"
      aria-current={active ? 'true' : undefined}
      aria-label={`Go to ${label}`}
    >
      <span
        className={`block h-1.5 w-1.5 shrink-0 rounded-full bg-regolith transition-[opacity,transform,background-color] duration-300 ${
          active
            ? 'scale-110 bg-glow opacity-70'
            : 'scale-100 opacity-20 group-hover:opacity-40'
        }`}
      />
      <span
        className={`max-w-[5.5rem] text-[11px] font-normal tracking-wide text-regolith transition-opacity duration-300 ${
          active ? 'opacity-55' : 'opacity-0 group-hover:opacity-40'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

/** Right-rail dots — jump any beat; wheel only steps ±1. Hidden during warp. */
export function SectionNav() {
  const [active, setActive] = useState(() => getSectionIndex())
  const hidden = useWarpHide()

  useEffect(() => subscribeSection(setActive), [])

  return (
    <div
      className={`transition-opacity duration-300 ${
        hidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Mobile: bottom pill strip */}
      <nav
        className="pointer-events-none fixed bottom-5 left-0 right-0 z-[55] flex justify-center px-4 md:hidden"
        aria-label="Section navigation"
        aria-hidden={hidden}
      >
        <ul className="pointer-events-auto flex max-w-full gap-2.5 overflow-x-auto rounded-full border border-rim/8 bg-void/55 px-3.5 py-2.5 backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BEATS.map((id, index) => {
            const isActive = active === index
            return (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => goToSectionIndex(index)}
                  className={`block h-1.5 w-1.5 rounded-full bg-regolith transition-[opacity,transform,background-color] duration-300 ${
                    isActive
                      ? 'scale-110 bg-glow opacity-70'
                      : 'opacity-20 hover:opacity-40'
                  }`}
                  aria-label={`Go to ${LABELS[id]}`}
                  aria-current={isActive ? 'true' : undefined}
                />
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Desktop: vertical rail */}
      <nav
        className="pointer-events-none fixed right-4 top-1/2 z-[55] hidden max-h-[70vh] -translate-y-1/2 overflow-y-auto md:block lg:right-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        aria-label="Section navigation"
        aria-hidden={hidden}
      >
        <ul className="pointer-events-auto flex flex-col gap-2.5 pr-1">
          {BEATS.map((id, index) => (
            <li key={id}>
              <Dot
                active={active === index}
                label={LABELS[id]}
                onClick={() => goToSectionIndex(index)}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
