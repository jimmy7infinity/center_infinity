import { Reveal } from './Reveal'
import { projects, services } from '../content/projects'

function Header() {
  return (
    <>
      {/* Content scrolls under the fixed nav, so it needs a scrim to stay legible. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[15] h-32 bg-gradient-to-b from-black via-black/70 to-transparent"
        aria-hidden
      />
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 md:px-12">
        <a href="#top" className="label !text-rim">
          Center Infinity
        </a>
        <a
          href="#contact"
          className="label transition-colors duration-300 hover:!text-rim"
        >
          Start a project
        </a>
      </header>
    </>
  )
}

function Hero() {
  return (
    <section
      id="top"
      className="flex min-h-screen flex-col justify-end px-6 pb-24 md:px-12 md:pb-32"
    >
      <Reveal>
        <p className="label mb-6">Product studio · Koh Phangan, Thailand</p>
      </Reveal>
      <Reveal delay={120}>
        <h1 className="max-w-4xl font-serif text-[clamp(2.75rem,8vw,7rem)] leading-[0.92] tracking-[-0.02em] text-balance-tight">
          We build products
          <br />
          <span className="italic text-glow">all the way to shipped.</span>
        </h1>
      </Reveal>
      <Reveal delay={240}>
        <p className="mt-8 max-w-md text-base leading-relaxed text-regolith">
          Full-stack design and engineering for founders who need the thing to
          actually exist — not a deck about it.
        </p>
      </Reveal>
    </section>
  )
}

function Services() {
  return (
    <section className="flex min-h-screen items-center px-6 md:px-12">
      <div className="w-full max-w-5xl">
        <Reveal>
          <p className="label mb-10">What we do</p>
        </Reveal>
        <ul className="divide-y divide-white/8 border-y border-white/8">
          {services.map((service, i) => (
            <Reveal key={service} delay={i * 90}>
              <li className="flex items-baseline gap-6 py-6 md:py-8">
                <span className="font-mono text-xs text-regolith/60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-serif text-[clamp(1.5rem,3.5vw,2.75rem)] leading-tight">
                  {service}
                </span>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Work() {
  return (
    <section id="work" className="px-6 md:px-12">
      <Reveal>
        <p className="label py-24 md:py-32">Selected work</p>
      </Reveal>

      <div className="space-y-32 pb-24 md:space-y-48 md:pb-32">
        {projects.map((project) => (
          <article
            key={project.name}
            className="grid max-w-6xl gap-8 md:grid-cols-[10rem_1fr]"
          >
            <Reveal>
              <div className="flex items-baseline gap-4 md:flex-col md:gap-3">
                <span className="font-mono text-xs text-regolith/60">
                  {project.index}
                </span>
                <span className="label !text-glow">{project.status}</span>
              </div>
            </Reveal>

            <div>
              <Reveal delay={80}>
                <h2 className="font-serif text-[clamp(2rem,5vw,3.75rem)] leading-[1.02] tracking-[-0.015em]">
                  {project.name}
                </h2>
                <p className="mt-3 font-serif text-xl italic text-glow/80 md:text-2xl">
                  {project.tagline}
                </p>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-7 max-w-xl text-[0.9375rem] leading-relaxed text-regolith">
                  {project.description}
                </p>
              </Reveal>
              <Reveal delay={240}>
                <ul className="mt-7 flex flex-wrap gap-x-3 gap-y-2">
                  {project.stack.map((tech) => (
                    <li
                      key={tech}
                      className="rounded-full border border-white/12 px-3 py-1 font-mono text-[0.6875rem] tracking-wide text-regolith"
                    >
                      {tech}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Contact() {
  return (
    <section
      id="contact"
      className="flex min-h-screen flex-col justify-center px-6 md:px-12"
    >
      <Reveal>
        <p className="label mb-8">Start a project</p>
      </Reveal>
      <Reveal delay={100}>
        <h2 className="max-w-3xl font-serif text-[clamp(2.25rem,6.5vw,5rem)] leading-[0.98] tracking-[-0.02em] text-balance-tight">
          Tell us what needs
          <br />
          <span className="italic text-glow">to exist.</span>
        </h2>
      </Reveal>
      <Reveal delay={200}>
        <a
          href="mailto:hello@centerinfinity.com"
          className="group mt-12 inline-flex w-fit items-center gap-4 border-b border-white/25 pb-2 font-mono text-sm tracking-wide transition-colors duration-300 hover:border-rim"
        >
          hello@centerinfinity.com
          <span className="transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </a>
      </Reveal>

      <footer className="mt-32 flex flex-col gap-2 border-t border-white/8 pt-8 pb-12 font-mono text-[0.6875rem] tracking-wide text-regolith/70 md:flex-row md:justify-between">
        <span>Center Infinity</span>
        <span>Koh Phangan, Thailand</span>
      </footer>
    </section>
  )
}

export function Overlay() {
  return (
    <>
      <Header />
      <main className="relative z-10">
        <Hero />
        <Services />
        <Work />
        <Contact />
      </main>
    </>
  )
}
