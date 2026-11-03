import React, { useState } from 'react'
import { AlertTriangleIcon, ArrowLeftIcon, ExternalLinkIcon, ShieldCheckIcon, UserIcon } from 'lucide-react'
import { GOOGLE_IDENTITIES } from '../../utils/authStore'
import { fieldCls, ghostBtnCls, labelCls, primaryBtnCls } from './authStyles'

export function GoogleMark({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15.7z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46z"
      />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
      <path
        fill="#EA4335"
        d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.3 29.9 2 24 2 15.4 2 8.1 6.9 4.4 14.1l7.1 5.5C13.3 14.3 18.2 10.5 24 10.5z"
      />
    </svg>
  )
}

/** Account picker matching Google's sign-in chooser interface */
export function GoogleChooser({
  onSelect,
  onLaunchPopup,
  onCancel,
  pending,
  error,
}: {
  onSelect: (email: string, name?: string) => void
  onLaunchPopup?: () => void
  onCancel: () => void
  pending: boolean
  error: string
}) {
  const [custom, setCustom] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <GoogleMark className="h-4 w-4" />
          <h2 className="font-mono text-2xs font-bold tracking-[0.18em] text-ink">
            CHOOSE AN ACCOUNT
          </h2>
        </div>
        <span className="font-mono text-3xs text-dimmer">FIREBASE AUTH</span>
      </header>

      <p className="font-mono text-3xs text-dim leading-relaxed">
        Select a Google account connected to your session or launch the Firebase popup:
      </p>

      {/* Account choices */}
      <ul className="space-y-1.5">
        {GOOGLE_IDENTITIES.map((identity, idx) => (
          <li key={identity.email}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSelect(identity.email, identity.name)}
              className="flex w-full items-center gap-2.5 border border-line bg-void p-2 text-left transition-colors duration-150 ease-out hover:border-nexus hover:bg-nexus/5 disabled:opacity-50 group"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                idx === 0
                  ? 'bg-nexus/20 text-nexus border border-nexus/50'
                  : 'bg-surface border border-line2 text-ink'
              }`}>
                {identity.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate font-mono text-2xs font-semibold text-ink group-hover:text-nexus">
                    {identity.name}
                  </span>
                  {idx === 0 && (
                    <span className="shrink-0 font-mono text-3xs text-nexus border border-nexus/30 bg-nexus/10 px-1 py-0.2">
                      LOGGED IN
                    </span>
                  )}
                </span>
                <span className="block truncate font-mono text-3xs text-dimmer">
                  {identity.email}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Trigger popup window explicitly */}
      {onLaunchPopup && (
        <button
          type="button"
          disabled={pending}
          onClick={onLaunchPopup}
          className="flex w-full items-center justify-center gap-2 border border-nexus/40 bg-nexus/10 py-2 font-mono text-3xs font-bold tracking-widest text-nexus transition-colors duration-150 ease-out hover:bg-nexus/20 hover:border-nexus"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          OPEN FIREBASE GOOGLE POPUP
        </button>
      )}

      {useCustom ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) onSelect(custom.trim())
          }}
          className="mt-2 space-y-2 border-t border-line pt-2"
        >
          <label className="block">
            <span className={labelCls}>OTHER_GMAIL_OR_GOOGLE_WORKSPACE</span>
            <input
              type="email"
              value={custom}
              autoFocus
              onChange={(e) => setCustom(e.target.value)}
              placeholder="name@gmail.com"
              className={fieldCls}
            />
          </label>
          <button type="submit" disabled={pending} className={primaryBtnCls}>
            {pending ? 'AUTHENTICATING…' : 'SIGN IN WITH THIS ACCOUNT'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setUseCustom(true)}
          className="flex w-full items-center gap-2 border border-line bg-void px-2 py-1.5 font-mono text-3xs text-dimmer hover:text-ink hover:border-line2 transition-colors"
        >
          <UserIcon className="h-3 w-3" />
          USE ANOTHER ACCOUNT
        </button>
      )}

      {pending && (
        <p className="text-center font-mono text-3xs tracking-widest text-nexus animate-pulse">
          CONNECTING TO FIREBASE AUTH…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 border border-hazard/60 bg-hazard/10 px-2 py-1.5 font-mono text-3xs tracking-widest text-hazard"
        >
          <AlertTriangleIcon className="h-3 w-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-3 flex w-full items-center justify-center gap-1.5 font-mono text-3xs tracking-widest text-dimmer transition-colors duration-150 ease-out hover:text-ink"
      >
        <ArrowLeftIcon className="h-3 w-3" aria-hidden />
        BACK TO CREDENTIALS
      </button>
    </div>
  )
}
