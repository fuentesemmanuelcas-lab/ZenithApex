import React from 'react'
import { STAGES, stageLabel } from '../../types/zenith'
import type { RecordStatus, Stage } from '../../types/zenith'
import { getStatusMeta, isNegative } from '../../utils/format'

export function StageStepper({
  stage,
  status,
  compact = false,
}: {
  stage: Stage
  status: RecordStatus
  compact?: boolean
}) {
  const stageStr = String(stage).toUpperCase()
  const isHiddenStage =
    stage === 'N/A' || stage === 'BLANK' || stageStr === 'N/A' || stageStr === 'BLANK' || stageStr === 'NA'

  if (isHiddenStage) {
    if (compact) {
      return (
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Stage progression not applicable"
        >
          <span className="inline-flex items-center rounded-[1px] border border-line bg-surface2/60 px-1.5 py-0.5 font-mono text-3xs font-bold tracking-wider text-dimmer">
            STAGE: N/A
          </span>
        </div>
      )
    }

    return (
      <div
        className="flex items-center justify-center gap-2 w-full min-w-[340px] border border-dashed border-line/70 bg-void/40 py-1.5 px-3"
        role="group"
        aria-label="Stage progression excluded"
      >
        <span className="font-mono text-[10px] font-bold tracking-widest text-dimmer">
          STAGE PROGRESSION: N/A (EXCLUDED)
        </span>
      </div>
    )
  }

  const current = STAGES.indexOf(stage)
  const blocked = isNegative(status)
  const meta = getStatusMeta(status)
  const activeColor = meta.bar

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label={`Stage ${stageLabel(stage)}`}
      >
        <div className="flex items-center gap-0.5">
          {STAGES.map((s, i) => {
            const done = i <= current
            const isCurrent = i === current
            return (
              <span
                key={s}
                className={`block h-1.5 w-3.5 rounded-[1px] ${
                  done ? activeColor : 'bg-line2'
                } ${done && isCurrent && !blocked ? 'shadow-[0_0_6px_rgba(0,242,255,0.7)]' : ''}`}
              />
            )
          })}
        </div>
        <span className="font-mono text-3xs font-bold tracking-wider text-ink">
          {stageLabel(stage)}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 w-full min-w-[340px]"
      role="group"
      aria-label={`Stage ${stageLabel(stage)}`}
    >
      {STAGES.map((s, i) => {
        const done = i <= current
        const isCurrent = i === current
        const label = stageLabel(s)

        return (
          <React.Fragment key={s}>
            <div className="flex flex-1 flex-col items-center gap-1 min-w-[56px] w-full">
              {/* Step bar */}
              <span
                className={`block h-2 w-full transition-all duration-200 rounded-[1px] ${
                  done ? activeColor : 'bg-line2'
                } ${isCurrent && !blocked ? 'shadow-[0_0_8px_rgba(0,242,255,0.8)]' : ''}`}
              />
              {/* Full stage label */}
              <span
                className={`font-mono text-[9px] font-medium tracking-tight text-center truncate w-full ${
                  isCurrent
                    ? 'text-nexus font-bold text-glow-nexus'
                    : done
                      ? 'text-dim'
                      : 'text-dimmer/70'
                }`}
                title={label}
              >
                {label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <span
                className={`h-0.5 w-1 shrink-0 ${
                  i < current ? activeColor : 'bg-line2'
                }`}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

