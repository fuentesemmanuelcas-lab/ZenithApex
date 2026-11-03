import React, { useState, useMemo } from 'react'
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Building2,
  MapPin,
  Download,
  RotateCcw,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { REGISTRY_STATUS_OPTIONS } from '../../data/options'
import type { OperatorRecord, RecordStatus } from '../../types/zenith'
import { isClientPausedOrRevoked } from '../../utils/format'
import { ClientModal } from '../registry/ClientModal'
import { DeleteClientModal } from '../registry/DeleteClientModal'

export function RegistryView() {
  const { records, device, updateRecord, updateFullRecord, createRecord, deleteRecord, pushToast } = useZenith()
  const tablet = device === 'T'

  // Modals state
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    mode: 'ADD' | 'MODIFY'
    record?: OperatorRecord | null
  }>({
    isOpen: false,
    mode: 'ADD',
    record: null,
  })

  const [deleteTarget, setDeleteTarget] = useState<OperatorRecord | null>(null)

  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')

  // Isolate CLIENT records only (records where recordType === 'CLIENT' || id starts with 'CL-')
  const clientRecords = useMemo(
    () => records.filter((r) => r.recordType === 'CLIENT' || r.id.startsWith('CL-')),
    [records],
  )

  // Normalizer helper for client statuses
  const normalizeStatus = (status: string): RecordStatus => {
    if (status === 'ACTIVE') return 'ACTIVE'
    if (status === 'PAUSE' || status === 'PAUSED' || status === 'ON_HOLD') return 'PAUSE'
    if (status === 'REVOKE' || status === 'REVOKED' || status === 'REJECTED') return 'REVOKE'
    return (status as RecordStatus) || 'ACTIVE'
  }

  // Filtered client records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return clientRecords.filter((r) => {
      const currentNorm = normalizeStatus(r.status)
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'PAUSE' && !(r.status === 'PAUSE' || r.status === 'PAUSED' || r.status === 'ON_HOLD')) return false
        if (selectedStatus === 'REVOKE' && !(r.status === 'REVOKE' || r.status === 'REVOKED' || r.status === 'REJECTED')) return false
        if (selectedStatus === 'ACTIVE' && isClientPausedOrRevoked(r.status)) return false
        if (selectedStatus !== 'ACTIVE' && selectedStatus !== 'PAUSE' && selectedStatus !== 'REVOKE' && r.status !== selectedStatus) return false
      }
      if (!q) return true

      return (
        r.id.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q) ||
        r.depot.toLowerCase().includes(q) ||
        (r.address && r.address.toLowerCase().includes(q)) ||
        r.notes.toLowerCase().includes(q)
      )
    })
  }, [clientRecords, searchQuery, selectedStatus])

  // Aggregate stats
  const stats = useMemo(() => {
    const total = clientRecords.length
    const active = clientRecords.filter((r) => !isClientPausedOrRevoked(r.status)).length
    return { total, active }
  }, [clientRecords])

  // Save handler for Add/Modify modal
  const handleSaveClient = async (record: OperatorRecord) => {
    if (modalState.mode === 'ADD') {
      await createRecord(record)
      pushToast({
        title: 'CLIENT RECORD CREATED',
        body: `${record.client} (${record.id}) added to registry`,
        tone: 'nexus',
      })
    } else {
      await updateFullRecord(record)
      pushToast({
        title: 'CLIENT RECORD UPDATED',
        body: `Modifications saved for ${record.client} [${record.id}]`,
        tone: 'nexus',
      })
    }
  }

  // Delete handler
  const handleDeleteClient = async (id: string) => {
    const target = clientRecords.find((r) => r.id === id)
    await deleteRecord(id)
    pushToast({
      title: 'CLIENT RECORD PURGED',
      body: `${target?.client || id} removed from operational registry`,
      tone: 'hazard',
    })
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Client Name', 'Client Address', 'Status', 'Registered At']
    const rows = filteredRecords.map((r) => [
      r.id,
      `"${r.client.replace(/"/g, '""')}"`,
      `"${(r.depot || r.address || '').replace(/"/g, '""')}"`,
      r.status,
      r.updatedAt,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `zenith_client_registry_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const existingIds = useMemo(() => records.map((r) => r.id), [records])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-void text-ink">
      {/* Top Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-nexus" />
            <h1 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              CLIENT_REGISTRY
            </h1>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-1.5 font-mono text-3xs">
            <span className="border border-line/60 bg-surface2 px-2 py-0.5 text-dim">
              REGISTERED CLIENTS: <strong className="text-ink">{stats.total}</strong>
            </span>
            <span className="border border-line/60 bg-surface2 px-2 py-0.5 text-dim">
              ACTIVE: <strong className="text-nexus">{stats.active}</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {filteredRecords.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              title="Export filtered clients as CSV"
              className="flex items-center gap-1 border border-line bg-surface2 px-2.5 py-1 font-mono text-3xs tracking-wider text-dim transition-colors hover:border-dim hover:text-ink"
            >
              <Download className="h-3 w-3" />
              <span>EXPORT CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setModalState({ isOpen: true, mode: 'ADD', record: null })}
            className="flex items-center gap-1.5 border border-nexus bg-nexus/15 px-3 py-1 font-mono text-2xs font-bold tracking-widest text-nexus shadow-sm transition-all hover:bg-nexus/25 hover:text-glow-nexus"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ ADD CLIENT</span>
          </button>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-2">
        {/* Search Bar */}
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <input
            type="text"
            placeholder="Search client name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-line bg-void pl-8 pr-2.5 py-1 font-mono text-2xs text-ink outline-none transition-colors focus:border-nexus"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-3xs text-dim hover:text-hazard"
            >
              ×
            </button>
          )}
        </div>

        {/* Select Filters */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-3xs">
          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <span className="text-dimmer">STATUS:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-line bg-surface px-2 py-1 text-ink outline-none transition-colors focus:border-nexus"
            >
              <option value="ALL">ALL STATUSES</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSE">PAUSE</option>
              <option value="REVOKE">REVOKE</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(searchQuery || selectedStatus !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedStatus('ALL')
              }}
              title="Reset all filters"
              className="flex items-center gap-1 border border-line px-2 py-1 text-dim hover:border-hazard hover:text-hazard"
            >
              <RotateCcw className="h-3 w-3" />
              <span>RESET</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Grid */}
      <div className="term-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="sticky top-0 z-10 bg-surface2 shadow-sm">
            <tr className="font-mono text-3xs tracking-widest text-dimmer">
              <th scope="col" className="border-b border-r border-line px-3 py-2 text-left w-24">CLIENT ID</th>
              <th scope="col" className="border-b border-r border-line px-3 py-2 text-left">NAME OF THE CLIENT</th>
              <th scope="col" className="border-b border-r border-line px-3 py-2 text-left">CLIENT ADDRESS</th>
              <th scope="col" className="border-b border-r border-line px-3 py-2 text-left w-36">STATUS</th>
              <th scope="col" className="border-b border-line px-3 py-2 text-center w-24">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <div className="mx-auto max-w-sm space-y-3 font-mono">
                    <Building2 className="mx-auto h-8 w-8 text-dimmer opacity-40" />
                    <p className="font-bold text-ink">NO CLIENTS IN REGISTRY</p>
                    <p className="text-3xs text-dim leading-relaxed">
                      {searchQuery
                        ? 'No client records match the search filter.'
                        : 'Register corporate client organizations to maintain accounts and provide options for lead routing.'}
                    </p>
                    {!searchQuery && (
                      <button
                        type="button"
                        onClick={() => setModalState({ isOpen: true, mode: 'ADD', record: null })}
                        className="inline-flex items-center gap-1.5 border border-nexus bg-nexus/15 px-3.5 py-1.5 text-2xs font-bold tracking-widest text-nexus hover:bg-nexus/25"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        + ADD NEW CLIENT
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const currentStatus = normalizeStatus(r.status)
                return (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-nexus/[0.04] transition-colors group">
                    {/* ID */}
                    <td className="border-r border-line px-3 py-2 font-mono text-2xs font-bold text-nexus">
                      {r.id}
                    </td>

                    {/* Client Name (Read-only without clicking Modify) */}
                    <td className="border-r border-line px-3 py-2 font-mono text-2xs font-bold text-ink max-w-[220px] truncate">
                      <span title="Click Modify to edit client details">{r.client}</span>
                    </td>

                    {/* Client Address & Phone (Read-only without clicking Modify) */}
                    <td className="border-r border-line px-3 py-2 font-mono text-2xs text-dim max-w-[320px] truncate group-hover:text-ink">
                      <span title="Click Modify to edit client details">{r.depot || r.address || '—'}</span>
                      {r.phone && (
                        <span className="ml-2 font-semibold text-white">· TEL: {r.phone}</span>
                      )}
                    </td>

                    {/* Status Dropdown: ACTIVE, PAUSE, REVOKE */}
                    <td className="border-r border-line px-3 py-2 font-mono text-3xs">
                      <div className="relative inline-block w-full">
                        <select
                          value={currentStatus}
                          aria-label={`Change status for client ${r.client}`}
                          onChange={async (e) => {
                            const newStatus = e.target.value as RecordStatus
                            await updateRecord(r.id, 'status', newStatus)
                            pushToast({
                              title: 'STATUS_UPDATED',
                              body: `${r.client} status set to ${newStatus}`,
                              tone: newStatus === 'ACTIVE' ? 'nexus' : newStatus === 'PAUSE' ? 'caution' : 'hazard',
                            })
                          }}
                          className={`w-full min-h-[34px] cursor-pointer appearance-none border px-2.5 py-1.5 font-mono text-3xs font-bold outline-none transition-all active:scale-98 ${
                            currentStatus === 'ACTIVE'
                              ? 'border-nexus/60 bg-nexus/15 text-nexus focus:border-nexus focus:ring-1 focus:ring-nexus'
                              : currentStatus === 'PAUSE'
                              ? 'border-caution/60 bg-caution/15 text-caution focus:border-caution focus:ring-1 focus:ring-caution'
                              : 'border-hazard/60 bg-hazard/15 text-hazard focus:border-hazard focus:ring-1 focus:ring-hazard'
                          }`}
                        >
                          <option value="ACTIVE" className="bg-surface text-nexus font-bold">
                            ACTIVE
                          </option>
                          <option value="PAUSE" className="bg-surface text-caution font-bold">
                            PAUSE
                          </option>
                          <option value="REVOKE" className="bg-surface text-hazard font-bold">
                            REVOKE
                          </option>
                        </select>
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-2">
                        {/* Modify Button */}
                        <button
                          type="button"
                          onClick={() => setModalState({ isOpen: true, mode: 'MODIFY', record: r })}
                          title={`Modify client ${r.client}`}
                          className="flex h-8 w-8 items-center justify-center border border-line text-dim transition-all hover:border-nexus hover:bg-nexus/15 hover:text-nexus active:scale-95 shadow-sm"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          title={`Delete client ${r.client}`}
                          className="flex h-8 w-8 items-center justify-center border border-line text-dim transition-all hover:border-hazard hover:bg-hazard/15 hover:text-hazard active:scale-95 shadow-sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info Bar */}
      <footer className="flex shrink-0 items-center justify-between border-t border-line bg-surface px-3 py-1.5 font-mono text-3xs text-dimmer">
        <div className="flex items-center gap-3">
          <span>SHOWING {filteredRecords.length} OF {clientRecords.length} REGISTERED CLIENTS</span>
          <span>•</span>
          <span>SELECT STATUS DROPDOWN (ACTIVE / PAUSE / REVOKE) TO UPDATE</span>
        </div>
        <span>REGISTRY ISOLATION ACTIVE</span>
      </footer>

      {/* Client Modal (Add / Modify) */}
      {modalState.isOpen && (
        <ClientModal
          mode={modalState.mode}
          record={modalState.record}
          existingIds={existingIds}
          onSave={handleSaveClient}
          onClose={() => setModalState({ isOpen: false, mode: 'ADD', record: null })}
        />
      )}

      {/* Delete Client Modal */}
      {deleteTarget && (
        <DeleteClientModal
          record={deleteTarget}
          onConfirm={handleDeleteClient}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
