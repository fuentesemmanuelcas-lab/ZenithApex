import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { STAGES, stageLabel } from '../../types/zenith'
import type { OperatorRecord } from '../../types/zenith'
import { isProgressing } from '../../utils/format'

export function DashGraph({
  records,
  compact = false,
}: {
  records: OperatorRecord[]
  compact?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)

  const buckets = STAGES.map((stage) => {
    const rows = records.filter((r) => r.stage === stage)
    return {
      stage,
      count: rows.length,
      blocked: rows.filter((r) => !isProgressing(r.status)).length,
    }
  })
  const max = Math.max(1, ...buckets.map((b) => b.count))

  return (
    <div className="dash-graph flex min-h-0 flex-1 flex-col">
      <div
        className={`relative flex min-h-0 flex-1 items-end border-b border-l border-line2 px-2 pb-px pt-4 ${
          compact ? 'gap-1.5' : 'gap-3'
        }`}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <span
            key={g}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
            style={{ bottom: `${g * 100}%` }}
          />
        ))}

        {buckets.map((b, i) => {
          const pct = (b.count / max) * 100
          const active = hover === i
          return (
            <div
              key={b.stage}
              className="relative flex h-full flex-1 flex-col justify-end cursor-pointer"
              onClick={() => setHover((prev) => (prev === i ? null : i))}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {active && (
                <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-nexus/60 bg-void px-1.5 py-1 font-mono text-3xs text-nexus">
                  {b.count} REC / {b.blocked} FLAG
                </div>
              )}
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: `${Math.max(pct, 3)}%`, opacity: 1 }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
                className={`w-full border-t ${
                  active ? 'border-nexus bg-nexus/35' : 'border-nexus/70 bg-nexus/15'
                }`}
                style={{
                  boxShadow: active ? '0 0 14px rgba(0,242,255,0.35)' : '0 0 6px rgba(0,242,255,0.12)',
                }}
              />
              {b.blocked > 0 && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 w-full border-t border-hazard bg-hazard/25"
                  style={{ height: `${Math.max((b.blocked / max) * 100, 2)}%` }}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className={`mt-2 flex px-2 ${compact ? 'gap-1.5' : 'gap-3'}`}>
        {buckets.map((b) => (
          <div key={b.stage} className="flex-1 text-center min-w-0">
            <p className="truncate font-mono text-[10px] font-bold tracking-tight text-nexus/90" title={stageLabel(b.stage)}>
              {stageLabel(b.stage)}
            </p>
            <p className="font-mono text-sm font-bold text-ink mt-0.5">{b.count}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
