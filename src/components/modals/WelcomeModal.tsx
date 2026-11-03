import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheckIcon,
  SparklesIcon,
  CheckCircle2Icon,
  RadioIcon,
  CpuIcon,
  ArrowRightIcon,
  XIcon,
} from 'lucide-react'
import type { Session } from '../../utils/authStore'
import { GlitchText } from '../auth/GlitchText'

interface WelcomeModalProps {
  session: Session
  onDismiss: () => void
}

export function WelcomeModal({ session, onDismiss }: WelcomeModalProps) {
  // Keyboard listener for fast dismissal via Enter or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcomeTitle"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-lg border border-nexus/60 bg-surface shadow-[0_0_35px_rgba(0,240,255,0.18)]"
        >
          {/* Top accent scanner line */}
          <div className="h-1 w-full bg-gradient-to-r from-nexus via-hazard to-nexus animate-pulse" />

          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-line bg-surface2 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-nexus animate-ping" />
              <span className="font-mono text-3xs font-bold tracking-[0.24em] text-nexus text-glow-nexus">
                AUTHENTICATION VERIFIED // NEURAL LINK LIVE
              </span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              title="Dismiss welcome message"
              className="text-dimmer hover:text-hazard transition-colors"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5">
            {/* Welcome Greeting */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-nexus/50 bg-nexus/10 text-nexus">
                <ShieldCheckIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-3xs font-semibold tracking-widest text-dimmer">
                  ZENITH APEX OS v4.2.1
                </p>
                <h2
                  id="welcomeTitle"
                  className="font-mono text-lg font-bold tracking-wider text-ink text-glow-ink sm:text-xl"
                >
                  WELCOME, <GlitchText text={session.name.toUpperCase()} />
                </h2>
                <p className="mt-1 font-mono text-2xs text-dim leading-relaxed">
                  Terminal initialized and neural routing synchronized. Your operations workspace is live.
                </p>
              </div>
            </div>

            {/* Operator Badges Grid */}
            <div className="grid grid-cols-2 gap-2 border border-line bg-void/60 p-3 font-mono text-3xs">
              <div className="space-y-0.5">
                <span className="text-dimmer">OPERATOR EMAIL</span>
                <p className="truncate text-ink font-bold">{session.email}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-dimmer">CLEARANCE</span>
                <p className="text-nexus font-bold">{session.clearance}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-dimmer">AUTH PROVIDER</span>
                <p className="text-caution font-bold">
                  {session.provider === 'GOOGLE' ? 'GOOGLE FEDERATED' : 'LOCAL VAULT'}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-dimmer">NODE CLUSTER</span>
                <p className="text-ink font-bold">TOKYO-03 // LIVE</p>
              </div>
            </div>

            {/* System Status Readout */}
            <div className="space-y-1.5 border-l-2 border-nexus/70 pl-3 font-mono text-3xs">
              <div className="flex items-center gap-2 text-ink">
                <CheckCircle2Icon className="h-3 w-3 text-nexus shrink-0" />
                <span>Pipeline Tracker: Synchronized</span>
              </div>
              <div className="flex items-center gap-2 text-ink">
                <CheckCircle2Icon className="h-3 w-3 text-nexus shrink-0" />
                <span>Nexus File Hub: Connected (Cloud Storage Node)</span>
              </div>
              <div className="flex items-center gap-2 text-ink">
                <CheckCircle2Icon className="h-3 w-3 text-nexus shrink-0" />
                <span>12-inch Display Adaptive Calibration: Calibrated</span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <button
                type="button"
                autoFocus
                onClick={onDismiss}
                className="group flex w-full items-center justify-center gap-2 border border-nexus bg-nexus/15 py-3 font-mono text-xs font-bold tracking-[0.24em] text-nexus transition-all duration-150 ease-out hover:bg-nexus hover:text-void shadow-[0_0_15px_rgba(0,240,255,0.25)]"
              >
                <span>ENTER CONSOLE WORKSPACE</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <p className="mt-2 text-center font-mono text-3xs text-dimmer">
                PRESS <kbd className="border border-line px-1 text-dim">ENTER</kbd> OR{' '}
                <kbd className="border border-line px-1 text-dim">ESC</kbd> TO CONTINUE
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
