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
  /** Who it is for — one clause, scannable. */
  audience: string
  /** What we actually owned. */
  role: string
  /** Short factual phrases, each already supported by the description. */
  highlights: string[]
  /** Domain tags, for scanning the shape of the work without reading it. */
  categories: string[]
  stack: string[]
  status: ProjectStatus
  href?: string
  /** Hero-frame capture of the live product, under /public/projects. */
  image?: string
  /**
   * Reserved slot rather than shipped work. Rendered with a visibly provisional
   * treatment so it can't be mistaken for a real case study before it's filled.
   */
  placeholder?: boolean
}

export const projects: Project[] = [
  {
    index: '01',
    name: 'Center Infinity',
    tagline: 'The studio, as a living scene',
    description:
      'This site. A scroll-locked WebGL field of nested crescents — the mark as a place you can move through — with real DOM copy, a flyer easter egg, and a warp that loops you home.',
    audience: 'Anyone deciding whether we can build something they will remember.',
    role: 'Solo — scene, product, copy',
    highlights: [
      'Scroll-locked 3D composition',
      'Dual-canvas debris over type',
      'This page is the proof',
    ],
    categories: ['Studio', '3D'],
    stack: ['React', 'Three.js', 'R3F', 'TypeScript', 'Vite'],
    status: 'shipping',
    image: '/projects/center-infinity.jpg',
  },
  {
    index: '02',
    name: 'Dispose',
    tagline: 'A digital disposable for nights that will not repeat',
    description:
      'Guests shoot a shared roll on their phones. Nobody sees a frame until the host develops it. Finite shots, no guest accounts, reveal as ceremony — built so the photos stay scarce on purpose.',
    audience: 'Hosts who want the night documented, not performed.',
    role: 'Solo — product, backend, media pipeline',
    highlights: [
      'Shared roll, host develops',
      'Direct signed uploads to R2',
      'Shot count is a hard limit',
    ],
    categories: ['Consumer', 'Social'],
    stack: ['Next.js', 'MongoDB', 'Cloudflare R2', 'Railway'],
    status: 'shipping',
    href: 'https://dispose.up.railway.app/?utm_source=centerinfinity',
    image: '/projects/dispose.jpg',
  },
  {
    index: '03',
    name: 'Boost',
    tagline: 'A persistent AI teammate, not a chat window',
    description:
      'A runtime with rooms, memory, tools, and an approval gate. Boost can research, draft, remember, and hunt roles through a ranking backend — it cannot send mail or act outside the room without a human. Built as a teammate architecture, not a wrapper around one model.',
    audience: 'Small teams who need another pair of hands that stays in the work.',
    role: 'Solo — runtime, channels, skills',
    highlights: [
      'Web room as the home',
      'Approvals before outbound',
      'Job hunt as a skill, not a second app',
    ],
    categories: ['AI', 'Ops'],
    stack: ['TypeScript', 'MongoDB', 'Gemini', 'Kimi', 'MCP'],
    status: 'beta',
    href: 'https://boost360.up.railway.app/?utm_source=centerinfinity',
    image: '/projects/boost.jpg',
  },
  {
    index: '04',
    name: 'Dynasty',
    tagline: 'A persistent world with economic consequence',
    description:
      'A continuous-map game of gathering, building, and long-horizon networks. Play mutates the world; the economy is meant to emerge from desire, scarcity, and interdependence — not a token bolted onto a map. Browser world prototype plus an Unreal 5.8 demonstrator.',
    audience: 'Players who want consequence, not a tile empire.',
    role: 'Solo — design corpus, simulation kernel, world prototype',
    highlights: [
      'Continuous map, not a tile grid',
      'Play as the protocol interface',
      'Browser world + Unreal demonstrator',
    ],
    categories: ['Game', 'World'],
    stack: ['TypeScript', 'Three.js', 'WebGPU', 'Unreal 5.8'],
    status: 'beta',
    image: '/projects/dynasty.jpg',
  },
  {
    index: '05',
    name: 'Studio Eternity',
    tagline: 'Local-first AI media, capability first',
    description:
      'An operator console for image, video, and audio on Apple Silicon. You pick a capability — upscale, generate, edit — not a model brand or a ComfyUI graph. The platform owns the queue, the catalog, and the job; SeedVR2 and ComfyUI stay behind the glass.',
    audience: 'Operators who want 4K output without living in a node graph.',
    role: 'Solo — platform, catalog, console',
    highlights: [
      'Capability-first, not ComfyUI-first',
      'Queue, jobs, health, benchmarks',
      'Swap backends without a UI rewrite',
    ],
    categories: ['AI', 'Media'],
    stack: ['FastAPI', 'React', 'MongoDB', 'ComfyUI', 'SeedVR2'],
    status: 'beta',
    image: '/projects/studio-eternity.jpg',
  },
  {
    index: '06',
    name: 'LookingLocal',
    tagline: 'Koh Phangan, at an easier pace',
    description:
      'A guide that points visitors at local stays, food, and experiences — so the island is used, not extracted. Built as a real listing surface, not a brochure, with the operator tools sitting behind the pretty front.',
    audience: 'Travellers who want the island, and hosts who live there.',
    role: 'Solo — product and platform',
    highlights: [
      'Stays, food, experiences',
      'Operator tools behind the guide',
      'Island-first, not extractive',
    ],
    categories: ['Marketplace', 'Local'],
    stack: ['Next.js', 'FastAPI', 'MongoDB', 'Stripe', 'Cloudinary'],
    status: 'demo',
    href: 'https://lookinglocal.up.railway.app/?utm_source=centerinfinity',
    image: '/projects/lookinglocal.jpg',
  },
  {
    index: '07',
    name: 'Wiktoria Lewandowska',
    tagline: 'A quiet portfolio, built to be read',
    description:
      'A client site for a marketing and media specialist — section-paged, themeable, and fast. Proof we also ship the simple page: type, air, and a CV that does not need a WebGL field to feel finished.',
    audience: 'People who need a professional site that stays out of the way.',
    role: 'Solo — design and build',
    highlights: [
      'Section-paged, not a scroll dump',
      'Mint Grove / Nordic Clay themes',
      'Prerendered for search',
    ],
    categories: ['Client', 'Site'],
    stack: ['React', 'Vite', 'TypeScript', 'Caddy'],
    status: 'shipping',
    href: 'https://wlewandowska.up.railway.app/?utm_source=centerinfinity',
    image: '/projects/wiktoria.jpg',
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
    detail:
      'Interface, API, data, and deploy from one desk. You get a system you can run — not a prototype that needs a second team.',
  },
  {
    icon: 'grid',
    title: 'Booking & marketplace platforms',
    detail:
      'Inventory, availability, payments, and the operator console. Built for the messy day, not the happy-path demo.',
  },
  {
    icon: 'node',
    title: 'AI that belongs in the product',
    detail:
      'Ranking, retrieval, and agents with memory, logs, and a human approval gate. If you cannot see why it decided, it is not done.',
  },
  {
    icon: 'orbit',
    title: 'Interactive & 3D web',
    detail:
      'Scenes that are the product — 60fps, scroll-locked, and designed to be remembered. This site is the working brief.',
  },
]
