import React, { useState } from 'react'
import { X, Building2, MapPin, CheckCircle2, Activity, Phone } from 'lucide-react'
import type { OperatorRecord, RecordStatus } from '../../types/zenith'
import { CLIENT_STATUS_OPTIONS } from '../../data/options'
import { nextRecordId } from '../../utils/format'

interface ClientModalProps {
  mode: 'ADD' | 'MODIFY'
  record?: OperatorRecord | null
  existingIds: string[]
  onSave: (record: OperatorRecord) => Promise<void>
  onClose: () => void
}

export function ClientModal({
  mode,
  record,
  existingIds,
  onSave,
  onClose,
}: ClientModalProps) {
  const isAdd = mode === 'ADD'
  
  // Calculate unique monotonic client ID
  const defaultId = React.useMemo(() => {
    if (!isAdd && record?.id) return record.id
    const maxNum = existingIds.reduce((max, id) => {
      const match = id.match(/^CL-(\d+)$/)
      if (match) {
        const val = parseInt(match[1], 10)
        return val > max ? val : max
      }
      return max
    }, 100)
    return `CL-${String(maxNum + 1).padStart(3, '0')}`
  }, [isAdd, record?.id, existingIds])

  const [clientName, setClientName] = useState<string>(record?.client || '')
  const [clientAddress, setClientAddress] = useState<string>(record?.depot || record?.address || '')
  const [phone, setPhone] = useState<string>(record?.phone || '')
  
  // Normalize initial status to ACTIVE, PAUSE, or REVOKE
  const initialStatus: RecordStatus = (() => {
    const raw = record?.status || 'ACTIVE'
    if (raw === 'ACTIVE') return 'ACTIVE'
    if (raw === 'PAUSE' || raw === 'PAUSED' || raw === 'ON_HOLD') return 'PAUSE'
    if (raw === 'REVOKE' || raw === 'REVOKED' || raw === 'REJECTED') return 'REVOKE'
    return 'ACTIVE'
  })()
  
  const [clientStatus, setClientStatus] = useState<RecordStatus>(initialStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedName = clientName.trim()
    const trimmedAddress = clientAddress.trim()

    if (!trimmedName) {
      setError('Please enter the name of the client.')
      return
    }

    if (!trimmedAddress) {
      setError('Please enter the client address.')
      return
    }

    setSaving(true)
    try {
      const fullRecord: OperatorRecord = {
        id: isAdd ? defaultId : record?.id || defaultId,
        codename: trimmedName.toUpperCase(),
        operator: trimmedName,
        client: trimmedName.toUpperCase(),
        depot: trimmedAddress,
        address: trimmedAddress,
        stage: record?.stage || 'ONBOARDED',
        status: clientStatus,
        phone: phone.trim(),
        notes: record?.notes || `Client organization registered at ${trimmedAddress}`,
        qc: record?.qc || 'QC-A1',
        station: record?.station || 'HQ-01',
        startRow: record?.startRow || '1',
        endRow: record?.endRow || '100',
        sla: record?.sla ?? 95,
        recordType: 'CLIENT',
        updatedAt: new Date().toISOString(),
      }

      await onSave(fullRecord)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit client record.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-3 backdrop-blur-sm"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col border border-nexus/50 bg-surface shadow-2xl shadow-nexus/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center border border-nexus/40 bg-nexus/10 text-nexus">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 id="client-modal-title" className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
                {isAdd ? 'REGISTRY // ADD_CLIENT' : `REGISTRY // MODIFY_CLIENT [${record?.id || defaultId}]`}
              </h2>
              <p className="font-mono text-3xs text-dimmer">
                {isAdd ? 'Register a new corporate client organization' : `Update details for ${record?.client || 'client'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-6 w-6 items-center justify-center border border-line text-dim transition-colors hover:border-hazard hover:bg-hazard/10 hover:text-hazard"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Form Body - Asks for Client Name, Client Address, and Status (Active, Pause, Revoke) */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 p-5 text-ink">
            {error && (
              <div className="border border-hazard/60 bg-hazard/10 px-3 py-2 font-mono text-2xs text-hazard leading-relaxed">
                [ERROR] {error}
              </div>
            )}

            {/* Field 1: Name of the Client */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <Building2 className="h-3 w-3 text-nexus" />
                NAME OF THE CLIENT *
              </label>
              <input
                type="text"
                autoFocus
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. DHL Express, Amazon Logistics, Freight Corp"
                className="w-full border border-line bg-surface px-3 py-2 font-mono text-2xs text-ink placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* Field 2: Client Address */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <MapPin className="h-3 w-3 text-nexus" />
                CLIENT ADDRESS *
              </label>
              <textarea
                required
                rows={3}
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="e.g. 100 High Street, London, EC1A 1BB"
                className="w-full resize-none border border-line bg-surface px-3 py-2 font-mono text-2xs text-ink placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* Field: Phone Number */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-white">
                <Phone className="h-3 w-3 text-nexus" />
                PHONE NUMBER
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +1 (555) 019-2834"
                className="w-full border border-line bg-surface px-3 py-2 font-mono text-2xs text-white font-medium placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* Field 3: Status Dropdown (ACTIVE, PAUSE, REVOKE) */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <Activity className="h-3 w-3 text-nexus" />
                CLIENT STATUS (ACTIVE / PAUSE / REVOKE) *
              </label>
              <select
                value={clientStatus}
                onChange={(e) => setClientStatus(e.target.value as RecordStatus)}
                className={`w-full border px-3 py-2 font-mono text-2xs font-bold outline-none transition-colors ${
                  clientStatus === 'ACTIVE'
                    ? 'border-nexus/60 bg-surface text-nexus'
                    : clientStatus === 'PAUSE'
                    ? 'border-caution/60 bg-surface text-caution'
                    : 'border-hazard/60 bg-surface text-hazard'
                }`}
              >
                <option value="ACTIVE" className="bg-surface text-nexus font-bold">
                  ACTIVE — Active client account & live routing
                </option>
                <option value="PAUSE" className="bg-surface text-caution font-bold">
                  PAUSE — Temporarily paused intake & operations
                </option>
                <option value="REVOKE" className="bg-surface text-hazard font-bold">
                  REVOKE — Revoked authorization & decommissioned
                </option>
              </select>
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface2 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="border border-line bg-surface px-3 py-1.5 font-mono text-2xs text-dim transition-colors hover:border-hazard hover:text-hazard"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 border border-nexus bg-nexus/20 px-4 py-1.5 font-mono text-2xs font-bold tracking-wider text-nexus transition-colors hover:bg-nexus hover:text-void disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {saving ? 'COMMITTING…' : isAdd ? 'REGISTER CLIENT' : 'SAVE CHANGES'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
