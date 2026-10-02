import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BUILD_OPTIONS } from '../content/projects'
import { ArrowIcon } from './icons'

type Status =
  | { kind: 'editing' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'failed'; message: string }

const FALLBACK_ERROR = 'Something went wrong. Email us instead.'

async function sendBrief(brief: {
  email: string
  message: string
  interests: readonly string[]
}) {
  const response = await fetch('/api/brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brief),
  })
  if (response.ok) return
  const body: unknown = await response.json().catch(() => null)
  const message =
    body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : FALLBACK_ERROR
  throw new Error(message)
}

export function BriefDialog({
  open,
  interests,
  onToggleInterest,
  onClose,
}: {
  open: boolean
  interests: readonly string[]
  onToggleInterest: (option: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'editing' })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // A sent brief is done: the next open starts a fresh one.
  useEffect(() => {
    if (open || status.kind !== 'sent') return
    setEmail('')
    setMessage('')
    setStatus({ kind: 'editing' })
  }, [open, status.kind])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status.kind === 'sending') return
    setStatus({ kind: 'sending' })
    try {
      await sendBrief({ email: email.trim(), message: message.trim(), interests })
      setStatus({ kind: 'sent', email: email.trim() })
    } catch (error) {
      setStatus({
        kind: 'failed',
        message: error instanceof Error ? error.message : FALLBACK_ERROR,
      })
    }
  }

  return (
    <dialog
      ref={ref}
      className="ink-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {status.kind === 'sent' ? (
        <div className="ink-dialog__body">
          <p className="ink-label mb-4">Brief received</p>
          <h2 id={titleId} className="ink-title text-[1.5rem]">
            Thank you. We'll be in touch.
          </h2>
          <p className="ink-body mt-3">
            We'll reply to <span className="text-rim">{status.email}</span>.
          </p>
          <button type="button" className="ink-cta mt-8" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form className="ink-dialog__body" onSubmit={submit}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="ink-label mb-4">New brief</p>
              <h2 id={titleId} className="ink-title text-[1.5rem]">
                Tell us about what you need.
              </h2>
            </div>
            <button
              type="button"
              className="ink-dialog__close ink-label"
              onClick={onClose}
              aria-label="Close"
            >
              Esc
            </button>
          </div>

          <fieldset className="mt-7">
            <legend className="ink-label mb-3">What are you building?</legend>
            <div className="flex flex-wrap gap-2">
              {BUILD_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="ink-chip"
                  aria-pressed={interests.includes(option)}
                  onClick={() => onToggleInterest(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-6 block">
            <span className="ink-label mb-2 block">Your email</span>
            <input
              className="ink-field"
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="mt-5 block">
            <span className="ink-label mb-2 block">What do you need?</span>
            <textarea
              className="ink-field ink-field--area"
              name="message"
              required
              maxLength={4000}
              rows={5}
              placeholder="The problem, who it's for, and where it stands today."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <p className="ink-label normal-case tracking-[0.04em]" role="status">
              {status.kind === 'failed' ? (
                <span className="text-rim">{status.message}</span>
              ) : (
                'Goes straight to hello@centerinfinity.com'
              )}
            </p>
            <button
              type="submit"
              className="ink-cta"
              disabled={status.kind === 'sending'}
            >
              {status.kind === 'sending' ? 'Sending' : 'Send brief'}
              <ArrowIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
