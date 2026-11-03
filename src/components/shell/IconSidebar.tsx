import React from 'react'
import {
  BarChart3Icon,
  BellIcon,
  FolderArchiveIcon,
  HardDriveIcon,
  LayoutDashboardIcon,
  MailIcon,
  MapIcon,
  MonitorIcon,
  ScrollTextIcon,
  TabletIcon,
  TableIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import type { ViewKey } from '../../types/zenith'

const NAV: { key: ViewKey; code: string; label: string; Icon: typeof MapIcon }[] = [
  { key: 'PIPELINE', code: 'PIP', label: 'Pipeline', Icon: BarChart3Icon },
  { key: 'REGISTRY', code: 'REG', label: 'Registry', Icon: TableIcon },
  { key: 'HISTORY', code: 'HIS', label: 'History', Icon: ScrollTextIcon },
  { key: 'DRIVE', code: 'DRV', label: 'Google Drive', Icon: HardDriveIcon },
  { key: 'GMAIL', code: 'GML', label: 'Gmail Inbox', Icon: MailIcon },
  { key: 'NOTIFICATIONS', code: 'NOT', label: 'Notifications', Icon: BellIcon },
  { key: 'FILES', code: 'FIL', label: 'My Files', Icon: FolderArchiveIcon },
  { key: 'MAP', code: 'NAV', label: 'Map Navigation', Icon: MapIcon },
  { key: 'DASH', code: 'DSH', label: 'Dashboard', Icon: LayoutDashboardIcon },
]

export function IconSidebar() {
  const { view, setView, openTabs, device, setDevice, pushLog, unreadNotificationsCount } = useZenith()
  const wide = device === 'D'

  return (
    <nav
      aria-label="Primary Navigation"
      className={`relative z-10 flex shrink-0 flex-col items-center border-r border-line bg-surface/95 transition-all duration-200 ease-out backdrop-blur-sm ${
        wide ? 'w-16 py-3' : 'w-12 py-2'
      }`}
    >
      <div
        className={`mb-3 flex items-center justify-center border border-nexus/80 bg-nexus/10 font-mono font-bold text-nexus text-glow-nexus shadow-[0_0_12px_rgba(0,243,255,0.25)] transition-all duration-200 ${
          wide ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-2xs'
        }`}
      >
        ZX
      </div>

      <ul className="flex w-full flex-1 flex-col items-center gap-1.5">
        {NAV.map(({ key, code, label, Icon }) => {
          const active = view === key
          const isOpen = openTabs?.includes(key)
          const isNotificationTab = key === 'NOTIFICATIONS'
          const hasAlerts = isNotificationTab && unreadNotificationsCount > 0

          return (
            <li key={key} className="w-full px-1">
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                title={`${label} (${code})${hasAlerts ? ` · ${unreadNotificationsCount} Alerts` : ''}${isOpen ? ' · Open in Tab' : ''}`}
                onClick={() => {
                  setView(key)
                  pushLog('OPERATOR', `view → ${key}`, 'dim')
                }}
                className={`group relative flex w-full min-h-[44px] flex-col items-center justify-center gap-0.5 border py-1.5 transition-all duration-150 ease-out active:scale-95 ${
                  hasAlerts
                    ? active
                      ? 'border-hazard bg-hazard/35 text-white ring-2 ring-hazard/80 shadow-[0_0_14px_rgba(255,49,49,0.5)] animate-pulse'
                      : 'border-hazard bg-hazard/20 text-hazard ring-1 ring-hazard/60 shadow-[0_0_12px_rgba(255,49,49,0.4)] hover:bg-hazard/30 hover:text-white'
                    : active
                    ? 'border-nexus bg-nexus/20 text-nexus shadow-[0_0_10px_rgba(0,243,255,0.3)] ring-1 ring-nexus/50'
                    : isOpen
                    ? 'border-line bg-surface2/60 text-slate-200 hover:border-nexus/60 hover:text-white'
                    : 'border-transparent text-slate-400 hover:border-line2 hover:bg-surface2 hover:text-white'
                }`}
              >
                {/* Projected number badge for notifications in Zenith Apex Hazard Red */}
                {hasAlerts && (
                  <span className="absolute -top-1.5 -right-1 flex h-4 min-w-[18px] px-1 items-center justify-center border border-hazard bg-void text-hazard text-glow-hazard font-mono text-3xs font-black rounded-none shadow-[0_0_10px_rgba(255,49,49,0.7)] animate-pulse">
                    {unreadNotificationsCount}
                  </span>
                )}

                {/* Tab Open Indicator dot */}
                {isOpen && !active && !hasAlerts && (
                  <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-nexus/80" title="Tab Open" />
                )}
                <Icon
                  className={`${wide ? 'h-4 w-4' : 'h-3.5 w-3.5'} transition-transform group-hover:scale-110 ${
                    hasAlerts
                      ? 'text-hazard animate-pulse'
                      : active
                      ? 'text-nexus'
                      : isOpen
                      ? 'text-slate-200'
                      : 'text-slate-400 group-hover:text-white'
                  }`}
                  aria-hidden
                />
                <span
                  className={`font-mono text-3xs font-bold tracking-widest ${
                    hasAlerts
                      ? 'text-hazard text-glow-hazard font-bold'
                      : active
                      ? 'text-nexus'
                      : isOpen
                      ? 'text-slate-200'
                      : 'text-slate-400 group-hover:text-white'
                  }`}
                >
                  {hasAlerts ? (
                    <span>
                      {code}·<span className="text-hazard text-glow-hazard font-black drop-shadow-[0_0_6px_#ff3131]">{unreadNotificationsCount}</span>
                    </span>
                  ) : (
                    code
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 w-full px-1 pt-2 border-t border-line/70">
        <p className="mb-1 text-center font-mono text-4xs font-bold tracking-widest text-slate-400 uppercase">
          VIEW
        </p>
        <div className="flex flex-col gap-1">
          {(
            [
              { m: 'D' as const, Icon: MonitorIcon, label: 'DESK' },
              { m: 'T' as const, Icon: TabletIcon, label: 'TAB' },
            ]
          ).map(({ m, Icon, label }) => (
            <button
              key={m}
              type="button"
              aria-pressed={device === m}
              title={m === 'D' ? 'Desktop layout' : 'Tablet / 12" layout'}
              onClick={() => {
                setDevice(m)
                pushLog('SYS', `viewmode → ${m === 'D' ? 'DESKTOP' : 'TABLET'}`, 'dim')
              }}
              className={`flex min-h-[38px] items-center justify-center gap-1 border py-1 font-mono text-3xs font-bold transition-all duration-150 ease-out active:scale-95 ${
                device === m
                  ? 'border-caution bg-caution/15 text-caution shadow-[0_0_8px_rgba(255,234,0,0.3)]'
                  : 'border-line bg-surface text-slate-400 hover:text-white hover:border-line2'
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
