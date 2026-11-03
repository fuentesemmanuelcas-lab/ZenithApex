import React from 'react'
import { AlertTriangleIcon, LogOutIcon } from 'lucide-react'
import { TermButton } from '../ui/Primitives'

interface LogoutConfirmModalProps {
  onConfirm: () => void
  onCancel: () => void
}

/** Cyberpunk confirmation modal for terminating the operator session. */
export function LogoutConfirmModal({ onConfirm, onCancel }: LogoutConfirmModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
      aria-describedby="logout-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-4 backdrop-blur-sm"
    >
      <div className="corner-bracket corner-bracket-hazard relative w-full max-w-md border border-hazard/70 bg-surface p-5 shadow-[0_0_35px_rgba(255,49,49,0.2)] animate-[scaleIn_180ms_cubic-bezier(0.23,1,0.32,1)]">
        <header className="mb-4 flex items-center gap-2 border-b border-hazard/40 pb-3">
          <AlertTriangleIcon className="h-4 w-4 text-hazard animate-pulse" aria-hidden />
          <h2 id="logout-title" className="font-mono text-xs font-bold tracking-[0.2em] text-hazard text-glow-hazard">
            SESSION TERMINATION WARNING
          </h2>
        </header>

        <div className="space-y-3 font-mono text-2xs leading-relaxed text-ink">
          <p id="logout-desc" className="border-l-2 border-hazard/80 bg-hazard/10 px-3 py-2 text-hazard">
            You are terminating your session. Are you sure?
          </p>
          <p className="text-dim">
            All neural telemetry links will be severed and you will return to the Zenith Apex access gate.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="border border-line2 bg-void px-4 py-2 font-mono text-2xs tracking-widest text-dim transition-colors duration-150 ease-out hover:border-dim hover:text-ink"
          >
            NO
          </button>
          <TermButton
            tone="hazard"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 font-bold tracking-widest"
          >
            <LogOutIcon className="h-3.5 w-3.5" aria-hidden />
            YES
          </TermButton>
        </div>
      </div>
    </div>
  )
}
