import React, { useState, useMemo } from 'react'
import { X, User, Building2, Phone, MapPin, FileText, CheckCircle2, GitBranch } from 'lucide-react'
import { STAGES, STAGE_SLA_MAP, stageLabel } from '../../types/zenith'
import type { OperatorRecord, RecordStatus, Stage } from '../../types/zenith'
import { PIPELINE_STATUS_OPTIONS, STAGE_OPTIONS } from '../../data/options'
import { getStatusMeta, isClientPausedOrRevoked, nextRecordId, statusMeta } from '../../utils/format'
import { useZenith } from '../../contexts/ZenithContext'

interface LeadModalProps {
  mode: 'ADD' | 'MODIFY'
  record?: OperatorRecord | null
  existingIds: string[]
  onSave: (record: OperatorRecord) => Promise<void>
  onClose: () => void
}

export function LeadModal({
  mode,
  record,
  existingIds,
  onSave,
  onClose,
}: LeadModalProps) {
  const { availableClients, records } = useZenith()
  const isAdd = mode === 'ADD'
  const leadIds = existingIds.filter((id) => id.startsWith('LD-') || id.startsWith('ZX-'))
  const defaultId = isAdd
    ? `LD-${String(leadIds.length + 101).padStart(3, '0')}`
    : record?.id || 'LD-101'

  const clientList = useMemo(() => {
    // Strictly respect availableClients, which filters out any paused or revoked clients
    return [...availableClients]
  }, [availableClients])

  // Required Fields for Lead: Name, Client, Notes, Phone Number, Address or Postcode
  const [name, setName] = useState<string>(record?.operator || '')
  const [client, setClient] = useState<string>(() => {
    if (record?.client && availableClients.includes(record.client)) {
      return record.client
    }
    return availableClients[0] || ''
  })
  const [customClient, setCustomClient] = useState<string>('')
  const [notes, setNotes] = useState<string>(record?.notes || '')
  const [phone, setPhone] = useState<string>(record?.phone || '')
  const [addressOrPostcode, setAddressOrPostcode] = useState<string>(record?.depot || record?.address || '')
  const [stage, setStage] = useState<Stage>(record?.stage || 'INTERVIEW')
  const [status, setStatus] = useState<RecordStatus>(record?.status || 'ACTIVE')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveClient = client === '__CUSTOM__' ? customClient.trim() : client

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    const trimmedClient = effectiveClient.trim()
    const trimmedAddress = addressOrPostcode.trim()

    if (!trimmedName) {
      setError('Please enter the lead name.')
      return
    }

    if (!trimmedClient) {
      setError('Please specify an associated client organization.')
      return
    }

    const isClientBlocked = records.some((r) => {
      const isClientRecord =
        r.recordType === 'CLIENT' || (r.id && (r.id.startsWith('CL-') || r.id.startsWith('CLIENT-')))
      if (!isClientRecord) return false
      if (!isClientPausedOrRevoked(r.status)) return false
      const nameKey = (r.client || r.operator || '').trim().toUpperCase()
      return nameKey === trimmedClient.toUpperCase()
    })

    if (isClientBlocked) {
      setError(`Client "${trimmedClient}" is currently PAUSED or REVOKED and cannot be selected.`)
      return
    }

    setSaving(true)
    try {
      const calculatedSla = STAGE_SLA_MAP[stage] ?? 20
      const fullRecord: OperatorRecord = {
        id: isAdd ? defaultId : record?.id || defaultId,
        codename: trimmedName.toUpperCase(),
        operator: trimmedName,
        client: trimmedClient.toUpperCase(),
        depot: trimmedAddress || 'UNSPECIFIED_LOCATION',
        address: trimmedAddress,
        phone: phone.trim(),
        notes: notes.trim() || 'Lead intake registered in pipeline.',
        stage,
        status,
        qc: record?.qc || 'QC-A1',
        station: record?.station || 'ST-01',
        startRow: record?.startRow || '1',
        endRow: record?.endRow || '100',
        sla: calculatedSla,
        recordType: 'LEAD',
        updatedAt: new Date().toISOString(),
      }

      await onSave(fullRecord)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-3 backdrop-blur-sm"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col border border-nexus/50 bg-surface shadow-2xl shadow-nexus/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center border border-nexus/40 bg-nexus/10 text-nexus">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h2 id="lead-modal-title" className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
                {isAdd ? 'PIPELINE // ADD_NEW_LEAD' : `PIPELINE // MODIFY_LEAD [${record?.id || defaultId}]`}
              </h2>
              <p className="font-mono text-3xs text-dimmer">
                {isAdd ? 'Intake a new operational lead into the pipeline' : `Update lead parameters for ${record?.operator || 'lead'}`}
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

        {/* Form Body - Asks for Name, Client, Notes, Phone Number, and Address or Postcode */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="term-scroll flex-1 space-y-3.5 overflow-y-auto p-4 text-ink">
            {error && (
              <div className="border border-hazard/60 bg-hazard/10 px-3 py-2 font-mono text-2xs text-hazard leading-relaxed">
                [ERROR] {error}
              </div>
            )}

            {/* 1. Name */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <User className="h-3 w-3 text-nexus" />
                NAME *
              </label>
              <input
                type="text"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Johnathan Vance, Sarah Connor"
                className="w-full border border-line bg-surface px-3 py-2 font-mono text-2xs text-ink placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* 2. Client */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <Building2 className="h-3 w-3 text-nexus" />
                CLIENT ORGANIZATION *
              </label>
              <select
                value={clientList.includes(client) ? client : '__CUSTOM__'}
                onChange={(e) => {
                  const val = e.target.value
                  setClient(val)
                  if (val !== '__CUSTOM__') setCustomClient('')
                }}
                className="w-full border border-line bg-surface px-3 py-2 font-mono text-2xs text-ink outline-none transition-colors focus:border-nexus"
              >
                {clientList.length > 0 ? (
                  clientList.map((c) => (
                    <option key={c} value={c} className="bg-surface">
                      {c}
                    </option>
                  ))
                ) : (
                  <option value="" disabled className="bg-surface">
                    NO REGISTERED CLIENTS IN REGISTRY
                  </option>
                )}
                <option value="__CUSTOM__" className="bg-surface text-nexus">
                  + SPECIFY CUSTOM CLIENT...
                </option>
              </select>

              {(client === '__CUSTOM__' || clientList.length === 0) && (
                <input
                  type="text"
                  required
                  value={customClient}
                  onChange={(e) => setCustomClient(e.target.value)}
                  placeholder="Enter corporate client name..."
                  className="mt-1 w-full border border-nexus bg-surface px-3 py-2 font-mono text-2xs text-ink outline-none"
                />
              )}
            </div>

            {/* 3. Phone Number */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-white">
                <Phone className="h-3 w-3 text-nexus" />
                PHONE NUMBER
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +1 (555) 234-5678"
                className="w-full border border-line bg-surface px-3 py-2 font-mono text-2xs text-white font-medium placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* 4. Address or Postcode */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <MapPin className="h-3 w-3 text-nexus" />
                ADDRESS OR POSTCODE
              </label>
              <input
                type="text"
                value={addressOrPostcode}
                onChange={(e) => setAddressOrPostcode(e.target.value)}
                placeholder="e.g. 742 Evergreen Terrace, NC 90210 or SW1A 1AA"
                className="w-full border border-line bg-surface px-3 py-2 font-mono text-2xs text-ink placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* 5. Notes */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                <FileText className="h-3 w-3 text-nexus" />
                NOTES
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lead intake directives, special notes, qualification details..."
                className="w-full resize-none border border-line bg-surface px-3 py-2 font-mono text-2xs text-[#00f2ff] placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>

            {/* 6. Stage & Pipeline Status */}
            <div className="grid grid-cols-2 gap-3 border-t border-line/60 pt-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                  <GitBranch className="h-3 w-3 text-nexus" />
                  STAGE
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as Stage)}
                  className="w-full border border-line bg-surface px-2.5 py-1.5 font-mono text-2xs text-ink outline-none transition-colors focus:border-nexus"
                >
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                  <span className="h-2 w-2 rounded-full bg-nexus" />
                  PIPELINE STATUS
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RecordStatus)}
                  className="w-full border border-line bg-surface px-2.5 py-1.5 font-mono text-2xs text-ink outline-none transition-colors focus:border-nexus"
                >
                  {PIPELINE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {getStatusMeta(s).label}
                    </option>
                  ))}
                </select>
              </div>
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
              {saving ? 'SAVING…' : isAdd ? 'INTAKE LEAD' : 'COMMIT MODIFICATIONS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
