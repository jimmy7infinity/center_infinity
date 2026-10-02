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
      className={`ink-mark ${SIZE_CLASS[size]} w-auto ${className}`}
      draggable={false}
    />
  )
}
