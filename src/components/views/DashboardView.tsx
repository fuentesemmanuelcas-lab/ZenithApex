import React, { useMemo, useState } from 'react'
import { useZenith } from '../../contexts/ZenithContext'
import type { DashTab, OperatorRecord, RecordStatus } from '../../types/zenith'
import { PIPELINE_STATUS_OPTIONS, STATUSES } from '../../data/options'
import {
  freshnessColor,
  freshnessOf,
  getCandidateHealth,
  getStatusMeta,
  relTime,
  statusMeta,
} from '../../utils/format'
import type { Freshness } from '../../utils/format'
import { PanelHead } from '../ui/Primitives'
import { DashGraph } from '../dashboard/DashGraph'
import { DashOptMenu } from '../dashboard/DashOptMenu'
import type { MenuTarget } from '../dashboard/DashOptMenu'
import { DashNoteModal } from '../dashboard/DashNoteModal'
import { CalendarPanel } from '../calendar/CalendarPanel'
import { HistoryView } from './HistoryView'
import { GoogleDriveView } from '../drive/GoogleDriveView'
import { GmailView } from '../gmail/GmailView'
import { NotificationsView } from '../notifications/NotificationsView'
import { MyFilesPanel } from '../dashboard/MyFilesPanel'

const TABS: { key: DashTab; label: string }[] = [
  { key: 'SUMMARY', label: 'SUMMARY' },
  { key: 'GOOGLE_DRIVE', label: 'GOOGLE DRIVE' },
  { key: 'GMAIL', label: 'GMAIL INBOX' },
  { key: 'NOTIFICATIONS', label: 'NOTIFICATIONS' },
  { key: 'MY_FILES', label: 'MY FILES' },
  { key: 'HISTORY', label: 'HISTORY' },
  { key: 'CALENDAR', label: 'CALENDAR' },
]

export function DashboardView() {
  const { records, setView, device, latency, syncCycle, freshness, updateRecord, pushToast } = useZenith()
  const [tab, setTab] = useState<DashTab>('SUMMARY')
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const tablet = device === 'T'

  /** loadDSHFreshness() — hygiene rollup from the freshness cache, falling
   *  back to each record's own modification stamp. */
  const stampOf = (r: OperatorRecord) => freshness[r.id] ?? r.updatedAt

  // Candidate leads: all candidate records (non-clients) across Pipeline + History
  const allCandidateLeads = useMemo(
    () => records.filter((r) => r.recordType !== 'CLIENT' && !r.id.startsWith('CL-')),
    [records],
  )

  // Active pipeline leads
  const pipelineLeads = useMemo(
    () =>
      allCandidateLeads.filter(
        (r) => r.status !== 'REJECTED' && r.status !== 'WITHDRAWN' && r.status !== 'ONBOARDED',
      ),
    [allCandidateLeads],
  )

  // Archived history leads
  const historyLeads = useMemo(
    () =>
      allCandidateLeads.filter(
        (r) => r.status === 'REJECTED' || r.status === 'WITHDRAWN' || r.status === 'ONBOARDED',
      ),
    [allCandidateLeads],
  )

  // DATA_HYGIENE calculated strictly from active pipeline leads (1:1 match)
  const hygiene = useMemo(() => {
    const counts: Record<Freshness, number> = { NEW: 0, UPDATED: 0, NO_UPDATE: 0 }
    pipelineLeads.forEach((r) => {
      counts[freshnessOf(r)] += 1
    })
    return counts
  }, [pipelineLeads, freshness])

  // Status matrix checks BOTH Pipeline status and History
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PIPELINE_STATUS_OPTIONS.map((s) => [s, 0]),
    ) as Record<RecordStatus, number>
    allCandidateLeads.forEach((r) => {
      if (counts[r.status] !== undefined) {
        counts[r.status] += 1
      }
    })
    return counts
  }, [allCandidateLeads])

  const avgSla = pipelineLeads.length
    ? Math.round(pipelineLeads.reduce((n, r) => n + r.sla, 0) / pipelineLeads.length)
    : 0

  const openMenu = (record: OperatorRecord, rect: DOMRect) =>
    setMenu({
      record,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    })

  const live = (r: OperatorRecord) => records.find((x) => x.id === r.id) ?? r
  const menuTarget = menu ? { ...menu, record: live(menu.record) } : null
  const noteRecord = noteFor ? records.find((r) => r.id === noteFor) ?? null : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3.5 py-1.5">
        <div className="flex items-center gap-3.5 overflow-x-auto term-scroll max-w-full">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <h1 className="font-semibold text-xs tracking-wider text-slate-100 uppercase">
              Operations Overwatch
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0" role="tablist" aria-label="Dashboard sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                type="button"
                onClick={() => {
                  setTab(t.key)
                  setMenu(null)
                }}
                className={`rounded border min-h-[28px] px-2.5 py-1 text-3xs font-semibold tracking-wide transition-all duration-150 ease-out active:scale-95 ${
                  tab === t.key
                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'border-line text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <span className="font-mono text-3xs text-dimmer hidden sm:inline shrink-0 tabular-nums">
          CYCLE {syncCycle} · {latency}ms
        </span>
      </header>

      {tab === 'GOOGLE_DRIVE' && <GoogleDriveView />}
      {tab === 'GMAIL' && <GmailView />}
      {tab === 'NOTIFICATIONS' && <NotificationsView />}
      {tab === 'MY_FILES' && <MyFilesPanel />}
      {tab === 'HISTORY' && <HistoryView onSelect={openMenu} />}
      {tab === 'CALENDAR' && <CalendarPanel />}

      {tab === 'SUMMARY' && (
        <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
          <div className={`grid gap-3 ${tablet ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[1fr_280px]'}`}>
            {/* Primary: stage density graph strictly focusing on active pipeline leads */}
            <section className="corner-bracket border-beam-card flex h-[300px] flex-col">
              <PanelHead
                label="RECORD_DENSITY / STAGE"
                right={<span className="font-mono text-3xs text-dimmer">{pipelineLeads.length} PIPELINE LEADS</span>}
              />
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <DashGraph records={pipelineLeads} compact={tablet} />
              </div>
            </section>

            {/* Secondary column: KPIs + hygiene focusing on active pipeline leads & history */}
            <div className="flex flex-col gap-3">
              <section className="border border-line bg-surface">
                <PanelHead
                  label="STATUS_MATRIX"
                  right={
                    <span className="font-mono text-3xs text-dimmer">
                      PIPELINE: {pipelineLeads.length} · HISTORY: {historyLeads.length}
                    </span>
                  }
                />
                <dl className="space-y-1.5 p-2">
                  {PIPELINE_STATUS_OPTIONS.map((s) => {
                    const meta = getStatusMeta(s)
                    const count = statusCounts[s] ?? 0
                    const isHistory = s === 'ONBOARDED' || s === 'REJECTED' || s === 'WITHDRAWN'
                    const pct = allCandidateLeads.length ? (count / allCandidateLeads.length) * 100 : 0
                    return (
                      <div key={s}>
                        <div className="flex items-baseline justify-between font-mono text-3xs">
                          <dt className={`flex items-center gap-1.5 ${count ? meta.text : 'text-dimmer'}`}>
                            <span className="font-semibold">{meta.label}</span>
                            <span className="text-3xs text-dimmer font-normal">
                              ({isHistory ? 'HISTORY' : 'PIPELINE'})
                            </span>
                          </dt>
                          <dd className={`tabular-nums ${count ? 'text-ink font-semibold' : 'text-dimmer'}`}>
                            {count}
                          </dd>
                        </div>
                        <div className="mt-0.5 h-1 w-full bg-line">
                          <div
                            className={`h-full ${meta.bar} transition-[width] duration-200 ease-out`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </dl>
              </section>

              <section className="border border-line bg-surface">
                <PanelHead
                  label="DATA_HYGIENE"
                  tone="caution"
                  right={<span className="font-mono text-3xs text-dimmer">{pipelineLeads.length} ACTIVE LEADS</span>}
                />
                <ul className="space-y-1.5 p-2">
                  {(['NEW', 'UPDATED', 'NO_UPDATE'] as Freshness[]).map((f) => {
                    const pct = pipelineLeads.length ? (hygiene[f] / pipelineLeads.length) * 100 : 0
                    const label = f === 'NEW' ? 'NEW (<24H)' : f === 'UPDATED' ? 'UPDATED (24-48H)' : 'NO UPDATE (>48H)'
                    return (
                      <li key={f}>
                        <div className="flex items-center justify-between font-mono text-3xs">
                          <span className={freshnessColor[f]}>{label}</span>
                          <span className="text-dim">{hygiene[f]} REC</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full bg-line">
                          <div
                            className={`h-full ${
                              f === 'NEW' ? 'bg-nexus' : f === 'UPDATED' ? 'bg-caution' : 'bg-hazard'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          </div>

          <section className="border border-line bg-surface">
            <PanelHead
              label="CANDIDATE_INDEX"
              right={
                <span className="font-mono text-3xs text-dimmer">
                  {pipelineLeads.length} ACTIVE LEADS
                </span>
              }
            />
            <ul id="dash-list" className="grid gap-px bg-line grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {pipelineLeads.map((r) => {
                const meta = getStatusMeta(r.status)
                const candidateHealth = getCandidateHealth(r, stampOf(r))
                return (
                  <li
                    key={r.id}
                    className={`flex items-center gap-2 bg-surface px-2.5 py-2 transition-colors duration-150 ease-out border border-transparent ${candidateHealth.cardBorderHover}`}
                  >
                    <span className="font-mono text-2xs text-nexus font-bold">{r.id}</span>
                    <span className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => openMenu(r, e.currentTarget.getBoundingClientRect())}
                        className="block max-w-full truncate text-left text-2xs font-semibold text-ink transition-colors duration-150 ease-out hover:text-nexus"
                      >
                        {r.operator}
                      </button>
                      <span className="block truncate font-mono text-3xs text-dimmer">
                        {r.stage} · {r.client}
                        {r.phone && <span className="text-white font-medium"> · TEL: {r.phone}</span>} ·{' '}
                        {relTime(stampOf(r))}
                      </span>
                    </span>
                    <span
                      title={candidateHealth.label}
                      aria-label={candidateHealth.label}
                      className={`h-2 w-2 rounded-full shrink-0 ${candidateHealth.dotClass}`}
                    />
                    <span
                      className={`border px-1.5 py-0.5 font-mono text-3xs font-medium ${candidateHealth.badgeBorder} ${candidateHealth.badgeBg} ${candidateHealth.badgeText}`}
                      title={`${meta.label} (${candidateHealth.label})`}
                    >
                      {meta.label}
                    </span>
                  </li>
                )
              })}
              {pipelineLeads.length === 0 && (
                <li className="col-span-full bg-surface p-8 text-center font-mono text-2xs text-dimmer">
                  NO ACTIVE LEADS IN PIPELINE
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      {menuTarget && (
        <DashOptMenu
          target={menuTarget}
          variant={tab === 'HISTORY' ? 'NEXUS' : 'HAZARD'}
          onClose={() => setMenu(null)}
          onEditNotes={() => setNoteFor(menuTarget.record.id)}
        />
      )}
      {noteRecord && <DashNoteModal record={noteRecord} onClose={() => setNoteFor(null)} />}
    </div>
  )
}
