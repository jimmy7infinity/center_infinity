import { useEffect, useRef } from 'react'
import { setMeshWells, type MeshWell } from '../lib/meshField'

/**
 * Each practice card holds a fixed mesh well in the empty middle, and — while
 * the pointer is inside that card — a few stars that fall into it. The loop
 * sleeps as soon as the last star is swallowed.
 */

const MAX_STARS = 22
const SPAWN_EVERY = 0.048
const WELL_PULL = 0.84
const DESKTOP = '(min-width: 900px)'
const MOTION = '(prefers-reduced-motion: reduce)'
const FINE = '(hover: hover) and (pointer: fine)'

const slots: (MeshWell | null)[] = [null, null, null]
let publishFrame = 0

function publishWells() {
  if (publishFrame) return
  publishFrame = requestAnimationFrame(() => {
    publishFrame = 0
    const next: MeshWell[] = []
    for (const slot of slots) if (slot) next.push(slot)
    setMeshWells(next)
  })
}

function writeSlot(index: number, well: MeshWell | null) {
  slots[index] = well
  publishWells()
}

type Star = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  spin: number
  tx: number
  ty: number
}

export function PracticeCardField({ index }: { index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const card = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !card || !ctx) return

    const desktopMq = window.matchMedia(DESKTOP)
    const reduceMq = window.matchMedia(MOTION)
    const fineMq = window.matchMedia(FINE)
    const stars: Star[] = Array.from({ length: MAX_STARS }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      spin: 1,
      tx: 0,
      ty: 0,
    }))

    let count = 0
    let frame = 0
    let last = 0
    let acc = 0
    let dpr = 1
    let cssW = 0
    let cssH = 0
    let holeX = 0
    let holeY = 0
    let holeVx = 0
    let holeVy = 0
    let armed = false
    let inside = false
    let localX = 0
    let localY = 0
    const starsOn = () => fineMq.matches && !reduceMq.matches

    const spawn = (x: number, y: number) => {
      if (count >= MAX_STARS) return
      const dx = holeX - x
      const dy = holeY - y
      const dist = Math.hypot(dx, dy) || 1
      const nx = dx / dist
      const ny = dy / dist
      const spin = Math.random() < 0.5 ? -1 : 1
      const side = 6 + Math.random() * 16
      const star = stars[count++]
      star.x = x + (Math.random() - 0.5) * 5
      star.y = y + (Math.random() - 0.5) * 5
      star.vx = nx * (10 + Math.random() * 16) - ny * side * spin
      star.vy = ny * (10 + Math.random() * 16) + nx * side * spin
      star.life = 0
      star.spin = spin
      star.tx = holeX
      star.ty = holeY
    }

    const kill = (i: number) => {
      count--
      const removed = stars[i]
      stars[i] = stars[count]
      stars[count] = removed
    }

    const stepStars = (dt: number) => {
      for (let i = count - 1; i >= 0; i--) {
        const star = stars[i]
        const dx = star.tx - star.x
        const dy = star.ty - star.y
        const dist = Math.hypot(dx, dy)
        star.life += dt
        if (dist < 5 || star.life > 2.4) {
          kill(i)
          continue
        }
        const inv = 1 / dist
        const pull = Math.min(1500, 260 + 12000 * inv)
        const spin = star.spin * 70 * Math.min(1, 90 * inv)
        star.vx = (star.vx + (-dy * inv * spin + dx * inv * pull) * dt) * 0.99
        star.vy = (star.vy + (dx * inv * spin + dy * inv * pull) * dt) * 0.99
        const speed = Math.hypot(star.vx, star.vy)
        if (speed > 420) {
          const scale = 420 / speed
          star.vx *= scale
          star.vy *= scale
        }
        star.x += star.vx * dt
        star.y += star.vy * dt
        if (
          star.x < -24 ||
          star.y < -24 ||
          star.x > cssW + 24 ||
          star.y > cssH + 24
        ) {
          kill(i)
        }
      }
    }

    const drawStars = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)
      ctx.lineCap = 'round'
      for (let i = 0; i < count; i++) {
        const star = stars[i]
        const dx = star.tx - star.x
        const dy = star.ty - star.y
        const dist = Math.hypot(dx, dy)
        const alpha = Math.min(0.9, dist / 36) * Math.min(1, star.life / 0.04)
        if (alpha < 0.02) continue
        ctx.strokeStyle = `rgba(226, 223, 216, ${alpha})`
        ctx.lineWidth = 1.35
        ctx.beginPath()
        ctx.moveTo(star.x - star.vx * 0.034, star.y - star.vy * 0.034)
        ctx.lineTo(star.x, star.y)
        ctx.stroke()
      }
    }

    const syncHoleLocal = () => {
      const rect = canvas.getBoundingClientRect()
      holeX = holeVx - rect.left
      holeY = holeVy - rect.top
    }

    const tick = (time: number) => {
      const dt = last ? Math.min(0.034, (time - last) / 1000) : 1 / 60
      last = time
      if (inside && starsOn() && armed) {
        acc += dt
        let spawned = 0
        while (acc >= SPAWN_EVERY && count < MAX_STARS && spawned < 3) {
          acc -= SPAWN_EVERY
          spawn(localX, localY)
          spawned++
        }
        if (acc > SPAWN_EVERY) acc = SPAWN_EVERY
      } else {
        acc = 0
      }
      stepStars(dt)
      drawStars()
      if (count > 0 || (inside && armed && starsOn())) frame = requestAnimationFrame(tick)
      else {
        frame = 0
        last = 0
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, cssW, cssH)
      }
    }

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    const measure = () => {
      const page = card.closest('.ink-page')
      const hidden = !page || page.hasAttribute('hidden')
      const rect = card.getBoundingClientRect()
      if (hidden || !desktopMq.matches || rect.width < 8 || rect.height < 8) {
        inside = false
        armed = false
        count = 0
        writeSlot(index, null)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      const word = card.querySelector('.practice__word')
      const detail = card.querySelector('.practice__detail')
      if (!word || !detail) {
        armed = false
        writeSlot(index, null)
        return
      }
      const wordRect = word.getBoundingClientRect()
      const detailRect = detail.getBoundingClientRect()
      const gap = detailRect.top - wordRect.bottom
      const radius = Math.min(wordRect.width * 0.42, gap * 0.55)
      if (gap < 48 || radius < 28) {
        armed = false
        writeSlot(index, null)
        return
      }

      armed = true
      holeVx = wordRect.left + wordRect.width / 2
      holeVy = (wordRect.bottom + detailRect.top) / 2
      syncHoleLocal()
      writeSlot(index, { x: holeVx, y: holeVy, pull: WELL_PULL, radius })

      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      cssW = rect.width
      cssH = rect.height
      const nextW = Math.max(1, Math.round(cssW * dpr))
      const nextH = Math.max(1, Math.round(cssH * dpr))
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW
        canvas.height = nextH
        count = 0
      }
    }

    const onMove = (event: PointerEvent) => {
      if (!starsOn() || !armed || event.pointerType !== 'mouse') return
      const rect = canvas.getBoundingClientRect()
      holeX = holeVx - rect.left
      holeY = holeVy - rect.top
      localX = event.clientX - rect.left
      localY = event.clientY - rect.top
      inside = true
      wake()
    }

    const onLeave = () => {
      inside = false
    }

    const page = card.closest('.ink-page')
    const observer = new MutationObserver(measure)
    if (page) observer.observe(page, { attributes: true, attributeFilter: ['hidden'] })
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(card)
    const onScroll = () => measure()
    page?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    desktopMq.addEventListener('change', measure)
    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerleave', onLeave)
    measure()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      page?.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      desktopMq.removeEventListener('change', measure)
      card.removeEventListener('pointermove', onMove)
      card.removeEventListener('pointerleave', onLeave)
      writeSlot(index, null)
    }
  }, [index])

  return <canvas ref={canvasRef} className="practice__field" aria-hidden />
}
