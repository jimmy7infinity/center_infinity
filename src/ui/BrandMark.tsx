type MarkSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<MarkSize, string> = {
  xs: 'h-3.5 md:h-4',
  sm: 'h-5 md:h-6',
  md: 'h-7 md:h-8',
  lg: 'h-10 md:h-12',
}

type BrandMarkProps = {
  size?: MarkSize
  className?: string
  /** Decorative when a nearby heading already names the brand. */
  decorative?: boolean
}

/** The crescent mark — the thing visitors should remember. */
export function BrandMark({
  size = 'sm',
  className = '',
  decorative = true,
}: BrandMarkProps) {
  return (
    <img
      src={`/logo.png?v=${__BRAND_MARK_V__}`}
      alt={decorative ? '' : 'Center Infinity'}
      className={`${SIZE_CLASS[size]} w-auto opacity-90 ${className}`}
      draggable={false}
    />
  )
}

type BrandStampProps = {
  /** Mono eyebrow that rides next to the mark. */
  label?: string
  size?: MarkSize
  className?: string
}

/**
 * Quiet brand stamp for section and project openings — mark first, then the
 * label. Keeps the logo in the reading path without turning into chrome.
 */
export function BrandStamp({
  label,
  size = 'xs',
  className = '',
}: BrandStampProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandMark size={size} />
      {label ? <p className="label">{label}</p> : null}
    </div>
  )
}
