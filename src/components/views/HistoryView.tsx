import React, { useMemo, useState } from 'react'
import { Search, History as HistoryIcon } from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { getStatusMeta, relTime, shortStamp, statusMeta } from '../../utils/format'
import { PIPELINE_STATUS_OPTIONS } from '../../data/options'
import type { OperatorRecord, RecordStatus } from '../../types/zenith'

/** Only non-active statuses appear in Archival History (such as REJECTED, WITHDRAWN, ON_HOLD, UNRESPONSIVE, FILTERED) */
const ARCHIVED_ONLY = (s: RecordStatus): boolean => s !== 'ACTIVE'

const FILTERS: (RecordStatus | 'ALL')[] = ['ALL', ...PIPELINE_STATUS_OPTIONS.filter(ARCHIVED_ONLY)]

export function HistoryView({
  onSelect,
}: {
  onSelect?: (record: OperatorRecord, rect: DOMRect) => void
}) {
  const { records, device, updateRecord, pushToast } = useZenith()
  const [filter, setFilter] = useState<RecordStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const tablet = device === 'T'

  const archived = useMemo(
    () =>
      records
        .filter((r) => r.recordType !== 'CLIENT' && !r.id.startsWith('CL-')) // only leads
        .filter((r) => ARCHIVED_ONLY(r.status))
        .filter((r) => filter === 'ALL' || r.status === filter)
        .filter((r) => {
          if (!searchQuery) return true
          const q = searchQuery.toLowerCase()
          return (
            r.id.toLowerCase().includes(q) ||
            r.operator.toLowerCase().includes(q) ||
            r.client.toLowerCase().includes(q) ||
            r.depot.toLowerCase().includes(q) ||
            r.notes.toLowerCase().includes(q)
          )
        })
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [records, filter, searchQuery],
  )

  const handleStatusChange = async (r: OperatorRecord, targetStatus: RecordStatus) => {
    await updateRecord(r.id, 'status', targetStatus)
    pushToast({
      title: 'STATUS COMMITTED',
      body: `${r.operator} status updated to ${getStatusMeta(targetStatus).label}`,
      tone: 'nexus',
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-void text-ink">
      <header className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-3.5 w-3.5 text-nexus" />
          <h2 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
            ARCHIVAL_HISTORY
          </h2>
          <span className="font-mono text-3xs text-dimmer">
            {archived.length} ARCHIVED LEADS
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          <div className="flex items-center gap-1 border border-line bg-void px-2 py-0.5">
            <Search className="h-3 w-3 text-dimmer" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-32 bg-transparent font-mono text-3xs text-ink outline-none placeholder:text-dimmer"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`border px-1.5 py-[2px] font-mono text-3xs tracking-widest transition-colors duration-150 ease-out ${
                  filter === f
                    ? 'border-nexus/60 bg-nexus/15 text-nexus font-bold'
                    : 'border-line text-dimmer hover:text-ink'
                }`}
              >
                {f === 'ALL' ? 'ALL' : getStatusMeta(f).label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <ol className={`grid gap-2.5 ${tablet ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {archived.map((r) => {
            const meta = getStatusMeta(r.status)
            return (
              <li
                key={r.id}
                className={`flex flex-col justify-between border border-l-2 border-line bg-surface p-3 ${meta.left} transition-all hover:border-nexus/40`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1 shrink-0" aria-hidden>
                    <span className={meta.dot} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={(e) => onSelect(r, e.currentTarget.getBoundingClientRect())}
                        className="block max-w-full truncate text-left text-xs font-semibold text-ink transition-colors duration-150 ease-out hover:text-nexus"
                      >
                        {r.operator}{' '}
                        <span className="font-mono text-3xs text-dim">// {r.client}</span>
                      </button>
                    ) : (
                      <p className="truncate text-xs font-semibold text-ink">
                        {r.operator} <span className="font-mono text-3xs text-dim">// {r.client}</span>
                      </p>
                    )}
                    <p className="truncate font-mono text-3xs text-dim mt-0.5">
                      ID: <span className="text-nexus">{r.id}</span> · LOC: {r.depot || r.address || 'N/A'}{' '}
                      {r.phone && (
                        <span className="font-semibold text-white">
                          · TEL: {r.phone}
                        </span>
                      )}
                    </p>
                    {r.notes && (
                      <p className="mt-1.5 line-clamp-2 font-mono text-3xs text-[#00f2ff] bg-surface2/60 border border-line/40 p-1.5">
                        {r.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block border px-1.5 py-[1px] font-mono text-3xs font-bold tracking-wider ${meta.border} ${meta.bg} ${meta.text}`}
                    >
                      {meta.label}
                    </span>
                    <p className="mt-1 font-mono text-3xs text-dimmer">{shortStamp(r.updatedAt)}</p>
                    <p className="font-mono text-3xs text-dimmer">MOD {relTime(r.updatedAt)}</p>
                  </div>
                </div>

                {/* Status Switcher */}
                <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2 font-mono text-3xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-dimmer">CHANGE STATUS:</span>
                    <select
                      value={r.status}
                      onChange={(e) => {
                        const next = e.target.value as RecordStatus
                        void handleStatusChange(r, next)
                      }}
                      className="border border-line bg-surface2 px-1.5 py-0.5 text-ink outline-none transition-colors focus:border-nexus"
                    >
                      {PIPELINE_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {getStatusMeta(st).label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            )
          })}
          {archived.length === 0 && (
            <li className="col-span-full p-8 text-center font-mono text-2xs text-dimmer">
              <HistoryIcon className="mx-auto mb-2 h-7 w-7 text-dimmer opacity-40" />
              <p className="font-bold text-ink">NO ARCHIVED RECORDS</p>
              <p className="mt-1 text-3xs text-dim">
                Onboarded, rejected, or archived leads will appear here. Changing any record's status to Active moves it back to the active pipeline.
              </p>
            </li>
          )}
        </ol>
      </div>
    </div>
  )
}
