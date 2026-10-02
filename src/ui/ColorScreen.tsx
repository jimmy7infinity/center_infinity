import { useEffect, useState } from 'react'
import { type Project, type ProjectMedia } from '../content/projects'

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

const WIDE_ASPECT = '(min-aspect-ratio: 2/1)'

/** A 16:10 capture letterboxes once the window is about twice as wide as it is tall. */
function useWideAspect() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_ASPECT).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(WIDE_ASPECT)
    const onChange = () => setWide(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return wide
}

/**
 * A colour display set into the device beside the e-ink panel. It is lit, not
 * printed: it sits above the panel's texture and room light, and casts the same
 * calm white onto the e-ink whatever it shows. Page turns cut it like an LCD —
 * only the e-ink side does the refresh flash.
 *
 * A project with `screen: 'planets'` draws nothing here. The scene's own shells
 * move into the right half instead.
 */
export function ColorScreen({
  project,
  variant,
}: {
  project: Project
  /** `docked` fills the right half of the device; `inline` sits in the page on narrow screens. */
  variant: 'docked' | 'inline'
}) {
  const wideAspect = useWideAspect()
  if (project.screen === 'planets') return null

  const media = project.media ?? []
  // Narrow screens hide the gallery, so the first still stands in for a hero.
  const hero = project.image ?? (variant === 'inline' ? firstStill(media) : undefined)
  const shot = wideAspect && project.imageWide ? project.imageWide : hero

  return (
    <div className={`color-screen color-screen--${variant} emit-area`}>
      <div key={project.name} className="color-screen__content">
        {shot ? (
          <img
            className="color-screen__shot"
            src={shot}
            alt={`${project.name} — live product`}
            draggable={false}
          />
        ) : media.length > 0 ? (
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
