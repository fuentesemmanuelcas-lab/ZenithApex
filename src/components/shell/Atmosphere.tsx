import React, { useEffect, useState } from 'react'

/**
 * Background grid with scanning band and CRT vignette.
 * Purely decorative and GPU-accelerated — no JavaScript re-render loops.
 */
export function Atmosphere() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full opacity-[0.45]">
        <defs>
          <pattern
            id="zx-grid-fine"
            width={30}
            height={30}
            patternUnits="userSpaceOnUse"
          >
            <path d="M30 0 L0 0 0 30" fill="none" stroke="#141414" strokeWidth={1} />
          </pattern>
          <pattern
            id="zx-grid-coarse"
            width={150}
            height={150}
            patternUnits="userSpaceOnUse"
          >
            <path d="M150 0 L0 0 0 150" fill="none" stroke="#00f2ff" strokeOpacity={0.08} strokeWidth={1} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#zx-grid-fine)" />
        <rect width="100%" height="100%" fill="url(#zx-grid-coarse)" />
      </svg>

      <div className="scanline-band absolute inset-0" />
      {!reduced && (
        <div className="absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-nexus/[0.06] to-transparent" />
      )}
      <div className="crt-vignette absolute inset-0" />
    </div>
  )
}
