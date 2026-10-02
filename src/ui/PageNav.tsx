import { ArrowIcon } from './icons'
import { BEAT_COUNT, LAST_BEAT } from '../lib/beats'
import { goToPage } from '../lib/pages'

/**
 * The panel's footer: where you are, every page as one segment, and the turn.
 * Segments are flat pigment — the filled one is the page on screen.
 */
export function PageNav({
  index,
  titles,
}: {
  index: number
  titles: readonly string[]
}) {
  const atEnd = index === LAST_BEAT

  return (
    <nav className="ink-pagenav ink-label pointer-events-auto" aria-label="Pages">
      <span className="tabular-nums text-rim">
        {String(index + 1).padStart(2, '0')}
        <span className="text-regolith"> / {String(BEAT_COUNT).padStart(2, '0')}</span>
      </span>

      <ol className="ink-pagenav__track">
        {titles.map((title, i) => (
          <li key={title} className="flex-1">
            <button
              type="button"
              className="ink-pagenav__segment"
              aria-label={title}
              aria-current={i === index ? 'page' : undefined}
              onClick={() => goToPage(i)}
            >
              <span className={i === index ? 'is-active' : ''} />
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="ink-link inline-flex items-center gap-2"
        onClick={() => goToPage(index + 1)}
      >
        {atEnd ? 'Cover' : 'Next'}
        <ArrowIcon
          className={`h-3.5 w-3.5 ${atEnd ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>
    </nav>
  )
}
