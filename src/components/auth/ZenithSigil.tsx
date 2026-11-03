import React from 'react'
import { motion } from 'framer-motion'

/** Animated corporate mark for the access gate — rings draw in, then the apex fills. */
export function ZenithSigil({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <motion.circle
          cx="100"
          cy="100"
          r="92"
          fill="none"
          stroke="#ff3131"
          strokeOpacity={0.5}
          strokeWidth="1"
          strokeDasharray="12 8"
          style={{ transformOrigin: '100px 100px' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        />
        <motion.circle
          cx="100"
          cy="100"
          r="74"
          fill="none"
          stroke="#ff3131"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1] }}
        />
        <motion.circle
          cx="100"
          cy="100"
          r="58"
          fill="none"
          stroke="#00f2ff"
          strokeOpacity={0.45}
          strokeWidth="1"
          strokeDasharray="4 6"
          style={{ transformOrigin: '100px 100px' }}
          animate={{ rotate: -360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        />

        {/* Apex chevrons */}
        <motion.g
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          <path d="M100 52 L142 122 L120 122 L100 88 L80 122 L58 122 Z" fill="#ff3131" />
          <path d="M100 106 L124 148 L76 148 Z" fill="#ff3131" fillOpacity={0.55} />
          <rect x="58" y="156" width="84" height="4" fill="#00f2ff" fillOpacity={0.8} />
        </motion.g>

        {/* Tick marks */}
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1="100"
            y1="4"
            x2="100"
            y2="16"
            stroke="#ff3131"
            strokeWidth="2"
            transform={`rotate(${deg} 100 100)`}
          />
        ))}
      </svg>
    </div>
  )
}
