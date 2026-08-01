import { useEffect, useRef, useState } from 'react'
import { Reveal } from './Reveal'
import { StatusChip } from './StatusChip'
import { TypingLine } from './TypingLine'
import { BrandMark, BrandStamp } from './BrandMark'
import { ArrowIcon, ChevronDownDoubleIcon, SERVICE_ICONS } from './icons'
import { SectionNav } from './SectionNav'
import { useWarpHide } from './useWarpHide'
import { GameHud } from './GameHud'
import { Achievements } from './Achievements'
import { projects, services } from '../content/projects'
import { WORK_BEATS, type BeatId } from '../lib/beats'
import {
  canEnterGame,
  enterGame,
  getLastGameScore,
  subscribeGameMode,
} from '../lib/gameMode'
import { pointerState } from '../lib/pointer'

const LOGO_TRIPLE_CLICK_MS = 1000
const LOGO_TRIPLE_CLICKS = 3

function Header() {
  const hidden = useWarpHide()
  const [lastScore, setLastScore] = useState(0)

  useEffect(() => {
    return subscribeGameMode(() => setLastScore(getLastGameScore()))
  }, [])

  return (
    <div
      className={`transition-opacity duration-300 ${
        hidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-hidden={hidden}
    >
      {/* Content scrolls under the fixed nav, so it needs a scrim to stay legible. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[15] h-32 bg-gradient-to-b from-void via-void/75 to-transparent"
        aria-hidden
      />
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 md:px-12">
        <a
          href="#top"
          className="relative z-20 flex items-center gap-3"
          aria-label="Center Infinity"
        >
          <BrandMark size="md" decorative />
          <span className="header-mark label hidden text-[0.625rem] tracking-[0.22em] text-rim/80 sm:inline">
            Center Infinity
          </span>
        </a>
        <div className="relative z-20 flex flex-col items-end gap-1">
          <a
            href="#contact"
            className="label transition-colors duration-300 hover:!text-rim"
          >
            Start a project
          </a>
          {lastScore > 0 ? (
            <span className="font-mono text-[0.625rem] tracking-[0.18em] text-regolith/70">
              SCORE {String(lastScore).padStart(4, '0')}
            </span>
          ) : null}
        </div>
      </header>
    </div>
  )
}

/**
 * Plain wordmark in the dark band the crescents leave across the middle.
 * Effects wait for a real display face; typing line stays quiet underneath.
 */
function Hero() {
  const clicksRef = useRef<{ times: number[] }>({ times: [] })

  // Not a <button> — keeps storm space-clicks and avoids focus rings.
  // Hero is select-none; pointer layer clears selection on empty-space mousedown.
  const onMarkClick = () => {
    const now = performance.now()
    const times = clicksRef.current.times.filter(
      (t) => now - t < LOGO_TRIPLE_CLICK_MS,
    )
    times.push(now)
    clicksRef.current.times = times
    if (times.length < LOGO_TRIPLE_CLICKS) return
    clicksRef.current.times = []
    if (!canEnterGame()) return
    // Mark isn't a button, so the click also latches storm spaceClick — clear it.
    pointerState.spaceClick = false
    enterGame('space-flyer')
  }

  return (
    <section
      id="top"
      data-beat={'hero' satisfies BeatId}
      // On landscape the mark sits in the dark band the crescents leave across
      // the middle. On portrait the cluster itself is lifted into the upper half
      // (PORTRAIT_LIFT_FRAMES), so the mark has to follow it up rather than sit
      // dead centre — otherwise it lands under the moons.
      className="relative flex min-h-screen select-none items-start justify-center px-6 pt-[38vh] md:items-center md:pt-0"
    >
      {/* Held at --hero-copy:0 until planets finish arriving, then fades in. */}
      <div className="hero-copy flex w-full justify-center">
        <div className="flex w-full max-w-lg flex-col items-center text-center">
          <div
            className="relative z-[12] mb-5 cursor-pointer"
            onClick={onMarkClick}
          >
            <BrandMark size="lg" className="opacity-95" decorative={false} />
          </div>
          <h1 className="hero-wordmark relative z-[11] text-[clamp(0.95rem,2.2vw,1.35rem)] text-rim [text-shadow:0_0_24px_rgba(14,16,22,0.9),0_1px_2px_rgba(0,0,0,0.8)]">
            CENTER INFINITY
          </h1>
          <TypingLine />
        </div>
      </div>

      <div className="hero-cue pointer-events-none absolute inset-x-0 bottom-3 flex justify-center md:bottom-4">
        <div className="hero-scroll-cue flex flex-col items-center gap-1 text-regolith/45">
          <span className="label text-[0.5625rem] tracking-[0.2em] [text-indent:0.2em]">
            Scroll
          </span>
          <ChevronDownDoubleIcon className="h-3 w-3" />
        </div>
      </div>
    </section>
  )
}

function Services() {
  return (
    <section className="flex min-h-screen items-center px-6 md:px-12">
      <div data-beat={'services' satisfies BeatId} className="w-full max-w-5xl">
        <Reveal>
          <BrandStamp label="What we do" className="mb-6" />
        </Reveal>
        <Reveal delay={80}>
          {/* The positioning line the hero used to carry. */}
          <p className="display mb-14 max-w-2xl text-[clamp(1.5rem,3.4vw,2.5rem)] text-balance-tight">
            Full-stack design and engineering for founders who need the thing to
            actually exist — <span className="text-regolith">not a deck about it.</span>
          </p>
        </Reveal>

        {/* Translucent so the scene still reads through the panel — an opaque
            card here looks like a dashboard dropped on top of the sky. */}
        <ul className="grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 backdrop-blur-md sm:grid-cols-2">
          {services.map((service, i) => {
            const Icon = SERVICE_ICONS[service.icon]
            return (
              <Reveal key={service.title} delay={140 + i * 70}>
                <li className="group h-full bg-void/55 p-6 transition-colors duration-300 hover:bg-void/75 md:p-8">
                  <span className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-glow transition-colors duration-300 group-hover:border-glow/40">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="display text-lg md:text-xl">{service.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-regolith">
                    {service.detail}
                  </p>
                </li>
              </Reveal>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/**
 * One project per full-height section, so exactly one is ever on screen and the
 * scene gets a whole beat to move between them.
 */
function Work() {
  return (
    <div id="work">
      {projects.map((project, i) => (
        <section
          key={project.name}
          className="flex min-h-screen items-center px-6 py-20 md:px-12"
        >
          <div
            data-beat={WORK_BEATS[i]}
            className={`flex w-full max-w-6xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-14 ${
              project.placeholder ? 'opacity-60' : ''
            }`}
          >
            <article className="max-w-xl shrink-0 lg:w-[min(100%,28rem)]">
              <Reveal>
                <BrandStamp
                  label={`Work / ${project.index}`}
                  className="mb-7"
                />
              </Reveal>

              <Reveal delay={60}>
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <StatusChip status={project.status} />
                  {project.categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-regolith"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={100}>
                <h2 className="display-lg text-[clamp(2.5rem,6vw,4.5rem)]">
                  {project.name}
                </h2>
                <p className="mt-4 text-xl text-glow md:text-2xl">
                  {project.tagline}
                </p>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-6 max-w-xl text-[0.9375rem] leading-relaxed text-regolith">
                  {project.description}
                </p>
              </Reveal>

              {project.highlights.length > 0 && (
                <Reveal delay={220}>
                  <ul className="mt-8 grid gap-x-8 gap-y-3 border-t border-white/8 pt-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    {project.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-2.5 text-[0.8125rem] leading-snug text-rim/85"
                      >
                        <span
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-glow"
                          aria-hidden
                        />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              <Reveal delay={280}>
                <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="label mr-2 text-[0.625rem] text-regolith/50">
                    Built with
                  </span>
                  {project.stack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md bg-white/6 px-2.5 py-1 font-mono text-[0.6875rem] tracking-wide text-regolith"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </Reveal>

              {project.href && (
                <Reveal delay={330}>
                  <a
                    href={project.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-9 inline-flex items-center gap-2.5 border-b border-white/20 pb-1.5 font-mono text-xs uppercase tracking-[0.16em] text-rim transition-colors duration-300 hover:border-glow hover:text-glow"
                  >
                    View project
                    <ArrowIcon className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </a>
                </Reveal>
              )}
            </article>

            {project.image && (
              <Reveal delay={140} className="min-w-0 flex-1">
                <a
                  href={project.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                  aria-label={`Open ${project.name}`}
                >
                  <img
                    src={project.image}
                    alt={`${project.name} — live product`}
                    className="w-full border border-white/10 object-cover shadow-[0_24px_80px_rgba(0,0,0,0.45)] transition duration-500 group-hover:border-glow/30"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </Reveal>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function Contact() {
  return (
    <section
      id="contact"
      className="flex min-h-screen flex-col justify-center px-6 md:px-12"
    >
      {/* The beat anchors on the headline block rather than the whole section, so
          the tableau composes with the copy centred instead of the footer. */}
      <div data-beat={'contact' satisfies BeatId}>
        <Reveal>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <BrandStamp label="Start a project" />
            <span className="inline-flex items-center gap-2 rounded-full border border-live/25 bg-live/10 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-live">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
              </span>
              Taking work
            </span>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <h2 className="display-lg max-w-3xl text-[clamp(2.5rem,7vw,5.5rem)] text-balance-tight">
            Tell us what needs <span className="text-regolith">to exist.</span>
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <a
            href="mailto:hello@centerinfinity.com"
            className="group mt-12 inline-flex w-fit items-center gap-4 border-b border-white/25 pb-2 font-mono text-sm tracking-wide transition-colors duration-300 hover:border-glow hover:text-glow"
          >
            hello@centerinfinity.com
            <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </Reveal>
      </div>

      <footer className="mt-32 flex flex-col gap-4 border-t border-white/8 pt-8 font-mono text-[0.6875rem] tracking-wide text-regolith/70 md:flex-row md:items-center md:justify-between">
        <a
          href="#top"
          className="inline-flex items-center gap-2.5 transition-colors hover:text-rim"
        >
          <BrandMark size="xs" />
          <span>
            Center Infinity{' '}
            <span className="text-regolith/40">by Jimmy Infinity</span>
          </span>
        </a>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Koh Phangan, Thailand</span>
          <a
            href="https://x.com/jimmy7infinity"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-rim"
          >
            X
          </a>
          <a
            href="https://github.com/jimmy7infinity"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-rim"
          >
            GitHub
          </a>
        </span>
        <a href="#top" className="transition-colors hover:text-rim">
          Back to the top
        </a>
      </footer>
    </section>
  )
}

/**
 * The runway. Scrolling through it accelerates the starfield into a hyperjump;
 * reaching the end cuts back to the hero while the screen is pure light.
 */
function Warp() {
  return (
    <section className="flex min-h-[200vh] items-center justify-center px-6">
      <div
        data-beat={'warp' satisfies BeatId}
        className="flex flex-col items-center text-center transition-opacity duration-700"
      >
        <BrandMark size="sm" className="mb-5 opacity-70" />
        <p className="label">Keep going</p>
        <p className="mt-4 max-w-xs text-lg text-glow/70">
          it loops back to the beginning
        </p>
      </div>
    </section>
  )
}

export function Overlay({ showChrome = true }: { showChrome?: boolean }) {
  return (
    <>
      {/* Chrome above the foreground debris canvas (z-40) so controls stay clickable. */}
      {showChrome ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div className="pointer-events-auto">
            <Header />
          </div>
          <SectionNav />
          <Achievements />
        </div>
      ) : null}
      <GameHud />
      {/* Copy sits under rocks/meteors so debris can pass in front of the type. */}
      <div className="warp-veil relative z-10">
        <main className="relative z-10">
          <Hero />
          <Services />
          <Work />
          <Contact />
          <Warp />
        </main>
      </div>
    </>
  )
}
