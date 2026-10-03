import { useState } from 'react'
import {
  ArrowIcon,
  GitHubIcon,
  InstagramIcon,
  SERVICE_ICONS,
  XIcon,
} from './icons'
import { BriefDialog } from './BriefDialog'
import { ColorScreen } from './ColorScreen'
import { Emitter } from './StatusLight'
import { ProjectDossier } from './ProjectDossier'
import {
  BUILD_OPTIONS,
  services,
  type Project,
} from '../content/projects'

/** The scene is the cover; the copy stays for readers and search. */
export function CoverPage() {
  return (
    <div className="sr-only">
      <h1>Center Infinity</h1>
      <p>A product studio. We design and ship full-stack products.</p>
    </div>
  )
}

export function StudioPage() {
  return (
    <div className="ink-page__inner">
      <p className="ink-label mb-6">Studio</p>
      <h2 className="ink-title max-w-3xl">
        We design and ship the product — the interface, the systems behind it,
        and the deploy.
      </h2>
      <p className="ink-lede mt-4 max-w-2xl">
        Founders leave with something that runs, not a deck about it.
      </p>

      <ul className="mt-10 grid border-t border-rule sm:grid-cols-2 sm:gap-x-10">
        {services.map((service, i) => {
          const Icon = SERVICE_ICONS[service.icon]
          return (
            <li key={service.title} className="border-b border-rule py-5">
              <div className="ink-label mb-3 flex items-center gap-3">
                <span className="tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <Icon className="h-3.5 w-3.5 text-glow" />
              </div>
              <h3 className="text-[0.9375rem] font-medium text-rim">
                {service.title}
              </h3>
              <p className="ink-body mt-1.5 max-w-md">{service.detail}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ProjectPage({
  project,
  active,
}: {
  project: Project
  active: boolean
}) {
  return (
    <div
      className={`ink-page__inner ink-page__inner--split ${
        project.technical ? 'ink-page__inner--dossier' : ''
      } ${project.placeholder ? 'opacity-60' : ''}`}
    >
      <ProjectDossier project={project} active={active} />
      <ColorScreen project={project} variant="inline" />
    </div>
  )
}

export function ContactPage() {
  const [interests, setInterests] = useState<readonly string[]>([])
  const [briefOpen, setBriefOpen] = useState(false)

  const toggleInterest = (option: string) =>
    setInterests((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    )

  return (
    <div className="ink-page__inner">
      <p className="ink-label mb-6 flex items-center gap-2.5">
        <Emitter breathe />
        Taking work
      </p>
      <h2 className="ink-title max-w-2xl">Tell us what needs to exist.</h2>

      <p className="ink-label mt-8 mb-3">What are you building?</p>
      <div className="flex max-w-2xl flex-wrap gap-2">
        {BUILD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className="ink-chip"
            aria-pressed={interests.includes(option)}
            onClick={() => toggleInterest(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="button" className="ink-cta" onClick={() => setBriefOpen(true)}>
          Start a brief
          <ArrowIcon className="h-3.5 w-3.5" />
        </button>
        <a
          href="mailto:hello@centerinfinity.com"
          className="ink-link break-all font-mono text-[0.8125rem] text-regolith"
        >
          or hello@centerinfinity.com
        </a>
      </div>

      <BriefDialog
        open={briefOpen}
        interests={interests}
        onToggleInterest={toggleInterest}
        onClose={() => setBriefOpen(false)}
      />
    </div>
  )
}

const SOCIALS = [
  { label: 'X', href: 'https://x.com/jimmy7infinity', Icon: XIcon },
  { label: 'GitHub', href: 'https://github.com/jimmy7infinity', Icon: GitHubIcon },
  {
    label: 'Instagram',
    href: 'https://instagram.com/jimmy7infinity',
    Icon: InstagramIcon,
  },
] as const

/** The contact page's colophon: a strip of panel standing over the page. */
export function ContactFooter() {
  return (
    <footer className="ink-footer ink-label">
      <span className="flex items-center gap-4">
        <span>
          <span className="hidden sm:inline">Center Infinity </span>
          <span className="text-regolith/60">by Jimmy Infinity</span>
        </span>
        <span className="flex items-center gap-1">
          {SOCIALS.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="ink-footer__social"
              aria-label={label}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </a>
          ))}
        </span>
      </span>
      <span className="hidden sm:inline">Koh Phangan, Thailand</span>
    </footer>
  )
}
