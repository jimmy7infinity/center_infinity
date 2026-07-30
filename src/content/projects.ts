import type { ServiceIconName } from '../ui/icons'

/**
 * Stage of the work, not a free-text badge. A union keeps the status colour and
 * wording resolved in one exhaustive place instead of drifting per project.
 */
export type ProjectStatus = 'shipping' | 'beta' | 'demo' | 'planned'

export type Project = {
  index: string
  name: string
  tagline: string
  description: string
  /** Short factual phrases, each already supported by the description. */
  highlights: string[]
  /** Domain tags, for scanning the shape of the work without reading it. */
  categories: string[]
  stack: string[]
  status: ProjectStatus
  href?: string
  /**
   * Reserved slot rather than shipped work. Rendered with a visibly provisional
   * treatment so it can't be mistaken for a real case study before it's filled.
   */
  placeholder?: boolean
}

export const projects: Project[] = [
  {
    index: '01',
    name: 'HireLoop',
    tagline: 'AI job matching that explains itself',
    description:
      'A ranking engine that reads intent from a search and scores real job listings against it, with the reasoning surfaced instead of hidden.',
    highlights: [
      'Reasoning surfaced, not hidden',
      'pnpm monorepo',
      '24-case behavioural E2E suite',
    ],
    categories: ['AI', 'Search'],
    stack: ['React', 'TypeScript', 'Express', 'Playwright', 'Vitest'],
    status: 'beta',
  },
  {
    index: '02',
    name: 'Dispose',
    tagline: 'A digital disposable camera for real occasions',
    description:
      'Guests shoot a shared roll on their phones and nobody sees a frame until the host develops it.',
    highlights: [
      'Shared roll, host develops',
      'Direct signed uploads',
      'Deliberately limited shot count',
    ],
    categories: ['Consumer', 'Social'],
    stack: ['Next.js', 'MongoDB', 'Cloudflare R2', 'Railway'],
    status: 'shipping',
  },
  {
    index: '03',
    name: 'Locus',
    tagline: 'Long-stay rentals, booked inside Telegram',
    description:
      'A Telegram MiniApp ecosystem for long-term rentals on Koh Phangan: a booking app for tenants, a manager app for owners, and a service handling the rest.',
    highlights: ['Tenant and manager apps', 'Viewings and contracts', 'Split payments'],
    categories: ['Marketplace', 'Payments'],
    stack: ['Next.js', 'FastAPI', 'MongoDB', 'Stripe', 'Cloudinary'],
    status: 'demo',
  },
  {
    index: '04',
    name: 'Project four',
    tagline: 'Replace with the next case study',
    description:
      'Reserved slot. Swap in the project, the one-line promise, and what it actually does — the scene beat for this section already exists.',
    highlights: [],
    categories: [],
    stack: ['TBC'],
    status: 'planned',
    placeholder: true,
  },
  {
    index: '05',
    name: 'Project five',
    tagline: 'Replace with the next case study',
    description:
      'Reserved slot. Swap in the project, the one-line promise, and what it actually does — the scene beat for this section already exists.',
    highlights: [],
    categories: [],
    stack: ['TBC'],
    status: 'planned',
    placeholder: true,
  },
]

export type Service = {
  icon: ServiceIconName
  title: string
  detail: string
}

export const services: Service[] = [
  {
    icon: 'stack',
    title: 'Full-stack product development',
    detail: 'Design, build, deploy. One team from first sketch to production.',
  },
  {
    icon: 'grid',
    title: 'Booking & marketplace platforms',
    detail: 'Inventory, availability, payments, and the operator tools behind them.',
  },
  {
    icon: 'node',
    title: 'AI features that ship',
    detail: 'Retrieval, ranking, and agents wired into real products — not demos.',
  },
  {
    icon: 'orbit',
    title: 'Interactive & 3D web',
    detail: 'WebGL scenes and motion systems that hold 60fps on a laptop.',
  },
]
