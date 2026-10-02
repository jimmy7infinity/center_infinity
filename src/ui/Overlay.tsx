import { useEffect, useRef, useSyncExternalStore } from 'react'
import { StatusBar } from './StatusBar'
import { PageNav } from './PageNav'
import { InkPhotoFilter } from './InkPhoto'
import { ColorScreen } from './ColorScreen'
import {
  ContactFooter,
  CoverPage,
  ContactPage,
  ProjectPage,
  StudioPage,
} from './Pages'
import { GameHud } from './GameHud'
import { EmitterLight } from './EmitterLight'
import { WarpMesh } from './WarpMesh'
import { projects } from '../content/projects'
import { BEATS, WORK_BEATS, type BeatId } from '../lib/beats'
import { getPageIndex, subscribePage } from '../lib/pages'

if (projects.length !== WORK_BEATS.length) {
  throw new Error(
    `Work pages (${WORK_BEATS.length}) and visible projects (${projects.length}) must match`,
  )
}

function projectFor(beat: BeatId) {
  const project = projects[WORK_BEATS.indexOf(beat)]
  if (!project) throw new Error(`No project for page ${beat}`)
  return project
}

function pageTitle(beat: BeatId) {
  switch (beat) {
    case 'hero':
      return 'Cover'
    case 'services':
      return 'Studio'
    case 'work-1':
    case 'work-2':
    case 'work-3':
    case 'work-4':
    case 'work-5':
      return projectFor(beat).name
    case 'contact':
      return 'Contact'
    default: {
      const exhaustive: never = beat
      throw new Error(`Unhandled page: ${exhaustive}`)
    }
  }
}

const PAGE_TITLES = BEATS.map(pageTitle)

function PageContent({ beat }: { beat: BeatId }) {
  switch (beat) {
    case 'hero':
      return <CoverPage />
    case 'services':
      return <StudioPage />
    case 'work-1':
    case 'work-2':
    case 'work-3':
    case 'work-4':
    case 'work-5':
      return <ProjectPage project={projectFor(beat)} />
    case 'contact':
      return <ContactPage />
    default: {
      const exhaustive: never = beat
      throw new Error(`Unhandled page: ${exhaustive}`)
    }
  }
}

function isWorkBeat(beat: BeatId) {
  return WORK_BEATS.includes(beat)
}

/** The right half of the device, lit only while a project is on screen. */
function DockedColorScreen({ beat }: { beat: BeatId }) {
  if (!isWorkBeat(beat)) return null
  return <ColorScreen project={projectFor(beat)} variant="docked" />
}

/** One page of the display. Long pages scroll inside themselves. */
function Page({
  beat,
  index,
  active,
}: {
  beat: BeatId
  index: number
  active: boolean
}) {
  const ref = useRef<HTMLElement>(null)

  // A page always opens at its top, like a freshly drawn screen.
  useEffect(() => {
    if (active && ref.current) ref.current.scrollTop = 0
  }, [active])

  return (
    <section
      ref={ref}
      id={beat}
      className={`ink-page${isWorkBeat(beat) ? ' ink-page--split' : ''}${
        beat === 'contact' ? ' ink-page--footed' : ''
      }`}
      hidden={!active}
      aria-label={PAGE_TITLES[index]}
      data-page-scroll
    >
      <PageContent beat={beat} />
    </section>
  )
}

function usePageIndex() {
  return useSyncExternalStore(subscribePage, getPageIndex)
}

/** The e-ink display: status bar, the page on screen, and the page footer. */
export function Overlay({ showChrome = true }: { showChrome?: boolean }) {
  const index = usePageIndex()

  return (
    <>
      <InkPhotoFilter />
      {/* Copy sits under the debris canvas (z-40) so comets cross the type. */}
      <main className="game-veil fixed inset-0 z-10">
        {BEATS.map((beat, i) => (
          <Page
            key={beat}
            beat={beat}
            index={i}
            active={i === index}
          />
        ))}
      </main>
      <DockedColorScreen beat={BEATS[index]} />
      {/* Chrome above the debris canvas so controls stay clickable. */}
      {showChrome ? (
        <div className="game-veil pointer-events-none fixed inset-0 z-[97]">
          <StatusBar title={PAGE_TITLES[index]} />
          {BEATS[index] === 'contact' ? <ContactFooter /> : null}
          <PageNav index={index} titles={PAGE_TITLES} />
        </div>
      ) : null}
      <GameHud />
      <WarpMesh />
      <div className="refresh-veil" aria-hidden />
      <EmitterLight />
    </>
  )
}
