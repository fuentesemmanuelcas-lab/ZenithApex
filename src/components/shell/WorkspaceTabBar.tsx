import React, { useEffect, useRef, useState } from 'react'
import {
  BarChart3Icon,
  BellIcon,
  ChevronDownIcon,
  FolderArchiveIcon,
  HardDriveIcon,
  LayoutDashboardIcon,
  LayersIcon,
  MailIcon,
  MapIcon,
  PlusIcon,
  ScrollTextIcon,
  TableIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import type { ViewKey } from '../../types/zenith'

export interface TabMeta {
  key: ViewKey
  code: string
  title: string
  Icon: React.ComponentType<{ className?: string }>
  desc: string
}

export const WORKSPACE_VIEWS: TabMeta[] = [
  { key: 'DASH', code: 'DSH', title: 'Dashboard', Icon: LayoutDashboardIcon, desc: 'Central Operations HUD & Metric Telemetry' },
  { key: 'MAP', code: 'NAV', title: 'Map Navigation', Icon: MapIcon, desc: 'CARTO Vector Basemap & Tactical Waypoints' },
  { key: 'PIPELINE', code: 'PIP', title: 'Pipeline', Icon: BarChart3Icon, desc: 'Candidate & Operator Flow Stages' },
  { key: 'REGISTRY', code: 'REG', title: 'Registry', Icon: TableIcon, desc: 'Master Database Records & Dossiers' },
  { key: 'DRIVE', code: 'DRV', title: 'Google Drive', Icon: HardDriveIcon, desc: 'Synced Cloud Repositories & Assets' },
  { key: 'GMAIL', code: 'GML', title: 'Gmail Inbox', Icon: MailIcon, desc: 'Inbox Transmissions & Correspondence' },
  { key: 'NOTIFICATIONS', code: 'NOT', title: 'Notifications', Icon: BellIcon, desc: 'Alerts & Briefings from Meet & Gmail' },
  { key: 'MEET', code: 'MEET', title: 'Google Meet', Icon: VideoIcon, desc: 'Tactical Video Link & Dispatch Rooms' },
  { key: 'FILES', code: 'FIL', title: 'My Files', Icon: FolderArchiveIcon, desc: 'Local Storage & Operator Archives' },
  { key: 'HISTORY', code: 'HIS', title: 'History', Icon: ScrollTextIcon, desc: 'Audit Log & Change Telemetry' },
]

export function WorkspaceTabBar() {
  const { view, setView, openTabs, closeTab, closeOtherTabs, device, unreadNotificationsCount } = useZenith()
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextMenuTab, setContextMenuTab] = useState<ViewKey | null>(null)
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isTablet = device === 'T'

  // Close popup menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      setContextMenuTab(null)
      setContextPos(null)
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, tabKey: ViewKey) => {
    e.preventDefault()
    setContextMenuTab(tabKey)
    setContextPos({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="relative z-20 flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface/95 px-2 backdrop-blur-md select-none">
      {/* Scrollable Tabs Container */}
      <div className="flex flex-1 items-center gap-1 overflow-x-auto term-scroll no-scrollbar py-0.5">
        {openTabs.map((tabKey) => {
          const meta = WORKSPACE_VIEWS.find((v) => v.key === tabKey) || {
            key: tabKey,
            code: tabKey.slice(0, 3),
            title: tabKey,
            Icon: LayersIcon,
            desc: '',
          }
          const { Icon, code, title } = meta
          const isActive = view === tabKey
          const isNotificationTab = tabKey === 'NOTIFICATIONS'
          const hasAlerts = isNotificationTab && unreadNotificationsCount > 0

          return (
            <div
              key={tabKey}
              onContextMenu={(e) => handleContextMenu(e, tabKey)}
              className={`group relative flex h-8 shrink-0 max-w-[240px] items-center gap-1.5 border px-2.5 transition-all duration-150 ease-out cursor-pointer ${
                hasAlerts
                  ? isActive
                    ? 'border-hazard bg-hazard/25 text-white ring-2 ring-hazard/80 shadow-[0_0_18px_rgba(255,49,49,0.6)] animate-pulse'
                    : 'border-hazard/90 bg-hazard/15 text-rose-200 hover:bg-hazard/25 hover:text-white ring-1 ring-hazard/60 shadow-[0_0_14px_rgba(255,49,49,0.45)]'
                  : isActive
                  ? 'border-nexus/80 bg-nexus/15 text-white shadow-[0_0_12px_rgba(0,243,255,0.2)] ring-1 ring-nexus/40'
                  : 'border-line/70 bg-surface/60 text-slate-300 hover:border-line2 hover:bg-surface2 hover:text-white'
              }`}
              onClick={() => setView(tabKey)}
              title={`${title} [${code}]${hasAlerts ? ` · ${unreadNotificationsCount} Unread Alerts` : ''} (Right-click for tab actions)`}
            >
              {/* Active / Alert glow pip */}
              {hasAlerts ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-hazard animate-pulse shadow-[0_0_8px_#ff3131]" />
              ) : isActive ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nexus animate-pulse shadow-[0_0_6px_#00f3ff]" />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500 opacity-60 group-hover:bg-slate-300" />
              )}

              <Icon
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                  hasAlerts
                    ? 'text-hazard animate-pulse scale-105'
                    : isActive
                    ? 'text-nexus scale-105'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />

              <span className="font-mono text-3xs font-bold tracking-wider uppercase whitespace-nowrap min-w-0 flex items-center truncate">
                <span
                  className={
                    hasAlerts
                      ? 'text-hazard font-bold mr-1 shrink-0 text-glow-hazard'
                      : isActive
                      ? 'text-nexus font-bold mr-1 shrink-0'
                      : 'text-slate-400 mr-1 shrink-0'
                  }
                >
                  [{code}]
                </span>
                <span className={`truncate ${hasAlerts ? 'text-rose-100 font-bold' : isActive ? 'text-white' : 'text-slate-300'}`}>
                  {title}
                </span>

                {/* Projected Number of Notifications in Zenith Apex Hazard Red */}
                {hasAlerts && (
                  <span className="ml-1.5 shrink-0 px-1.5 py-0.2 border border-hazard bg-void text-hazard text-glow-hazard font-mono text-xs font-black rounded-none shadow-[0_0_10px_rgba(255,49,49,0.7)] animate-pulse">
                    {unreadNotificationsCount}
                  </span>
                )}
              </span>

              {/* Close Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tabKey)
                }}
                className={`ml-1 flex h-4 w-4 items-center justify-center rounded-none text-slate-400 transition-colors ${
                  openTabs.length <= 1
                    ? 'opacity-30 cursor-not-allowed'
                    : hasAlerts
                    ? 'hover:bg-rose-500/30 hover:text-white'
                    : 'hover:bg-hazard/20 hover:text-hazard hover:border hover:border-hazard/50'
                }`}
                title={openTabs.length <= 1 ? 'Cannot close last remaining tab' : `Close ${title}`}
                disabled={openTabs.length <= 1}
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}

        {/* New Tab (+) Button */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={`flex h-8 items-center gap-1 border px-2 font-mono text-3xs font-bold transition-all duration-150 ease-out active:scale-95 ${
              menuOpen
                ? 'border-nexus bg-nexus/20 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                : 'border-line/80 bg-surface text-slate-300 hover:border-nexus hover:text-white hover:bg-surface2'
            }`}
            title="Open a workspace view in a new tab"
            aria-label="New Workspace Tab"
          >
            <PlusIcon className="h-3.5 w-3.5 text-nexus" />
            <span className="hidden sm:inline">TAB</span>
            <ChevronDownIcon className={`h-2.5 w-2.5 transition-transform ${menuOpen ? 'rotate-180 text-nexus' : 'text-slate-400'}`} />
          </button>

          {/* New Tab View Selector Dropdown */}
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-64 border border-line bg-surface/98 p-1 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-line/70 px-2.5 py-1.5 font-mono text-4xs font-bold tracking-widest text-slate-400 uppercase">
                <span>LAUNCH WORKSPACE TAB</span>
                <span className="text-nexus">{openTabs.length} / {WORKSPACE_VIEWS.length}</span>
              </div>
              <div className="max-h-72 overflow-y-auto term-scroll py-1">
                {WORKSPACE_VIEWS.map(({ key, code, title, Icon, desc }) => {
                  const isOpen = openTabs.includes(key)
                  const isCurrent = view === key

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setView(key)
                        setMenuOpen(false)
                      }}
                      className={`flex w-full items-start gap-2 border border-transparent px-2.5 py-2 text-left font-mono transition-all duration-150 ${
                        isCurrent
                          ? 'border-nexus/40 bg-nexus/15 text-nexus'
                          : 'text-slate-200 hover:border-line hover:bg-surface2 hover:text-white'
                      }`}
                    >
                      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isCurrent ? 'text-nexus' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">
                            <span className="text-nexus mr-1">[{code}]</span>
                            {title}
                          </span>
                          {isOpen ? (
                            <span className="border border-nexus/40 bg-nexus/10 px-1 py-0.2 font-mono text-4xs font-bold text-nexus">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-4xs text-dimmer">+ OPEN</span>
                          )}
                        </div>
                        <p className="line-clamp-1 text-3xs text-dimmer">{desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right actions: quick stats & clear others */}
      <div className="ml-2 hidden lg:flex items-center gap-2 font-mono text-3xs">
        <span className="text-slate-400">
          TABS <span className="text-nexus font-bold">[{openTabs.length}]</span>
        </span>
        {openTabs.length > 1 && (
          <button
            type="button"
            onClick={() => closeOtherTabs(view)}
            className="border border-line px-1.5 py-0.5 text-4xs font-bold text-slate-400 hover:border-hazard hover:text-hazard hover:bg-hazard/10 transition-colors"
            title="Close all tabs except the currently active tab"
          >
            SOLO TAB
          </button>
        )}
      </div>

      {/* Context Menu (Right Click) */}
      {contextMenuTab && contextPos && (
        <div
          className="fixed z-50 min-w-[140px] border border-line bg-surface/98 p-1 font-mono text-3xs shadow-2xl backdrop-blur-md"
          style={{ top: `${contextPos.y + 4}px`, left: `${contextPos.x}px` }}
        >
          <button
            type="button"
            onClick={() => {
              closeTab(contextMenuTab)
              setContextMenuTab(null)
            }}
            disabled={openTabs.length <= 1}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-slate-200 hover:bg-hazard/20 hover:text-hazard disabled:opacity-40 disabled:pointer-events-none"
          >
            <XIcon className="h-3 w-3" />
            <span>Close Tab</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeOtherTabs(contextMenuTab)
              setContextMenuTab(null)
            }}
            disabled={openTabs.length <= 1}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-slate-200 hover:bg-surface2 hover:text-nexus disabled:opacity-40 disabled:pointer-events-none"
          >
            <LayersIcon className="h-3 w-3" />
            <span>Close Other Tabs</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeOtherTabs('DASH')
              setContextMenuTab(null)
            }}
            className="flex w-full items-center gap-2 border-t border-line/60 px-2 py-1.5 text-left text-slate-400 hover:bg-surface2 hover:text-white"
          >
            <span>Reset to Dashboard</span>
          </button>
        </div>
      )}
    </div>
  )
}
