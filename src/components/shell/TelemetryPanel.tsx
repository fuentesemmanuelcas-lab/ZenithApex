import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIcon,
  ArrowUpRightIcon,
  Building2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CompassIcon,
  RefreshCwIcon,
  UsersIcon,
  VideoIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { PanelHead } from '../ui/Primitives'
import { SidebarCalendar } from '../calendar/SidebarCalendar'

export function TelemetryPanel({
  onOpenProject,
  isDrawer = false,
  onClose,
}: {
  onOpenProject?: (projectId: string) => void
  isDrawer?: boolean
  onClose?: () => void
}) {
  const {
    records,
    events,
    userFiles,
    latency,
    syncCycle,
    logs,
    refresh,
    loading,
    bridge,
    device,
    setView,
  } = useZenith()
  const [logsMinimized, setLogsMinimized] = useState(false)
  const feedRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const latTone = latency > 120 ? 'text-hazard' : latency > 70 ? 'text-caution' : 'text-nexus'

  // Upcoming briefings / calendar events
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => e.date >= todayIso)
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .slice(0, 3)
  }, [events, todayIso])

  return (
    <aside
      aria-label="System telemetry"
      className="relative z-10 flex w-full flex-1 min-h-full shrink-0 flex-col gap-1.5 overflow-y-auto term-scroll p-1.5 bg-void"
    >
      {/* Desktop Panel Header with Quick Collapse */}
      {onClose && (
        <div className="flex items-center justify-between border border-line bg-surface px-2.5 py-1.5 text-3xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="font-semibold text-slate-100 tracking-wide">System Telemetry</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded border border-line2 bg-surface2 px-2 py-0.5 text-4xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
            title="Collapse telemetry panel (Fit screen)"
          >
            <span>FIT SCREEN</span>
            <span>✕</span>
          </button>
        </div>
      )}

      {/* 1. Tactical Calendar -------------------------------------------- */}
      <SidebarCalendar />

      {/* 2. Operations Agenda (Upcoming Briefings) ------------------------ */}
      <section className="corner-bracket border border-line bg-surface flex flex-col">
        <PanelHead
          label="SCHEDULED_BRIEFINGS"
          right={
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-4xs text-cyan-400 font-semibold">
                {upcomingEvents.length} UPCOMING
              </span>
              <button
                type="button"
                onClick={() => setView('DASH')}
                className="text-dim hover:text-cyan-400 text-4xs flex items-center transition-colors"
                title="Open calendar in dashboard"
              >
                <ArrowUpRightIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          }
        />
        <div className="p-1.5 space-y-1">
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => setView('DASH')}
                className="group flex cursor-pointer items-center justify-between border border-line bg-void px-2 py-1.5 hover:border-cyan-500/60 hover:bg-cyan-500/[0.04] transition-all rounded"
              >
                <div className="min-w-0 flex-1 truncate pr-1">
                  <div className="flex items-center gap-1.5 truncate font-semibold text-ink group-hover:text-cyan-300 text-3xs">
                    {ev.meet && <VideoIcon className="h-2.5 w-2.5 text-cyan-400 shrink-0" />}
                    <span className="truncate">{ev.title || 'Dispatch Briefing'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-dimmer text-4xs font-mono mt-0.5">
                    <span className="text-cyan-400 font-medium">{ev.date}</span>
                    <span>
                      {ev.start} - {ev.end}
                    </span>
                  </div>
                </div>
                {ev.meet ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setView('MEET')
                    }}
                    className="rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-4xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void transition-colors shrink-0"
                    title="Launch Google Meet"
                  >
                    JOIN
                  </button>
                ) : (
                  <span className="text-dim group-hover:text-cyan-400 text-3xs font-mono">»</span>
                )}
              </div>
            ))
          ) : (
            <div className="flex items-center justify-between border border-dashed border-line/60 bg-void/50 p-1.5 text-4xs text-dimmer rounded">
              <span>NO PENDING BRIEFINGS</span>
              <button
                type="button"
                onClick={() => setView('DASH')}
                className="font-bold text-cyan-400 hover:underline"
              >
                + SCHEDULE
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. System Status & Network Link (Zero Overlap Layout) ------------ */}
      <section className="corner-bracket border border-line bg-surface">
        <PanelHead
          label="INFRASTRUCTURE_GATEWAY"
          right={
            <button
              type="button"
              onClick={() => void refresh()}
              title="Force sync cycle"
              className="text-dim transition-colors duration-150 ease-out hover:text-cyan-400"
            >
              <RefreshCwIcon className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              <span className="sr-only">Force sync cycle</span>
            </button>
          }
        />
        <div className="space-y-2 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-slate-200 text-3xs tracking-wide truncate">
                Nexus Gateway
              </span>
            </div>
            <span
              className="font-mono text-4xs font-semibold text-slate-300 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/70 truncate shrink-0 max-w-[130px]"
              title={bridge === 'APPS_SCRIPT' ? 'Cloud Bridge Connected' : 'Local Fallback Storage'}
            >
              {bridge === 'APPS_SCRIPT' ? 'Cloud Bridge' : 'Local Fallback'}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-1.5 font-mono text-2xs">
            <div className="rounded border border-line bg-void px-2 py-1.5">
              <dt className="text-4xs text-dimmer uppercase font-medium">Sync Cycle</dt>
              <dd className="text-slate-100 font-semibold tabular-nums mt-0.5">{syncCycle}</dd>
            </div>
            <div className="rounded border border-line bg-void px-2 py-1.5">
              <dt className="text-4xs text-dimmer uppercase font-medium">Latency</dt>
              <dd className={`flex items-center gap-1 font-semibold tabular-nums mt-0.5 ${latTone}`}>
                <ActivityIcon className="h-3 w-3 shrink-0" aria-hidden />
                <span>{latency}ms</span>
              </dd>
            </div>
          </dl>

          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full transition-[width] duration-500 ease-out ${
                latency > 120 ? 'bg-rose-500' : latency > 70 ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(6, (latency / 180) * 100))}%` }}
            />
          </div>
        </div>
      </section>


      {/* 5. Quick Directives ---------------------------------------------- */}
      <section className="border border-line bg-surface">
        <PanelHead label="QUICK_DIRECTIVES" />
        <div className="p-1.5 grid grid-cols-2 gap-1 font-mono text-3xs">
          <button
            type="button"
            onClick={() => setView('PIPELINE')}
            className="flex items-center justify-between border border-line bg-void px-2 py-1 text-slate-300 hover:border-nexus hover:text-nexus hover:bg-nexus/[0.05] transition-all active:scale-95"
            title="Open Pipeline Intake"
          >
            <span>+ LEAD INTAKE</span>
            <UsersIcon className="h-2.5 w-2.5 text-nexus" />
          </button>
          <button
            type="button"
            onClick={() => setView('REGISTRY')}
            className="flex items-center justify-between border border-line bg-void px-2 py-1 text-slate-300 hover:border-nexus hover:text-nexus hover:bg-nexus/[0.05] transition-all active:scale-95"
            title="Open Client Registry"
          >
            <span>+ NEW CLIENT</span>
            <Building2Icon className="h-2.5 w-2.5 text-nexus" />
          </button>
          <button
            type="button"
            onClick={() => setView('MAP')}
            className="flex items-center justify-between border border-line bg-void px-2 py-1 text-slate-300 hover:border-nexus hover:text-nexus hover:bg-nexus/[0.05] transition-all active:scale-95"
            title="Open Tactical Map"
          >
            <span>TACTICAL MAP</span>
            <CompassIcon className="h-2.5 w-2.5 text-cyan-400" />
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center justify-between border border-line bg-void px-2 py-1 text-slate-300 hover:border-nexus hover:text-nexus hover:bg-nexus/[0.05] transition-all active:scale-95 disabled:opacity-50"
            title="Force Live Sync Cycle"
          >
            <span>FORCE SYNC</span>
            <RefreshCwIcon
              className={`h-2.5 w-2.5 text-caution ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </section>

      {/* 6. Live event stream / audit log (Expands to fill remaining vertical height) */}
      <section
        className="flex flex-col border border-line bg-surface transition-all duration-200 flex-1 min-h-[160px]"
      >
        <PanelHead
          label="AUDIT_EVENT_STREAM"
          right={
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <button
                type="button"
                onClick={() => setLogsMinimized((m) => !m)}
                className="flex items-center gap-1 rounded border border-line bg-void px-2 py-0.5 font-mono text-4xs text-dim hover:text-cyan-400 transition-colors active:scale-95"
                title={logsMinimized ? 'Expand audit event stream' : 'Minimize audit event stream'}
              >
                {logsMinimized ? (
                  <>
                    <span>EXPAND</span>
                    <ChevronDownIcon className="h-2.5 w-2.5" />
                  </>
                ) : (
                  <>
                    <span>MIN</span>
                    <ChevronUpIcon className="h-2.5 w-2.5" />
                  </>
                )}
              </button>
            </div>
          }
        />
        <ul
          ref={feedRef}
          className="term-scroll min-h-[120px] flex-1 overflow-y-auto bg-void p-2 font-mono text-3xs leading-relaxed divide-y divide-line/20"
        >
          {logs.slice(logsMinimized ? -8 : -30).map((l) => (
            <li key={l.id} className="py-1 flex items-start gap-1.5">
              <span className="text-dimmer shrink-0 font-semibold tabular-nums">[{l.ts}]</span>
              <span className="font-semibold text-slate-400 shrink-0">{l.operator}:</span>
              <span
                className={`truncate ${
                  l.tone === 'hazard'
                    ? 'text-rose-400'
                    : l.tone === 'caution'
                      ? 'text-amber-300'
                      : l.tone === 'nexus'
                        ? 'text-cyan-300 font-medium'
                        : 'text-slate-200'
                }`}
              >
                {l.action}
              </span>
            </li>
          ))}
          {logs.length === 0 && (
            <li className="text-dimmer text-center py-6">Awaiting telemetry events…</li>
          )}
        </ul>
      </section>
    </aside>
  )
}
