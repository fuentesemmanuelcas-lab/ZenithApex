import React, { useState } from 'react'
import { AlertTriangle, Trash2, X, ShieldAlert } from 'lucide-react'
import type { OperatorRecord } from '../../types/zenith'

interface DeleteClientModalProps {
  record: OperatorRecord
  onConfirm: (id: string) => Promise<void>
  onClose: () => void
}

export function DeleteClientModal({
  record,
  onConfirm,
  onClose,
}: DeleteClientModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePurge = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm(record.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purge command failed.')
      setDeleting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-3 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col border border-hazard/70 bg-surface shadow-2xl shadow-hazard/20 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-hazard/40 bg-hazard/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-hazard">
            <ShieldAlert className="h-4 w-4" />
            <h2 id="delete-modal-title" className="font-mono text-xs font-bold tracking-[0.2em]">
              PURGE_AUTHORIZATION_REQUIRED
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-5 w-5 items-center justify-center border border-hazard/40 text-hazard hover:bg-hazard/20"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 p-4 font-mono text-ink">
          {error && (
            <div className="border border-hazard bg-hazard/20 p-2 text-2xs text-hazard">
              [ERROR] {error}
            </div>
          )}

          <p className="text-2xs leading-relaxed text-hazard">
            WARNING: You are about to permanently purge this client record from the active operational registry and archive.
          </p>

          {/* Record Details Summary Card */}
          <div className="space-y-1.5 border border-line bg-void/70 p-3 text-3xs">
            <div className="flex justify-between border-b border-line/40 pb-1">
              <span className="text-dim">RECORD ID:</span>
              <span className="font-bold text-nexus">{record.id}</span>
            </div>
            <div className="flex justify-between border-b border-line/40 pb-1">
              <span className="text-dim">CLIENT ENTITY:</span>
              <span className="font-bold text-ink">{record.client}</span>
            </div>
            <div className="flex justify-between border-b border-line/40 pb-1">
              <span className="text-dim">OPERATOR / CONTACT:</span>
              <span className="text-ink">{record.operator} ({record.codename})</span>
            </div>
            <div className="flex justify-between border-b border-line/40 pb-1">
              <span className="text-dim">DEPOT LOCATION:</span>
              <span className="text-ink">{record.depot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">STAGE / STATUS:</span>
              <span className="text-caution">{record.stage} // {record.status}</span>
            </div>
          </div>

          <p className="text-3xs text-dimmer">
            This action will be logged in the Zenith telemetry audit ledger.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-line bg-surface2 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="border border-line px-3 py-1.5 font-mono text-2xs text-dim transition-colors hover:border-dim hover:text-ink disabled:opacity-50"
          >
            ABORT
          </button>
          <button
            type="button"
            onClick={handlePurge}
            disabled={deleting}
            className="flex items-center gap-1.5 border border-hazard bg-hazard/20 px-3.5 py-1.5 font-mono text-2xs font-bold tracking-widest text-hazard transition-colors hover:bg-hazard/30 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? 'PURGING...' : 'CONFIRM PURGE'}
          </button>
        </div>
      </div>
    </div>
  )
}
