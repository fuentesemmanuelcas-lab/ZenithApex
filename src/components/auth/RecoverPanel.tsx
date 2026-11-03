import React, { useState } from 'react'
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, KeyRoundIcon, MailIcon } from 'lucide-react'
import { requestReset, type Session } from '../../utils/authStore'
import { fieldCls, labelCls, primaryBtnCls } from './authStyles'

/** Password reset without verification code. Sends a direct password reset email. */
export function RecoverPanel({
  initialEmail,
  onRecovered: _onRecovered,
  onCancel,
}: {
  initialEmail: string
  onRecovered: (session: Session) => void
  onCancel: () => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  const sendResetLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError('')
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your email address')
      return
    }
    setPending(true)
    const result = await requestReset(trimmed)
    setPending(false)
    if (result.success) {
      setSent(true)
    } else {
      setError(result.error ?? 'Password reset request failed. Please try again.')
    }
  }

  return (
    <div>
      <header className="mb-4 flex items-center gap-2 border-b border-line pb-3">
        <KeyRoundIcon className="h-3.5 w-3.5 text-caution" aria-hidden />
        <h2 className="font-mono text-3xs font-bold tracking-[0.2em] text-caution">PASSWORD RESET</h2>
      </header>

      {sent ? (
        <div className="space-y-3">
          <div className="border border-nexus/50 bg-nexus/10 p-3 font-mono text-2xs text-nexus">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2Icon className="h-4 w-4 shrink-0" />
              <span>RESET LINK TRANSMITTED</span>
            </div>
            <p className="mt-1.5 text-3xs text-ink/90 leading-relaxed">
              We have sent a password reset link to <strong className="text-nexus font-bold">{email}</strong>. Please check your inbox (and spam folder) to reset your password.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={primaryBtnCls}
          >
            RETURN TO SIGN IN
          </button>
        </div>
      ) : (
        <form onSubmit={sendResetLink} className="space-y-2.5">
          <p className="font-mono text-3xs leading-relaxed text-dim">
            Enter your registered operator email address. A password reset link will be sent directly to your inbox.
          </p>
          <label className="block">
            <span className={labelCls}>REGISTERED_EMAIL</span>
            <input
              type="email"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className={fieldCls}
              required
            />
          </label>
          {error && <ErrorLine text={error} />}
          <button type="submit" disabled={pending} className={primaryBtnCls}>
            <MailIcon className="mr-1.5 inline-block h-3.5 w-3.5" />
            {pending ? 'TRANSMITTING…' : 'SEND PASSWORD RESET LINK'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-4 flex w-full items-center justify-center gap-1.5 font-mono text-3xs tracking-widest text-dimmer transition-colors duration-150 ease-out hover:text-ink"
      >
        <ArrowLeftIcon className="h-3 w-3" aria-hidden />
        BACK TO CREDENTIALS
      </button>
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-1.5 border border-hazard/60 bg-hazard/10 px-2 py-1.5 font-mono text-3xs tracking-widest text-hazard"
    >
      <AlertTriangleIcon className="h-3 w-3 shrink-0" aria-hidden />
      {text}
    </p>
  )
}
