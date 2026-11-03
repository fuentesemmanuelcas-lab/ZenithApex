import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FileTextIcon, XIcon } from 'lucide-react'
import type { OperatorRecord, RecordStatus, Stage } from '../../types/zenith'
import { PIPELINE_STATUS_OPTIONS, STAGE_OPTIONS } from '../../data/options'
import { getStatusMeta, statusMeta } from '../../utils/format'
import { useZenith } from '../../contexts/ZenithContext'

export interface MenuTarget {
  record: OperatorRecord
  rect: { left: number; right: number; top: number; bottom: number }
}

const MENU_W = 260

/**
 * #dashOptMenu — viewport-fixed quick-edit menu launched from a candidate
 * name button. Shards use hazard-red border-left in pipeline/summary context
 * and cyan in history context. Position flips on viewport collision.
 */
export function DashOptMenu({
  target,
  variant = 'HAZARD',
  onClose,
  onEditNotes,
}: {
  target: MenuTarget
  variant?: 'HAZARD' | 'NEXUS'
  onClose: () => void
  onEditNotes: () => void
}) {
  const { updateRecord, pushToast } = useZenith()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: target.rect.left,
    top: target.rect.bottom + 6,
  })
  const shard = variant === 'NEXUS' ? 'dash-opt-shard-cyan' : 'dash-opt-shard'
  const accent = variant === 'NEXUS' ? 'text-nexus' : 'text-hazard'

  /* Viewport collision detection — flip left/top when overflowing. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    let left = target.rect.left
    let top = target.rect.bottom + 6
    if (left + box.width > window.innerWidth - 8) left = Math.max(8, target.rect.right - box.width)
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, target.rect.top - box.height - 6)
    setPos({ left, top })
  }, [target])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const selectCls = `w-full border border-line2 bg-void px-1.5 py-1 font-mono text-2xs uppercase text-ink outline-none transition-colors duration-150 ease-out focus:border-nexus`

  return (
    <div
      id="dashOptMenu"
      ref={ref}
      role="dialog"
      aria-label={`Options for ${target.record.id}`}
      className="fixed z-[55]"
      style={{ left: pos.left, top: pos.top, width: MENU_W }}
    >
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <span className={`font-mono text-3xs tracking-widest ${accent}`}>
          {target.record.id} // OPT_MENU
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-dim transition-colors duration-150 ease-out hover:text-hazard"
        >
          <XIcon className="h-3 w-3" aria-hidden />
          <span className="sr-only">Close options</span>
        </button>
      </div>

      <div className="space-y-1.5 p-2">
        <div className={`${shard} px-2 py-1.5`}>
          <label
            className="mb-1 block font-mono text-3xs uppercase tracking-widest text-dim"
            htmlFor={`status-${target.record.id}`}
          >
            Lead Status
          </label>
          <select
            id={`status-${target.record.id}`}
            value={target.record.status}
            onChange={(e) => {
              const newStatus = e.target.value as RecordStatus
              void updateRecord(target.record.id, 'status', newStatus)
              if (newStatus === 'ONBOARDED' || newStatus === 'REJECTED' || newStatus === 'WITHDRAWN') {
                pushToast({
                  title: `LEAD ${newStatus}`,
                  body: `${target.record.operator} ${newStatus === 'ONBOARDED' ? 'onboarded' : newStatus.toLowerCase()}, moved to History Archives`,
                  tone: newStatus === 'ONBOARDED' ? 'nexus' : 'hazard',
                })
                onClose()
              } else {
                pushToast({
                  title: 'STATUS COMMITTED',
                  body: `${target.record.operator} status updated to ${getStatusMeta(newStatus).label}`,
                  tone: 'nexus',
                })
              }
            }}
            className={`${selectCls} ${getStatusMeta(target.record.status)?.text || 'text-ink'}`}
          >
            {PIPELINE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="text-ink">
                {getStatusMeta(s)?.label || s}
              </option>
            ))}
          </select>
        </div>

        <div className={`${shard} px-2 py-1.5`}>
          <label
            className="mb-1 block font-mono text-3xs uppercase tracking-widest text-dim"
            htmlFor={`stage-${target.record.id}`}
          >
            Application Stage
          </label>
          <select
            id={`stage-${target.record.id}`}
            value={target.record.stage}
            onChange={(e) => {
              const newStage = e.target.value as Stage
              void updateRecord(target.record.id, 'stage', newStage)
              pushToast({
                title: 'STAGE COMMITTED',
                body: `${target.record.operator} stage updated to ${newStage}`,
                tone: 'caution',
              })
            }}
            className={selectCls}
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`${shard} px-2 py-1.5`}>
          <label
            className="mb-1 block font-mono text-3xs uppercase tracking-widest text-dim"
            htmlFor={`depot-${target.record.id}`}
          >
            Location / Depot
          </label>
          <input
            id={`depot-${target.record.id}`}
            type="text"
            value={target.record.depot}
            onChange={(e) => void updateRecord(target.record.id, 'depot', e.target.value)}
            className={selectCls}
            placeholder="e.g. Distribution Hub, Address..."
          />
        </div>

        <button
          type="button"
          onClick={() => {
            onClose()
            onEditNotes()
          }}
          className={`${shard} flex w-full items-center justify-between px-2 py-2 text-left transition-colors duration-150 ease-out hover:bg-surface2`}
        >
          <span className="font-mono text-3xs uppercase tracking-widest text-ink">Edit Notes</span>
          <FileTextIcon className={`h-3 w-3 ${accent}`} aria-hidden />
        </button>
      </div>
    </div>
  )
}
