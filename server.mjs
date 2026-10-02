/**
 * Production server: serves the built SPA from dist/ and takes project briefs
 * from the contact page at POST /api/brief.
 *
 * Every brief is logged as one JSON line (visible in Railway's logs), appended
 * to $BRIEFS_DIR/briefs.jsonl when a volume is mounted there, and emailed to
 * $BRIEF_TO through Resend when $RESEND_API_KEY is set.
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT) || 4173
const DIST = fileURLToPath(new URL('./dist/', import.meta.url))
const BRIEFS_DIR = process.env.BRIEFS_DIR
const RESEND_API_KEY = process.env.RESEND_API_KEY
const BRIEF_TO = process.env.BRIEF_TO || 'hello@centerinfinity.com'
const BRIEF_FROM = process.env.BRIEF_FROM || 'Center Infinity <briefs@centerinfinity.com>'

const MAX_BODY_BYTES = 16 * 1024
const MAX_EMAIL = 254
const MAX_MESSAGE = 4000
const MAX_INTERESTS = 8
const MAX_INTEREST = 60
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5
const recentByIp = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [ip, times] of recentByIp) {
    if (times.every((t) => now - t >= RATE_WINDOW_MS)) recentByIp.delete(ip)
  }
}, RATE_WINDOW_MS).unref()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return first?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
}

function rateLimited(ip) {
  const now = Date.now()
  const recent = (recentByIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  recentByIp.set(ip, recent)
  return recent.length > RATE_LIMIT
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Returns a clean brief, or a string saying what is wrong with it. */
function parseBrief(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return 'Invalid request.'
  }
  if (typeof data !== 'object' || data === null) return 'Invalid request.'

  const email = typeof data.email === 'string' ? data.email.trim() : ''
  const message = typeof data.message === 'string' ? data.message.trim() : ''
  const interests = Array.isArray(data.interests)
    ? data.interests
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().slice(0, MAX_INTEREST))
        .filter(Boolean)
        .slice(0, MAX_INTERESTS)
    : []

  if (!email || email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email.'
  }
  if (!message) return 'Tell us a little about what you need.'
  if (message.length > MAX_MESSAGE) return 'That brief is a little long.'

  return { email, message, interests }
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function emailBrief(brief) {
  if (!RESEND_API_KEY) return
  const interests = brief.interests.length ? brief.interests.join(', ') : 'Not specified'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: BRIEF_FROM,
      to: [BRIEF_TO],
      reply_to: brief.email,
      subject: `New brief from ${brief.email}`,
      text: `From: ${brief.email}\nInterested in: ${interests}\n\n${brief.message}`,
      html: `<p><strong>From:</strong> ${escapeHtml(brief.email)}<br><strong>Interested in:</strong> ${escapeHtml(interests)}</p><p style="white-space:pre-wrap">${escapeHtml(brief.message)}</p>`,
    }),
  })
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`)
  }
}

async function storeBrief(record) {
  if (!BRIEFS_DIR) return
  await mkdir(BRIEFS_DIR, { recursive: true })
  await appendFile(join(BRIEFS_DIR, 'briefs.jsonl'), `${JSON.stringify(record)}\n`)
}

async function handleBrief(req, res) {
  const ip = clientIp(req)
  if (rateLimited(ip)) {
    sendJson(res, 429, { error: 'Too many requests. Try again in a few minutes.' })
    return
  }

  let raw
  try {
    raw = await readBody(req)
  } catch {
    sendJson(res, 413, { error: 'That brief is a little long.' })
    return
  }

  const brief = parseBrief(raw)
  if (typeof brief === 'string') {
    sendJson(res, 400, { error: brief })
    return
  }

  const record = { at: new Date().toISOString(), ...brief }
  console.log(`[brief] ${JSON.stringify(record)}`)

  const results = await Promise.allSettled([storeBrief(record), emailBrief(brief)])
  for (const result of results) {
    if (result.status === 'rejected') console.error('[brief] delivery failed:', result.reason)
  }
  sendJson(res, 200, { ok: true })
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  const requested = normalize(join(DIST, pathname))
  if (requested !== DIST.slice(0, -1) && !requested.startsWith(DIST)) {
    res.writeHead(403).end()
    return
  }

  let file = requested
  let info = await stat(file).catch(() => null)
  if (info?.isDirectory()) {
    file = join(file, 'index.html')
    info = await stat(file).catch(() => null)
  }
  // SPA fallback: unknown routes without an extension get the app shell.
  if (!info && !extname(pathname)) {
    file = join(DIST, 'index.html')
    info = await stat(file).catch(() => null)
  }
  if (!info) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    return
  }

  const hashed = file.includes(`${sep}assets${sep}`)
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/api/brief') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end()
      return
    }
    handleBrief(req, res).catch((error) => {
      console.error('[brief] failed:', error)
      sendJson(res, 500, { error: 'Something went wrong. Email us instead.' })
    })
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  serveStatic(req, res).catch((error) => {
    console.error('[static] failed:', error)
    if (!res.headersSent) res.writeHead(500).end()
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Center Infinity on :${PORT}`)
})
