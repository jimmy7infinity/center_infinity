import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowIcon } from './icons'
import { StatusLight } from './StatusLight'
import {
  TECHNICAL_LEAVES,
  technicalLeafLabel,
  type TechnicalLeafId,
  type TechnicalRead,
} from '../content/technical'
import { projects, type Project } from '../content/projects'
import './dossier.css'

const TURN_MS = 2200
const LEAF_SWAP_MS = 130
const LEAF_MS = 440
const TURN_EASE = 'cubic-bezier(0.45, 0.02, 0.2, 1)'

type TurnPhase = 'idle' | 'measure' | 'arm' | 'done'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function ClientFace({ project }: { project: Project }) {
  return (
    <>
      <p className="ink-label mt-4 normal-case tracking-[0.04em]">{project.role}</p>
      <p className="ink-body mt-6 max-w-xl">{project.description}</p>
      {project.highlights.length > 0 && (
        <ul className="mt-6 border-t border-rule">
          {project.highlights.map((highlight) => (
            <li
              key={highlight}
              className="border-b border-rule py-2.5 text-[0.8125rem] text-rim"
            >
              {highlight}
            </li>
          ))}
        </ul>
      )}
      <p className="ink-label mt-5 normal-case tracking-[0.04em]">
        {project.stack.join('  ·  ')}
      </p>
      {project.href && (
        <a
          href={project.href}
          target="_blank"
          rel="noopener noreferrer"
          className="ink-link ink-label mt-6 inline-flex items-center gap-2.5 text-rim"
        >
          View project
          <ArrowIcon className="h-3.5 w-3.5" />
        </a>
      )}
    </>
  )
}

function LeafBody({ read, id }: { read: TechnicalRead; id: TechnicalLeafId }) {
  switch (id) {
    case 'abstract':
      return (
        <dl className="dossier__abstract">
          <div>
            <dt className="ink-label">What</dt>
            <dd className="ink-body">{read.abstract.what}</dd>
          </div>
          <div>
            <dt className="ink-label">Why</dt>
            <dd className="ink-body">{read.abstract.why}</dd>
          </div>
          <div>
            <dt className="ink-label">How</dt>
            <dd className="ink-body">{read.abstract.how}</dd>
          </div>
        </dl>
      )
    case 'shape':
    case 'decisions':
    case 'boundaries':
      return (
        <>
          <pre className="dossier__code">{read[id].code}</pre>
          <p className="ink-body mt-4">{read[id].note}</p>
        </>
      )
    default: {
      const exhaustive: never = id
      throw new Error(`Unhandled technical leaf: ${exhaustive}`)
    }
  }
}

function BuiltFace({
  read,
  leaf,
  reprinting,
  onLeaf,
}: {
  read: TechnicalRead
  leaf: number
  reprinting: boolean
  onLeaf: (next: number) => void
}) {
  const id = TECHNICAL_LEAVES[leaf] ?? 'abstract'
  const label = technicalLeafLabel(id)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onLeaf(leaf + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onLeaf(leaf - 1)
    }
  }

  return (
    <div className="dossier__built" onKeyDown={onKeyDown}>
      <div className={`dossier__sheet${reprinting ? ' is-reprinting' : ''}`}>
        <p className="ink-label mb-4">
          {label}
          <span className="tracking-normal"> · </span>
          <span className="tabular-nums">
            {leaf + 1} / {TECHNICAL_LEAVES.length}
          </span>
        </p>
        <LeafBody read={read} id={id} />
      </div>
      <div className="dossier__pager">
        <button
          type="button"
          className="dossier__step ink-link ink-label"
          disabled={leaf === 0 || reprinting}
          onClick={() => onLeaf(leaf - 1)}
        >
          Prev
        </button>
        <button
          type="button"
          className="dossier__step ink-link ink-label"
          disabled={leaf === TECHNICAL_LEAVES.length - 1 || reprinting}
          onClick={() => onLeaf(leaf + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

function FaceHeader({
  project,
  built,
  onToggle,
  showToggle,
}: {
  project: Project
  built: boolean
  onToggle: () => void
  showToggle: boolean
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="ink-label tabular-nums">
          Work {project.index} / {String(projects.length).padStart(2, '0')}
        </span>
        <StatusLight status={project.status} />
        {showToggle ? (
          <button
            type="button"
            className="ink-chip ml-auto inline-flex items-center gap-2"
            aria-expanded={built}
            onClick={onToggle}
          >
            <span aria-hidden="true">{'</>'}</span>
            {built ? 'Overview' : "How it's built"}
          </button>
        ) : null}
      </div>
      <h2 className="ink-title">{project.name}</h2>
      <p className="ink-lede mt-2">{project.tagline}</p>
    </div>
  )
}

/** Client breakdown, or the technical dossier behind one cube turn. */
export function ProjectDossier({
  project,
  active,
}: {
  project: Project
  active: boolean
}) {
  const read = project.technical
  const [built, setBuilt] = useState(false)
  const [phase, setPhase] = useState<TurnPhase>('idle')
  const [leaf, setLeaf] = useState(0)
  const [reprinting, setReprinting] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cubeRef = useRef<HTMLDivElement>(null)
  const pendingFace = useRef(false)
  const halfRef = useRef(0)
  const heightRef = useRef(0)
  const turnToken = useRef(0)
  const turnTimer = useRef(0)
  const leafTimer = useRef(0)
  const leafEndTimer = useRef(0)

  const turning = phase !== 'idle'

  function clearCubeMotion() {
    const viewport = viewportRef.current
    const cube = cubeRef.current
    if (viewport) viewport.style.height = ''
    if (!cube) return
    cube.style.transition = 'none'
    cube.style.transform = ''
  }

  useEffect(() => {
    return () => {
      window.clearTimeout(turnTimer.current)
      window.clearTimeout(leafTimer.current)
      window.clearTimeout(leafEndTimer.current)
    }
  }, [])

  useEffect(() => {
    if (active) return
    window.clearTimeout(turnTimer.current)
    window.clearTimeout(leafTimer.current)
    window.clearTimeout(leafEndTimer.current)
    turnToken.current += 1
    clearCubeMotion()
    setBuilt(false)
    setPhase('idle')
    setLeaf(0)
    setReprinting(false)
  }, [active])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const cube = cubeRef.current
    if (!viewport || !cube) return

    if (phase === 'measure') {
      halfRef.current = viewport.offsetWidth / 2
      heightRef.current = viewport.offsetHeight
      viewport.style.setProperty('--dossier-half', `${halfRef.current}px`)
      setPhase('arm')
      return
    }

    if (phase === 'arm') {
      const half = halfRef.current
      const token = turnToken.current
      const next = pendingFace.current
      viewport.style.height = `${heightRef.current}px`
      // Snap to the pose already on screen. A transition from a flat
      // transform blends into a shove; only the quarter turn should move.
      cube.style.transition = 'none'
      cube.style.transform = built
        ? `translateZ(${-half}px) rotateY(-90deg)`
        : `translateZ(${-half}px)`
      cube.getBoundingClientRect()
      cube.style.transition = `transform ${TURN_MS}ms ${TURN_EASE}`
      cube.style.transform = next
        ? `translateZ(${-half}px) rotateY(-90deg)`
        : `translateZ(${-half}px)`

      const finish = (event?: TransitionEvent) => {
        if (token !== turnToken.current) return
        if (event && (event.target !== cube || event.propertyName !== 'transform')) return
        window.clearTimeout(turnTimer.current)
        cube.removeEventListener('transitionend', finish)
        setPhase('done')
      }
      cube.addEventListener('transitionend', finish)
      // Fallback only. Clearing this if the effect re-runs keeps it from
      // cutting the turn short, which reads as a jump at the end.
      turnTimer.current = window.setTimeout(() => finish(), TURN_MS + 400)
      return () => {
        window.clearTimeout(turnTimer.current)
        cube.removeEventListener('transitionend', finish)
      }
    }

    if (phase === 'done') {
      clearCubeMotion()
      setBuilt(pendingFace.current)
      setPhase('idle')
    }
  }, [phase, built])

  function toggle() {
    if (phase !== 'idle') return
    const next = !built
    if (prefersReducedMotion()) {
      setBuilt(next)
      return
    }
    pendingFace.current = next
    turnToken.current += 1
    setPhase('measure')
  }

  function goLeaf(next: number) {
    if (reprinting) return
    if (next < 0 || next >= TECHNICAL_LEAVES.length || next === leaf) return
    if (prefersReducedMotion()) {
      setLeaf(next)
      return
    }
    setReprinting(true)
    leafTimer.current = window.setTimeout(() => setLeaf(next), LEAF_SWAP_MS)
    leafEndTimer.current = window.setTimeout(() => setReprinting(false), LEAF_MS)
  }

  if (!read) {
    return (
      <>
        <FaceHeader
          project={project}
          built={false}
          onToggle={toggle}
          showToggle={false}
        />
        <ClientFace project={project} />
      </>
    )
  }

  const frontLocked = built || turning
  const backLocked = !built || turning

  return (
    <div
      ref={viewportRef}
      className={`dossier__viewport${phase === 'arm' ? ' is-3d' : ''}`}
    >
      <div
        ref={cubeRef}
        className={`dossier__cube${built ? ' is-built' : ''}`}
      >
        <div
          className="dossier__face dossier__face--front"
          inert={frontLocked}
          aria-hidden={frontLocked}
        >
          <div className="dossier__face-inner">
            <FaceHeader
              project={project}
              built={false}
              onToggle={toggle}
              showToggle
            />
            <ClientFace project={project} />
          </div>
        </div>
        <div
          className="dossier__face dossier__face--back"
          inert={backLocked}
          aria-hidden={backLocked}
        >
          <div className="dossier__face-inner dossier__face-inner--built">
            <FaceHeader project={project} built onToggle={toggle} showToggle />
            <BuiltFace
              read={read}
              leaf={leaf}
              reprinting={reprinting}
              onLeaf={goLeaf}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
