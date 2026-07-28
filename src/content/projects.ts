export type Project = {
  index: string
  name: string
  tagline: string
  description: string
  stack: string[]
  status: string
  href?: string
}

export const projects: Project[] = [
  {
    index: '01',
    name: 'HireLoop',
    tagline: 'AI job matching that explains itself',
    description:
      'A ranking engine that reads intent from a search and scores real job listings against it, with the reasoning surfaced instead of hidden. Built as a pnpm monorepo and held to a 24-case behavioural end-to-end suite.',
    stack: ['React', 'TypeScript', 'Express', 'Playwright', 'Vitest'],
    status: 'Beta',
  },
  {
    index: '02',
    name: 'Dispose',
    tagline: 'A digital disposable camera for real occasions',
    description:
      'Guests shoot a shared roll on their phones and nobody sees a frame until the host develops it. Direct signed uploads to object storage, host authentication, and a deliberately limited shot count.',
    stack: ['Next.js', 'MongoDB', 'Cloudflare R2', 'Railway'],
    status: 'Shipping',
  },
  {
    index: '03',
    name: 'Locus',
    tagline: 'Long-stay rentals, booked inside Telegram',
    description:
      'A Telegram MiniApp ecosystem for long-term rentals on Koh Phangan: a booking app for tenants, a manager app for owners, and a FastAPI service handling viewings, contracts, and split payments.',
    stack: ['Next.js', 'FastAPI', 'MongoDB', 'Stripe', 'Cloudinary'],
    status: 'Demo',
  },
]

export const services = [
  'Full-stack product development',
  'Booking & marketplace platforms',
  'AI features that ship',
  'Interactive & 3D web',
]
