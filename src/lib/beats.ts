/**
 * The scroll timeline, in document order.
 *
 * Each id is stamped onto exactly one section as `data-beat`, and the scene's
 * keyframe tables index into this same list. Animation beats are therefore
 * anchored to real layout: when a section is centred in the viewport its
 * tableau is exactly composed, no matter how tall the sections turn out to be.
 *
 * Adding a section means adding an id here, a `data-beat` on the markup, and a
 * keyframe at that index in every table.
 */
const WORK = ['work-1', 'work-2', 'work-3', 'work-4', 'work-5'] as const

export const BEATS = [
  'hero',
  'services',
  ...WORK,
  'contact',
  'warp',
] as const

export type BeatId = (typeof BEATS)[number]

/** One beat per project section, in order. Drives the markup and the keyframes. */
export const WORK_BEATS: readonly BeatId[] = WORK

export const BEAT_COUNT = BEATS.length
export const LAST_BEAT = BEAT_COUNT - 1

export function beatIndex(id: BeatId): number {
  return BEATS.indexOf(id)
}
