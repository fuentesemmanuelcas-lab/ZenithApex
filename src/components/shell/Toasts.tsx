import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRingIcon, XIcon } from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'

const tone = {
  nexus: 'border-nexus/60 text-nexus',
  hazard: 'border-hazard/60 text-hazard',
  caution: 'border-caution/60 text-caution',
}

export function Toasts() {
  const { toasts, dismissToast } = useZenith()

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-1/2 z-[70] flex w-[340px] -translate-x-1/2 flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className={`cal-toast pointer-events-auto flex items-start gap-2 border px-2 py-2 ${tone[t.tone]}`}
          >
            <BellRingIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-3xs tracking-widest">{t.title}</p>
              <p className="mt-0.5 text-2xs text-ink">{t.body}</p>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-dim transition-colors duration-150 ease-out hover:text-ink"
            >
              <XIcon className="h-3 w-3" aria-hidden />
              <span className="sr-only">Dismiss</span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
