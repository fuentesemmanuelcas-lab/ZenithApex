import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangleIcon, LockIcon, MailIcon, ShieldCheckIcon } from 'lucide-react'
import { Atmosphere } from '../shell/Atmosphere'
import { GlitchText } from './GlitchText'
import { HudFrame } from './HudFrame'
import { ZenithSigil } from './ZenithSigil'
import { GoogleChooser, GoogleMark } from './GoogleChooser'
import { RecoverPanel } from './RecoverPanel'
import { EASE, fieldCls, labelCls, primaryBtnCls } from './authStyles'
import {
  authenticate,
  DEMO_CREDENTIALS,
  register,
  signInWithGoogle,
  signInWithGooglePopup,
  WORKSPACE_SCOPES,
  type Session,
} from '../../utils/authStore'

type Step = 'FORM' | 'GOOGLE' | 'RECOVER' | 'LINK' | 'GRANTED' | 'VERIFY'
type Mode = 'LOGIN' | 'REGISTER'

export function AuthGate({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<Mode>('LOGIN')
  const [step, setStep] = useState<Step>('FORM')
  const [email, setEmail] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [googleError, setGoogleError] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [session, setSession] = useState<Session | null>(null)
  const [verifyEmailTarget, setVerifyEmailTarget] = useState('')

  // Neural-link handshake bar.
  useEffect(() => {
    if (step !== 'LINK') return
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(id)
          setStep('GRANTED')
          return 100
        }
        return Math.min(100, p + 4 + Math.random() * 9)
      })
    }, 90)
    return () => window.clearInterval(id)
  }, [step])

  const beginLink = (s: Session) => {
    setSession(s)
    setProgress(0)
    setStep('LINK')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError('')
    if (!email.trim() || !passphrase) {
      setError('Email or password is required')
      return
    }
    if (mode === 'REGISTER' && passphrase !== confirm) {
      setError('Passwords do not match')
      return
    }
    setPending(true)
    const result = mode === 'LOGIN' ? await authenticate(email, passphrase) : await register(email, passphrase)
    setPending(false)

    if (result.success && result.session) {
      onAuthenticated(result.session)
    } else {
      setError(result.error ?? 'Email or password is incorrect')
    }
  }

  const handleGoogleSignIn = async () => {
    if (pending) return
    setGoogleError('')
    setError('')
    setPending(true)
    const result = await signInWithGooglePopup(WORKSPACE_SCOPES)
    setPending(false)
    if (result.success && result.session) {
      onAuthenticated(result.session)
    } else {
      const err = result.error || ''
      if (err.includes('popup-closed') || err.includes('cancelled')) {
        setGoogleError('')
      } else {
        setGoogleError(err)
      }
      setStep('GOOGLE')
    }
  }

  const google = async (address: string, name?: string) => {
    if (pending) return
    setGoogleError('')
    setPending(true)
    const result = await signInWithGoogle(address, name)
    setPending(false)
    if (result.success && result.session) onAuthenticated(result.session)
    else setGoogleError(result.error ?? 'GOOGLE_HANDSHAKE_FAILED')
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-void">
      <Atmosphere />
      <HudFrame />

      <div className="relative z-20 grid w-full max-w-4xl grid-cols-1 items-center gap-10 px-8 md:grid-cols-[minmax(0,1fr)_360px]">
        {/* Identity block ------------------------------------------------- */}
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <ZenithSigil className="h-40 w-40 md:h-52 md:w-52" />
          <h1 className="mt-6 font-mono text-3xl font-bold tracking-[0.32em] text-hazard text-glow-hazard md:text-4xl">
            <GlitchText text="ZENITH APEX" />
          </h1>
          <p className="mt-2 font-mono text-2xs tracking-[0.42em] text-dim">
            <GlitchText text="CORPORATE OPERATIONS DIVISION" delay={0.35} />
          </p>
          <dl className="mt-6 hidden grid-cols-3 gap-px border border-line bg-line font-mono text-3xs md:grid">
            {[
              ['MEM', '64TB'],
              ['ENCR', 'AES-4096'],
              ['NODE', 'TOKYO-03'],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-1.5">
                <dt className="text-dimmer">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Access panel ---------------------------------------------------- */}
        <section
          aria-label="Operator access"
          className="corner-bracket corner-bracket-hazard relative border border-hazard/50 bg-surface/95 p-5 shadow-[0_0_40px_rgba(255,49,49,0.12)]"
        >
          <AnimatePresence mode="wait">
            {step === 'FORM' && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <header className="mb-4 flex items-center gap-2 border-b border-line pb-3">
                  <LockIcon className="h-3.5 w-3.5 text-hazard" aria-hidden />
                  <h2 className="font-mono text-3xs font-bold tracking-[0.2em] text-hazard">
                    {mode === 'LOGIN' ? 'IDENTITY VERIFICATION' : 'NEW OPERATOR ENROLLMENT'}
                  </h2>
                </header>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 border border-line2 bg-void py-2.5 font-mono text-3xs font-bold tracking-[0.18em] text-ink transition-colors duration-150 ease-out hover:border-nexus/60 disabled:opacity-50"
                >
                  <GoogleMark />
                  {pending && step === 'FORM' ? 'CONNECTING TO GOOGLE…' : 'CONTINUE WITH GOOGLE'}
                </button>

                <div className="my-4 flex items-center gap-2">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-3xs tracking-[0.2em] text-dimmer">OR CREDENTIALS</span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <form onSubmit={submit} className="space-y-2.5">
                  <label className="block">
                    <span className={labelCls}>CORPORATE_EMAIL</span>
                    <input
                      type="email"
                      value={email}
                      autoFocus
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className={fieldCls}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>PASSPHRASE</span>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="••••••••"
                      className={fieldCls}
                    />
                  </label>
                  {mode === 'REGISTER' && (
                    <label className="block">
                      <span className={labelCls}>CONFIRM_PASSPHRASE</span>
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••••"
                        className={fieldCls}
                      />
                    </label>
                  )}

                  {error && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="flex items-center gap-1.5 border border-hazard/60 bg-hazard/10 px-2 py-1.5 font-mono text-3xs tracking-widest text-hazard"
                    >
                      <AlertTriangleIcon className="h-3 w-3 shrink-0" aria-hidden />
                      {error}
                    </motion.p>
                  )}

                  <button type="submit" disabled={pending} className={primaryBtnCls}>
                    {pending ? 'VERIFYING…' : mode === 'LOGIN' ? 'AUTHENTICATE' : 'INITIALIZE_LINK'}
                  </button>
                </form>

                <div className="mt-4 flex items-center justify-between gap-3 font-mono text-3xs tracking-widest">
                  <div className="flex items-center gap-3">
                    {(['LOGIN', 'REGISTER'] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m)
                          setError('')
                        }}
                        className={`transition-colors duration-150 ease-out ${
                          mode === m
                            ? 'font-bold text-hazard underline underline-offset-4'
                            : 'text-dimmer hover:text-dim'
                        }`}
                      >
                        {m === 'LOGIN' ? 'LOGIN' : 'NEW_IDENTITY'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setError('')
                      setStep('RECOVER')
                    }}
                    className="text-caution transition-colors duration-150 ease-out hover:text-ink"
                  >
                    LOST_PASSPHRASE
                  </button>
                </div>

                <div className="mt-3 border-t border-line pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(DEMO_CREDENTIALS.email)
                      setPassphrase(DEMO_CREDENTIALS.passphrase)
                      setError('')
                    }}
                    className="font-mono text-3xs leading-relaxed text-dimmer hover:text-nexus transition-colors cursor-pointer"
                    title="Click to auto-fill demo credentials"
                  >
                    DEMO ACCESS // {DEMO_CREDENTIALS.email}
                    <br />
                    PASSPHRASE // {DEMO_CREDENTIALS.passphrase} (CLICK TO AUTOFILL)
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'GOOGLE' && (
              <motion.div
                key="google"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <GoogleChooser
                  pending={pending}
                  error={googleError}
                  onLaunchPopup={handleGoogleSignIn}
                  onSelect={(address, name) => void google(address, name)}
                  onCancel={() => setStep('FORM')}
                />
              </motion.div>
            )}

            {step === 'RECOVER' && (
              <motion.div
                key="recover"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <RecoverPanel
                  initialEmail={email}
                  onRecovered={(s) => beginLink(s)}
                  onCancel={() => setStep('FORM')}
                />
              </motion.div>
            )}

            {step === 'VERIFY' && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="space-y-4 py-2"
              >
                <header className="flex items-center gap-2 border-b border-line pb-3">
                  <MailIcon className="h-3.5 w-3.5 text-hazard" aria-hidden />
                  <h2 className="font-mono text-3xs font-bold tracking-[0.2em] text-hazard">
                    EMAIL VERIFICATION REQUIRED
                  </h2>
                </header>

                <div className="border border-hazard/50 bg-hazard/10 p-3.5 font-mono text-xs leading-relaxed text-ink">
                  <p className="text-ink">
                    We have sent you a verification email to {verifyEmailTarget}. Please verify it and log in.
                  </p>
                </div>

                <p className="font-mono text-3xs text-dimmer leading-relaxed">
                  Please check your inbox and verify your email address before attempting to access the terminal.
                </p>

                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    setMode('LOGIN')
                    setStep('FORM')
                    setError('')
                  }}
                  className={primaryBtnCls}
                >
                  LOGIN
                </button>
              </motion.div>
            )}

            {step === 'LINK' && (
              <motion.div
                key="link"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="space-y-3 py-6"
              >
                <p className="font-mono text-3xs tracking-[0.2em] text-nexus">
                  <GlitchText text="ESTABLISHING NEURAL LINK" />
                </p>
                <div className="h-1.5 w-full overflow-hidden border border-line bg-void">
                  <div
                    className="h-full bg-hazard transition-[width] duration-150 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-3xs text-dimmer">
                  <span className="truncate">
                    {session?.provider === 'GOOGLE' ? 'GOOGLE // ' : 'HANDSHAKE // '}
                    {session?.email}
                  </span>
                  <span className="text-ink">{Math.floor(progress)}%</span>
                </div>
              </motion.div>
            )}

            {step === 'GRANTED' && session && (
              <motion.div
                key="granted"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="py-3 text-center"
              >
                <ShieldCheckIcon className="mx-auto mb-3 h-8 w-8 text-nexus" aria-hidden />
                <p className="font-mono text-3xs tracking-[0.24em] text-nexus">ACCESS GRANTED</p>
                <p className="mt-3 font-mono text-lg font-bold tracking-[0.14em] text-ink">
                  <GlitchText text={session.name} />
                </p>
                <p className="mt-2 font-mono text-3xs leading-relaxed text-dim">
                  CLEARANCE: {session.clearance}
                  <br />
                  AUTH: {session.provider === 'GOOGLE' ? 'GOOGLE FEDERATED' : 'LOCAL VAULT'}
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={() => onAuthenticated(session)}
                  className="mt-5 w-full border border-nexus bg-nexus/10 py-2.5 font-mono text-3xs font-bold tracking-[0.24em] text-nexus transition-colors duration-150 ease-out hover:bg-nexus hover:text-void"
                >
                  ENTER ZENITH APEX OS
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}
