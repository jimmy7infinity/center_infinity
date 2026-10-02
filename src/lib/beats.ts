/**
 * The pages of the display, in order. One is shown at a time; the work pages
 * map one-to-one onto `projects`.
 */
const WORK = [
  'work-1',
  'work-2',
  'work-3',
  'work-4',
  'work-5',
  'work-6',
  'work-7',
] as const

export const BEATS = ['hero', 'services', ...WORK, 'contact'] as const

export type BeatId = (typeof BEATS)[number]

/** One page per project, in order. */
export const WORK_BEATS: readonly BeatId[] = WORK

export const BEAT_COUNT = BEATS.length
export const LAST_BEAT = BEAT_COUNT - 1
