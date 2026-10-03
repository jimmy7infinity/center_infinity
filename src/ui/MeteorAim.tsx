import { useSyncExternalStore } from 'react'
import {
  getMeteorAimVersion,
  meteorAim,
  setMeteorAimMode,
  subscribeMeteorAim,
} from '../lib/meteorAim'

function useAimVersion() {
  return useSyncExternalStore(subscribeMeteorAim, getMeteorAimVersion)
}

function ClickShotIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden width="15" height="15">
      <circle cx="8" cy="8" r="2.1" fill="currentColor" />
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function DragShotIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden width="15" height="15">
      <path
        d="M3.2 12.4 11.6 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8.2 3.2H12.6V7.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Sits on the hero, not in the status bar. Click shot or a pool-style drag. */
export function MeteorAimToggle() {
  useAimVersion()
  const drag = meteorAim.mode === 'drag'
  return (
    <div className="aim-switch" role="group" aria-label="Meteor shot">
      <button
        type="button"
        aria-pressed={!drag}
        aria-label="Click to shoot"
        onClick={() => setMeteorAimMode('click')}
      >
        <ClickShotIcon />
      </button>
      <button
        type="button"
        aria-pressed={drag}
        aria-label="Drag to aim"
        onClick={() => setMeteorAimMode('drag')}
      >
        <DragShotIcon />
      </button>
    </div>
  )
}

/** Cue, charge, and the line the meteor will travel. */
export function MeteorAimGuide() {
  useAimVersion()
  if (!meteorAim.dragging) return null
  const width = window.innerWidth
  const height = window.innerHeight
  const toPx = (x: number, y: number) => ({
    x: ((x + 1) * 0.5) * width,
    y: ((1 - y) * 0.5) * height,
  })
  const press = toPx(meteorAim.pressX, meteorAim.pressY)
  const cursor = toPx(meteorAim.x, meteorAim.y)
  const pullX = cursor.x - press.x
  const pullY = cursor.y - press.y
  const pull = Math.hypot(pullX, pullY)
  const power = Math.min(1, pull / (0.55 * Math.min(width, height) * 0.5))
  const ux = pull > 1 ? pullX / pull : 0
  const uy = pull > 1 ? pullY / pull : -1
  const aimFar = {
    x: press.x - ux * (88 + power * 220),
    y: press.y - uy * (88 + power * 220),
  }
  const cueGap = 16
  const cueStart = {
    x: press.x + ux * cueGap,
    y: press.y + uy * cueGap,
  }
  const ring = 18 + power * 10
  const ringLen = 2 * Math.PI * ring
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[104]"
      width={width}
      height={height}
      aria-hidden
    >
      <defs>
        <filter id="aim-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="aim-shaft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f1ea" />
          <stop offset="0.45" stopColor="#c8c4bb" />
          <stop offset="1" stopColor="#6e6c66" />
        </linearGradient>
      </defs>

      <line
        x1={press.x}
        y1={press.y}
        x2={aimFar.x}
        y2={aimFar.y}
        stroke="rgba(226, 223, 216, 0.22)"
        strokeWidth="6"
        strokeLinecap="round"
        filter="url(#aim-glow)"
      />
      <line
        x1={press.x}
        y1={press.y}
        x2={aimFar.x}
        y2={aimFar.y}
        stroke="rgba(226, 223, 216, 0.9)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="1.5 7"
      />
      <polygon
        points={arrowHead(aimFar.x, aimFar.y, -ux, -uy)}
        fill="#e2dfd8"
        opacity={0.55 + power * 0.45}
      />

      <line
        x1={cueStart.x}
        y1={cueStart.y}
        x2={cursor.x}
        y2={cursor.y}
        stroke="url(#aim-shaft)"
        strokeWidth={5 + power * 2}
        strokeLinecap="round"
      />
      <line
        x1={cueStart.x}
        y1={cueStart.y}
        x2={cueStart.x + ux * 14}
        y2={cueStart.y + uy * 14}
        stroke="#f7f4ee"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx={cursor.x} cy={cursor.y} r={4 + power * 2} fill="#2a2a28" stroke="#e2dfd8" strokeWidth="1.25" />

      <circle
        cx={press.x}
        cy={press.y}
        r={ring}
        fill="none"
        stroke="rgba(0, 0, 0, 0.45)"
        strokeWidth="5"
      />
      <circle
        cx={press.x}
        cy={press.y}
        r={ring}
        fill="none"
        stroke="rgba(226, 223, 216, 0.2)"
        strokeWidth="3"
      />
      <circle
        cx={press.x}
        cy={press.y}
        r={ring}
        fill="none"
        stroke="#e2dfd8"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeDasharray={`${ringLen * (0.08 + power * 0.72)} ${ringLen}`}
        transform={`rotate(-90 ${press.x} ${press.y})`}
      />
      <circle cx={press.x} cy={press.y} r="3.5" fill="#e2dfd8" />
    </svg>
  )
}

function arrowHead(x: number, y: number, ux: number, uy: number) {
  const px = -uy
  const py = ux
  const tipX = x + ux * 11
  const tipY = y + uy * 11
  const leftX = x - ux * 2 + px * 6
  const leftY = y - uy * 2 + py * 6
  const rightX = x - ux * 2 - px * 6
  const rightY = y - uy * 2 - py * 6
  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
}
