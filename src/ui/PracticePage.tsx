import { useState } from 'react'
import { ArrowIcon } from './icons'
import { BriefDialog } from './BriefDialog'
import { PracticeCardField } from './PracticeField'
import { Emitter } from './StatusLight'

const STEPS = [
  {
    word: 'Brief',
    detail:
      'You say what needs to exist. We answer with what ships, and what waits.',
  },
  {
    word: 'Build',
    detail: 'The interface, the systems, and the deploy stay in the same hands.',
  },
  {
    word: 'Handoff',
    detail: 'You leave with something running, and with the means to run it.',
  },
] as const

/** How an engagement goes, and the first place a brief can start. */
export function PracticePage() {
  const [interests, setInterests] = useState<readonly string[]>([])
  const [briefOpen, setBriefOpen] = useState(false)

  const toggleInterest = (option: string) =>
    setInterests((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    )

  return (
    <div className="practice">
      <div>
        <p className="ink-label mb-6">Practice</p>
        <p className="ink-lede max-w-xl">
          One desk, from the first conversation to the deploy.
        </p>
      </div>

      <ol className="practice__steps">
        {STEPS.map((step, i) => (
          <li key={step.word} className="practice__step">
            <PracticeCardField index={i} />
            <p className="ink-label practice__index">
              {String(i + 1).padStart(2, '0')}
            </p>
            <h2 className="practice__word">{step.word}</h2>
            <p className="practice__detail">{step.detail}</p>
          </li>
        ))}
      </ol>

      <div className="practice__plate">
        <p className="ink-label flex items-center gap-2.5">
          <Emitter breathe />
          Taking work
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" className="ink-cta" onClick={() => setBriefOpen(true)}>
            Start a brief
            <ArrowIcon className="h-3.5 w-3.5" />
          </button>
          <a
            href="mailto:hello@centerinfinity.com"
            className="ink-link break-all font-mono text-[0.8125rem] text-regolith"
          >
            or hello@centerinfinity.com
          </a>
        </div>
      </div>

      <BriefDialog
        open={briefOpen}
        interests={interests}
        onToggleInterest={toggleInterest}
        onClose={() => setBriefOpen(false)}
      />
    </div>
  )
}
