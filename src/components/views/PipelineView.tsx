import React, { useMemo, useState } from 'react'
import {
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  EditIcon,
  UserIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { STAGES, STAGE_SLA_MAP, stageLabel } from '../../types/zenith'
import type { OperatorRecord, RecordStatus, Stage } from '../../types/zenith'
import { PIPELINE_STATUS_OPTIONS, STAGE_OPTIONS } from '../../data/options'
import { getCandidateHealth, getStatusMeta, relTime, statusMeta } from '../../utils/format'
import { StageStepper } from '../pipeline/StageStepper'
import { Field, TermButton, inputCls } from '../ui/Primitives'
import { LeadModal } from '../pipeline/LeadModal'

export function PipelineView() {
  const { records, availableClients, device, updateRecord, updateFullRecord, deleteRecord, createRecord, pushToast } =
    useZenith()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    mode: 'ADD' | 'MODIFY'
    record?: OperatorRecord | null
  }>({
    isOpen: false,
    mode: 'ADD',
    record: null,
  })

  const tablet = device === 'T'

  // Only show LEADS in the pipeline (exclude CLIENT records, REJECTED, WITHDRAWN, and ONBOARDED leads)
  const rows = useMemo(
    () =>
      records
        .filter((r) => r.recordType !== 'CLIENT' && !r.id.startsWith('CL-'))
        .filter(
          (r) => r.status !== 'REJECTED' && r.status !== 'WITHDRAWN' && r.status !== 'ONBOARDED',
        )
        .filter((r) =>
          `${r.id} ${r.codename} ${r.operator} ${r.client} ${r.depot} ${r.notes}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    [records, query],
  )

  const handleSaveLead = async (record: OperatorRecord) => {
    if (modalState.mode === 'ADD') {
      await createRecord(record)
      if (record.status === 'ONBOARDED' || record.status === 'REJECTED' || record.status === 'WITHDRAWN') {
        pushToast({
          title: 'LEAD RECORDED & ARCHIVED',
          body: `${record.operator} (${record.client}) saved as ${getStatusMeta(record.status).label} and moved to History`,
          tone: record.status === 'ONBOARDED' ? 'nexus' : 'hazard',
        })
      } else {
        pushToast({
          title: 'LEAD INTAKE RECORDED',
          body: `${record.operator} (${record.client}) added to pipeline`,
          tone: 'nexus',
        })
        setExpanded(record.id)
      }
    } else {
      await updateFullRecord(record)
      if (record.status === 'ONBOARDED' || record.status === 'REJECTED' || record.status === 'WITHDRAWN') {
        pushToast({
          title: 'LEAD ARCHIVED',
          body: `${record.operator} status set to ${getStatusMeta(record.status).label} and moved to History`,
          tone: record.status === 'ONBOARDED' ? 'nexus' : 'hazard',
        })
        if (expanded === record.id) setExpanded(null)
      } else {
        pushToast({
          title: 'LEAD MODIFIED',
          body: `Directives updated for ${record.operator} [${record.id}]`,
          tone: 'nexus',
        })
      }
    }
  }

  const handleRejectLead = async (r: OperatorRecord) => {
    await updateRecord(r.id, 'status', 'REJECTED')
    pushToast({
      title: 'LEAD REJECTED',
      body: `${r.operator} removed from pipeline and moved to History Archives`,
      tone: 'hazard',
    })
    if (expanded === r.id) setExpanded(null)
  }

  const existingIds = useMemo(() => records.map((r) => r.id), [records])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
            PIPELINE_CONTROL
          </h1>
          <span className="font-mono text-3xs text-dimmer">
            {rows.length} ACTIVE LEADS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-line bg-void px-2 py-0.5">
            <SearchIcon className="h-3 w-3 text-dimmer shrink-0" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter leads…"
              aria-label="Filter records"
              className={`w-40 bg-transparent py-1 font-mono text-2xs text-ink outline-none placeholder:text-dimmer ${
                tablet ? 'w-32 sm:w-40' : ''
              }`}
            />
          </div>
          <TermButton
            onClick={() => setModalState({ isOpen: true, mode: 'ADD', record: null })}
            className="flex min-h-[34px] items-center gap-1.5 border-nexus bg-nexus/15 text-nexus hover:bg-nexus hover:text-void active:scale-95"
          >
            <PlusIcon className="h-3 w-3" aria-hidden />
            + ADD LEAD
          </TermButton>
        </div>
      </header>

      <div className="term-scroll min-h-0 flex-1 overflow-auto">
        <div className="min-w-[840px] w-full">
          <div
            className={`sticky top-0 z-10 grid items-center gap-3 border-b border-line bg-surface2 px-3 py-1.5 font-mono text-3xs tracking-widest text-dimmer ${
              tablet
                ? 'grid-cols-[70px_1fr_minmax(180px,1.2fr)_86px_24px]'
                : 'grid-cols-[70px_minmax(140px,1fr)_140px_minmax(360px,2fr)_96px_60px_70px_24px]'
            }`}
          >
          <span>ID</span>
          <span>LEAD NAME / POSTCODE</span>
          {!tablet && <span>CLIENT</span>}
          <span>STAGE</span>
          <span>STATUS</span>
          {!tablet && <span>SLA</span>}
          {!tablet && <span>UPDATED</span>}
          <span className="sr-only">Expand</span>
        </div>

        <ul>
          {rows.map((r) => {
            const meta = getStatusMeta(r.status)
            const health = getCandidateHealth(r, r.updatedAt)
            const open = expanded === r.id
            return (
              <li
                key={r.id}
                className={`border-b border-line/70 ${
                  r.status === 'ON_HOLD'
                    ? 'caution-stripes'
                    : r.status === 'UNRESPONSIVE' || r.status === 'WITHDRAWN'
                      ? 'hazard-stripes'
                      : ''
                } ${r.status === 'FILTERED' ? 'opacity-70' : ''} ${open ? 'bg-surface' : ''}`}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : r.id)}
                  className={`grid w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-nexus/[0.05] ${
                    tablet
                      ? 'grid-cols-[70px_1fr_minmax(180px,1.2fr)_86px_24px]'
                      : 'grid-cols-[70px_minmax(140px,1fr)_140px_minmax(360px,2fr)_96px_60px_70px_24px]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-mono text-2xs font-bold text-nexus">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${health.dotClass}`} title={health.label} />
                    <span>{r.id}</span>
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink">{r.operator}</span>
                    <span className="block truncate font-mono text-3xs text-dim">
                      {r.depot || r.address || 'NO_ADDRESS'}
                      {r.phone && (
                        <>
                          {' '}· <span className="font-semibold text-white">TEL: {r.phone}</span>
                        </>
                      )}
                    </span>
                  </span>
                  {!tablet && (
                    <span className="truncate font-mono text-2xs text-dim">{r.client}</span>
                  )}
                  <StageStepper
                    stage={r.stage}
                    status={r.status}
                    compact={tablet}
                  />
                  <span
                    className={`border px-1.5 py-[2px] text-center font-mono text-3xs tracking-wider ${meta.border} ${meta.bg} ${meta.text}`}
                  >
                    {meta.label}
                  </span>
                  {!tablet && (
                    <span className="font-mono text-2xs">
                      <span
                        className={
                          r.sla >= 80 ? 'text-nexus' : r.sla >= 50 ? 'text-caution' : 'text-hazard'
                        }
                      >
                        {r.sla}%
                      </span>
                    </span>
                  )}
                  {!tablet && <span className="font-mono text-3xs text-dimmer">{relTime(r.updatedAt)}</span>}
                  <ChevronRightIcon
                    className={`h-3.5 w-3.5 text-dim transition-transform duration-150 ease-out ${
                      open ? 'rotate-90 text-nexus' : ''
                    }`}
                    aria-hidden
                  />
                </button>

                {open && (
                  <div className="pipeline-detail-row corner-bracket mx-3 mb-2 border border-nexus/30 p-3">
                    <div
                      className={`grid gap-3 ${tablet ? 'grid-cols-2' : 'grid-cols-4'}`}
                    >
                      <Field label="LEAD NAME">
                        <div className="flex items-center min-h-[34px] w-full border border-line/60 bg-void/50 px-2.5 py-1.5 font-mono text-2xs text-ink truncate select-text cursor-default">
                          {r.operator || '—'}
                        </div>
                      </Field>
                      <Field label="CLIENT ORGANIZATION">
                        <div className="flex items-center min-h-[34px] w-full border border-line/60 bg-void/50 px-2.5 py-1.5 font-mono text-2xs text-ink truncate select-text cursor-default">
                          {r.client || 'UNASSIGNED'}
                        </div>
                      </Field>
                      <Field label="ADDRESS / POSTCODE">
                        <div className="flex items-center min-h-[34px] w-full border border-line/60 bg-void/50 px-2.5 py-1.5 font-mono text-2xs text-ink truncate select-text cursor-default">
                          {r.depot || r.address || '—'}
                        </div>
                      </Field>
                      <Field label="PHONE NUMBER">
                        <div className="flex items-center min-h-[34px] w-full border border-line/60 bg-void/50 px-2.5 py-1.5 font-mono text-2xs truncate select-text cursor-default">
                          {r.phone ? (
                            <span className="font-semibold text-white tracking-wide">{r.phone}</span>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </div>
                      </Field>
                      <Field label="APPLICATION STAGE">
                        <select
                          value={r.stage}
                          onChange={(e) => {
                            const newStage = e.target.value as Stage
                            const newSla = STAGE_SLA_MAP[newStage] ?? 0
                            void updateRecord(r.id, 'stage', newStage)
                            void updateRecord(r.id, 'sla', newSla)
                            pushToast({
                              title: 'STAGE COMMITTED',
                              body: `Application stage changed to ${stageLabel(newStage)} (SLA: ${newSla}%)`,
                              tone: 'nexus',
                            })
                          }}
                          className={inputCls}
                        >
                          {STAGE_OPTIONS.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="STATUS">
                        <select
                          value={r.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as RecordStatus
                            if (newStatus === 'REJECTED' || newStatus === 'WITHDRAWN' || newStatus === 'ONBOARDED') {
                              void updateRecord(r.id, 'status', newStatus)
                              pushToast({
                                title: `LEAD ${newStatus}`,
                                body: `${r.operator} ${newStatus === 'ONBOARDED' ? 'onboarded' : newStatus.toLowerCase()}, removed from pipeline and moved to History`,
                                tone: newStatus === 'ONBOARDED' ? 'nexus' : 'hazard',
                              })
                              if (expanded === r.id) setExpanded(null)
                            } else {
                              void updateRecord(r.id, 'status', newStatus)
                              pushToast({
                                title: 'STATUS COMMITTED',
                                body: `${r.operator} status updated to ${getStatusMeta(newStatus).label}`,
                                tone: 'nexus',
                              })
                            }
                          }}
                          className={`${inputCls} ${getStatusMeta(r.status).text}`}
                        >
                          {PIPELINE_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s} className="text-ink">
                              {getStatusMeta(s).label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      
                      {/* Action buttons */}
                      <div className="flex items-end gap-2">
                        <TermButton
                          onClick={() => setModalState({ isOpen: true, mode: 'MODIFY', record: r })}
                          className="flex flex-1 items-center justify-center gap-1.5 border-nexus/50 bg-nexus/15 text-nexus hover:bg-nexus hover:text-void font-bold transition-all shadow-[0_0_8px_rgba(0,242,255,0.2)]"
                          title="Modify lead info through Edit Lead modal"
                        >
                          <EditIcon className="h-3.5 w-3.5" aria-hidden />
                          <span>EDIT LEAD</span>
                        </TermButton>
                        <TermButton
                          tone="hazard"
                          onClick={() => void deleteRecord(r.id)}
                          className="flex items-center justify-center gap-1 border-line text-dim hover:text-hazard"
                          title="Purge lead permanently"
                        >
                          <Trash2Icon className="h-3.5 w-3.5" aria-hidden />
                        </TermButton>
                      </div>

                      <div className="col-span-full">
                        <Field label="NOTES">
                          <div className="min-h-[46px] w-full border border-line/60 bg-void/50 px-2.5 py-1.5 font-mono text-2xs text-[#00f2ff] leading-relaxed cursor-default select-text whitespace-pre-wrap">
                            {r.notes || <span className="text-dimmer italic">No notes recorded. Click EDIT LEAD to modify directives.</span>}
                          </div>
                        </Field>
                      </div>

                      {/* Display-Only Stage Progression Timeline */}
                      <div className="col-span-full border-t border-line/60 pt-2.5 mt-1 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-3xs text-dimmer tracking-widest font-bold">
                            STAGE PROGRESSION (DISPLAY ONLY) //
                          </span>
                          <span className="font-mono text-2xs font-bold text-nexus">
                            CURRENT: {stageLabel(r.stage)}
                          </span>
                        </div>
                        <StageStepper stage={r.stage} status={r.status} />
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
          {rows.length === 0 && (
            <li className="p-8 text-center font-mono text-2xs text-dimmer">
              <UserIcon className="mx-auto mb-2 h-8 w-8 text-dimmer opacity-40" />
              <p className="font-bold text-ink">NO LEADS IN OPERATIONAL PIPELINE</p>
              <p className="mt-1 text-3xs text-dim">
                {query ? 'Adjust search filter to match records' : 'Register a new intake lead to populate the pipeline'}
              </p>
              {!query && (
                <button
                  type="button"
                  onClick={() => setModalState({ isOpen: true, mode: 'ADD', record: null })}
                  className="mt-3 inline-flex items-center gap-1.5 border border-nexus bg-nexus/15 px-3 py-1.5 font-mono text-2xs text-nexus hover:bg-nexus hover:text-void"
                >
                  <PlusIcon className="h-3 w-3" />
                  + INTAKE FIRST LEAD
                </button>
              )}
            </li>
          )}
        </ul>
        </div>
      </div>

      {/* Add / Modify Lead Modal */}
      {modalState.isOpen && (
        <LeadModal
          mode={modalState.mode}
          record={modalState.record}
          existingIds={existingIds}
          onSave={handleSaveLead}
          onClose={() => setModalState({ isOpen: false, mode: 'ADD', record: null })}
        />
      )}
    </div>
  )
}
