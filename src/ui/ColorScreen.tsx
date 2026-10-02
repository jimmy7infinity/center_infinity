import { useEffect, useState, useSyncExternalStore } from 'react'
import { projects, type Project, type ProjectMedia } from '../content/projects'
import { BEATS, WORK_BEATS, type BeatId } from '../lib/beats'
import { getPageIndex, subscribePage } from '../lib/pages'
import { webglAvailable } from '../lib/quality'
import { PlanetScreen } from './PlanetScreen'

/** A still for the top of the screen when a project has no hero capture yet. */
function firstStill(media: readonly ProjectMedia[]) {
  for (const item of media) {
    switch (item.kind) {
      case 'image':
        return item.src
      case 'video':
        return item.poster
      default: {
        const exhaustive: never = item
        throw new Error(`Unhandled media: ${JSON.stringify(exhaustive)}`)
      }
    }
  }
  return undefined
}

function MediaTile({ media }: { media: ProjectMedia }) {
  switch (media.kind) {
    case 'image':
      return (
        <img
          className="color-screen__media"
          src={media.src}
          alt={media.alt}
          draggable={false}
        />
      )
    case 'video':
      return (
        <video
          className="color-screen__media"
          src={media.src}
          poster={media.poster}
          aria-label={media.alt}
          autoPlay
          muted
          loop
          playsInline
        />
      )
    default: {
      const exhaustive: never = media
      throw new Error(`Unhandled media: ${JSON.stringify(exhaustive)}`)
    }
  }
}

const WIDE_QUERY = '(min-width: 1024px)'

function useWideScreen() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY)
    const onChange = () => setWide(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return wide
}

function usePageIndex() {
  return useSyncExternalStore(subscribePage, getPageIndex)
}

function isWorkBeat(beat: BeatId) {
  return WORK_BEATS.includes(beat)
}

/**
 * One canvas only: the docked screen on a wide window, the inline one on a
 * narrow one, and only while this project is the page on screen.
 */
function useShowPlanets(project: Project, variant: 'docked' | 'inline') {
  const index = usePageIndex()
  const wide = useWideScreen()
  const [canDraw] = useState(() => webglAvailable())
  if (project.screen !== 'planets' || !canDraw) return false

  const beat = BEATS[index]
  if (!beat || !isWorkBeat(beat)) return false
  if (projects[WORK_BEATS.indexOf(beat)] !== project) return false
  return wide ? variant === 'docked' : variant === 'inline'
}

/**
 * A colour display set into the device beside the e-ink panel. It is lit, not
 * printed: it sits above the panel's texture and room light, and casts the same
 * calm white onto the e-ink whatever it shows. Page turns cut it like an LCD —
 * only the e-ink side does the refresh flash.
 */
export function ColorScreen({
  project,
  variant,
}: {
  project: Project
  /** `docked` fills the right half of the device; `inline` sits in the page on narrow screens. */
  variant: 'docked' | 'inline'
}) {
  const media = project.media ?? []
  const planets = useShowPlanets(project, variant)
  const [canDraw] = useState(() => webglAvailable())
  const [spin] = useState(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  // Narrow screens hide the gallery, so the first still stands in for a hero.
  const hero =
    project.screen === 'planets'
      ? canDraw
        ? undefined
        : firstStill(media)
      : (project.image ?? (variant === 'inline' ? firstStill(media) : undefined))

  return (
    <div className={`color-screen color-screen--${variant} emit-area`}>
      <div key={project.name} className="color-screen__content">
        {planets ? (
          <PlanetScreen spin={spin} />
        ) : hero ? (
          <img
            className="color-screen__shot"
            src={hero}
            alt={`${project.name} — live product`}
            draggable={false}
          />
        ) : project.screen !== 'planets' && media.length > 0 ? (
          <div className="color-screen__shot color-screen__empty ink-label">Media</div>
        ) : null}
        <div
          className="color-screen__gallery"
          data-count={Math.min(media.length, 4)}
        >
          {media.length > 0 ? (
            media.map((item) => <MediaTile key={item.src} media={item} />)
          ) : (
            <div className="color-screen__empty ink-label">Media</div>
          )}
        </div>
      </div>
    </div>
  )
}
