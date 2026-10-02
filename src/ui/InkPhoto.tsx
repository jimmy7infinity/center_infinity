const FILTER_ID = 'ink-photo'

/** Must match the panel and light pigment in InkEffect and index.css. */
const PANEL = [0x32, 0x32, 0x30] as const
const LIGHT = [0xe2, 0xdf, 0xd8] as const
/** Same ladder as the canvas: six hard levels, eased toward the dark end. */
const LEVELS = 6
const SHADOW_CURVE = 1.75

function channelTable(channel: 0 | 1 | 2) {
  const values: string[] = []
  for (let i = 0; i < LEVELS; i++) {
    const pigment = Math.pow(i / (LEVELS - 1), SHADOW_CURVE)
    const value = PANEL[channel] + (LIGHT[channel] - PANEL[channel]) * pigment
    values.push((value / 255).toFixed(4))
  }
  return values.join(' ')
}

/**
 * Prints images onto the panel: luminance only, posterised to the same pigment
 * levels the scene uses. Mounted once; images opt in by class.
 */
export function InkPhotoFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <filter id={FILTER_ID} colorInterpolationFilters="sRGB">
        <feColorMatrix
          type="matrix"
          values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
        />
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues={channelTable(0)} />
          <feFuncG type="discrete" tableValues={channelTable(1)} />
          <feFuncB type="discrete" tableValues={channelTable(2)} />
        </feComponentTransfer>
      </filter>
    </svg>
  )
}
