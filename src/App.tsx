import React, { useEffect, useState } from 'react'
import { ZenithProvider, useZenith } from './contexts/ZenithContext'
import { Atmosphere } from './components/shell/Atmosphere'
import { IconSidebar } from './components/shell/IconSidebar'
import { TelemetryPanel } from './components/shell/TelemetryPanel'
import { Toasts } from './components/shell/Toasts'
import { PipelineView } from './components/views/PipelineView'
import { RegistryView } from './components/views/RegistryView'
import { HistoryView } from './components/views/HistoryView'
import { MapView } from './components/views/MapView'
import { DashboardView } from './components/views/DashboardView'
import { GoogleDriveView } from './components/drive/GoogleDriveView'
import { GmailView } from './components/gmail/GmailView'
import { NotificationsView } from './components/notifications/NotificationsView'
import { GoogleMeetView } from './components/views/GoogleMeetView'
import { MyFilesPanel } from './components/dashboard/MyFilesPanel'
import { WorkspaceTabBar } from './components/shell/WorkspaceTabBar'
import { ProjectModal } from './components/modals/ProjectModal'
import { LogoutConfirmModal } from './components/modals/LogoutConfirmModal'
import { WelcomeModal } from './components/modals/WelcomeModal'
import { AuthGate } from './components/auth/AuthGate'
import {
  clearSession,
  loadSession,
  logout,
  saveSession,
  subscribeToAuth,
  type Session,
} from './utils/authStore'

function TopBar({
  session,
  onDisconnect,
  isTelemetryOpen,
  onToggleTelemetry,
}: {
  session: Session
  onDisconnect: () => void
  isTelemetryOpen?: boolean
  onToggleTelemetry?: () => void
}) {
  const { view, device, bridge, loading, error, records, latency } = useZenith()
  const [clock, setClock] = useState(new Date().toTimeString().slice(0, 8))
  const isTablet = device === 'T'

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date().toTimeString().slice(0, 8)), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <header className="relative z-10 flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 py-1 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs font-bold tracking-[0.2em] text-hazard text-glow-hazard">
          ZENITH APEX OS
        </span>
        <span className="font-mono text-3xs font-semibold text-slate-300">
          <span className="text-nexus font-bold">{view}</span> · {isTablet ? 'TABLET' : 'DESKTOP'}
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-3xs font-semibold">
        {error ? (
          <span className="border border-hazard bg-hazard/20 px-2 py-0.5 font-bold text-hazard animate-pulse">
            LINK_ERROR
          </span>
        ) : loading ? (
          <span className="border border-caution bg-caution/20 px-2 py-0.5 font-bold text-caution">
            SYNCING…
          </span>
        ) : (
          <span className="border border-nexus bg-nexus/15 px-2 py-0.5 font-bold text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]">
            {records.length} REC
          </span>
        )}

        <span className="text-slate-300 hidden lg:inline">{bridge}</span>
        <span className="text-white font-bold font-mono tracking-wider hidden sm:inline">{clock}</span>
        <span className="border-l border-line pl-2 text-slate-200 hidden md:inline truncate max-w-[140px]">
          {session.name} <span className="text-nexus font-bold">[{session.clearance}]</span>
        </span>

        {/* Telemetry Panel Toggle (Desktop & Tablet) */}
        {onToggleTelemetry && (
          <button
            type="button"
            onClick={onToggleTelemetry}
            className={`flex items-center gap-1.5 border px-2.5 py-1 font-mono text-3xs font-bold transition-all shadow-sm ${
              isTelemetryOpen
                ? 'border-nexus bg-nexus/25 text-nexus shadow-[0_0_10px_rgba(0,243,255,0.3)] ring-1 ring-nexus/50'
                : 'border-line2 bg-surface text-slate-300 hover:border-nexus hover:text-white'
            }`}
            title={isTelemetryOpen ? 'Collapse side telemetry panel (Fit screen to full width)' : 'Expand side telemetry panel'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isTelemetryOpen ? 'bg-nexus animate-pulse' : 'bg-slate-500'}`} />
            <span>{isTelemetryOpen ? 'HUD: ON' : 'HUD: OFF'}</span>
            <span className="text-4xs text-dimmer">({latency}ms)</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDisconnect}
          className="border border-hazard bg-hazard/15 px-2.5 py-1 font-mono text-3xs font-bold tracking-wider text-hazard transition-colors duration-150 ease-out hover:bg-hazard hover:text-white"
          title="Sign out and return to authentication gate"
        >
          LOGOUT
        </button>
      </div>
    </header>
  )
}

function Shell({
  session,
  showWelcome,
  onCloseWelcome,
  onDisconnect,
}: {
  session: Session
  showWelcome: boolean
  onCloseWelcome: () => void
  onDisconnect: () => void
}) {
  const { view, openTabs, device } = useZenith()
  const [project, setProject] = useState<string | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('zenith_telemetry_open')
      if (saved !== null) return saved === 'true'
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      return window.innerWidth > 1440
    }
    return false
  })
  const isTablet = device === 'T'

  const toggleTelemetry = () => {
    setIsTelemetryOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('zenith_telemetry_open', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-void">
      <Atmosphere />
      <TopBar
        session={session}
        onDisconnect={onDisconnect}
        isTelemetryOpen={isTelemetryOpen}
        onToggleTelemetry={toggleTelemetry}
      />
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <IconSidebar />
        <main className="isolate flex min-w-0 flex-1 flex-col bg-void/80 overflow-hidden">
          <WorkspaceTabBar />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {openTabs.map((tabKey) => {
              const isActive = view === tabKey
              return (
                <div
                  key={tabKey}
                  className={
                    isActive
                      ? 'isolate flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'
                      : 'hidden'
                  }
                  style={{ display: isActive ? 'flex' : 'none' }}
                >
                  {tabKey === 'PIPELINE' && <PipelineView />}
                  {tabKey === 'REGISTRY' && <RegistryView />}
                  {tabKey === 'HISTORY' && <HistoryView />}
                  {tabKey === 'DRIVE' && <GoogleDriveView />}
                  {tabKey === 'GMAIL' && <GmailView />}
                  {tabKey === 'NOTIFICATIONS' && <NotificationsView />}
                  {tabKey === 'MEET' && <GoogleMeetView />}
                  {tabKey === 'FILES' && <MyFilesPanel />}
                  {tabKey === 'MAP' && <MapView isVisible={isActive} />}
                  {tabKey === 'DASH' && <DashboardView />}
                </div>
              )
            })}
          </div>
        </main>

        {/* Desktop: Docked side panel (Collapsible so main screen fits without squishing) */}
        {!isTablet && isTelemetryOpen && (
          <div className="w-[300px] shrink-0 border-l border-line bg-void flex flex-col min-h-0 overflow-hidden transition-all duration-200">
            <TelemetryPanel
              onOpenProject={(id) => setProject(id)}
              onClose={() => toggleTelemetry()}
            />
          </div>
        )}
      </div>

      {/* Tablet Off-Canvas Drawer & Full-Screen Cyberpunk Backdrop (Covers entire screen with blur) */}
      {isTablet && (
        <>
          <div
            className={`fixed inset-0 z-[10000] bg-black/65 backdrop-blur-sm transition-opacity duration-200 ${
              isTelemetryOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setIsTelemetryOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={`fixed top-0 bottom-0 right-0 z-[10001] flex w-[320px] max-w-[88vw] flex-col border-l border-line bg-surface shadow-2xl transition-transform duration-250 ease-out ${
              isTelemetryOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
            }`}
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-3.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span className="font-semibold text-xs tracking-wide text-slate-100">
                  Operations & Telemetry
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsTelemetryOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500 hover:text-white active:scale-95 transition-all text-xs"
                title="Close telemetry drawer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto term-scroll flex flex-col">
              <TelemetryPanel onOpenProject={(id) => setProject(id)} isDrawer />
            </div>
          </aside>
        </>
      )}

      {showWelcome && <WelcomeModal session={session} onDismiss={onCloseWelcome} />}
      {project && <ProjectModal projectId={project} onClose={() => setProject(null)} />}
      {showLogoutConfirm && (
        <LogoutConfirmModal
          onConfirm={() => {
            setShowLogoutConfirm(false)
            onDisconnect()
          }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
      <Toasts />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [showWelcome, setShowWelcome] = useState<boolean>(false)

  useEffect(() => {
    const unsubscribe = subscribeToAuth((s) => {
      setSession(s)
    })
    return () => unsubscribe()
  }, [])

  if (!session) {
    return (
      <AuthGate
        onAuthenticated={(s) => {
          saveSession(s)
          setSession(s)
          setShowWelcome(true)
        }}
      />
    )
  }

  return (
    <ZenithProvider>
      <Shell
        session={session}
        showWelcome={showWelcome}
        onCloseWelcome={() => setShowWelcome(false)}
        onDisconnect={async () => {
          await logout()
          clearSession()
          setSession(null)
          setShowWelcome(false)
        }}
      />
    </ZenithProvider>
  )
}
