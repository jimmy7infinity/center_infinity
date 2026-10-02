import type { Project, ProjectMedia } from '../content/projects'

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

  return (
    <div className={`color-screen color-screen--${variant} emit-area`}>
      <div key={project.name} className="color-screen__content">
        {project.image ? (
          <img
            className="color-screen__shot"
            src={project.image}
            alt={`${project.name} — live product`}
            draggable={false}
          />
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
