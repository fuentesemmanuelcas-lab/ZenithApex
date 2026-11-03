import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Bell,
  Video,
  Mail,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Trash2,
  Filter,
  Check,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Inbox,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { listGmailMessages } from '../../services/googleWorkspace'
import { getCachedAccessToken } from '../../utils/authStore'
import type { AppNotification, CalendarEvent, ViewKey } from '../../types/zenith'

type NotificationFilter = 'ALL' | 'MEETINGS' | 'GMAIL' | 'UNREAD'

export function NotificationsView() {
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
    dismissAllNotifications,
    syncNotifications,
    setView,
    pushToast,
    pushLog,
    device,
  } = useZenith()
  const isTablet = device === 'T'

  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('ALL')
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await syncNotifications()
    } finally {
      setLoading(false)
    }
  }

  // Filtered view from shared notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeFilter === 'MEETINGS') return n.source === 'MEET'
      if (activeFilter === 'GMAIL') return n.source === 'GMAIL'
      if (activeFilter === 'UNREAD') return n.unread
      return true
    })
  }, [notifications, activeFilter])

  const meetingCount = useMemo(
    () => notifications.filter((n) => n.source === 'MEET').length,
    [notifications],
  )
  const gmailCount = useMemo(
    () => notifications.filter((n) => n.source === 'GMAIL').length,
    [notifications],
  )

  const handleMarkAsRead = (id: string) => {
    markNotificationRead(id)
  }

  const handleDismiss = (id: string) => {
    dismissNotification(id)
  }

  const handleAllRead = () => {
    markAllNotificationsRead()
    pushToast({
      title: 'NOTIFICATIONS_READ',
      body: 'All incoming alerts marked as reviewed.',
      tone: 'nexus',
    })
  }

  const handleClearAll = () => {
    dismissAllNotifications()
    pushToast({
      title: 'NOTIFICATIONS_PURGED',
      body: 'Notification feed cleared.',
      tone: 'caution',
    })
  }

  const handleActionClick = (n: AppNotification) => {
    markNotificationRead(n.id)
    if (n.targetTab) {
      setView(n.targetTab)
      pushLog('ALERT', `jump to ${n.targetTab} via notification [${n.id}]`, 'nexus')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-void text-ink overflow-hidden">
      {/* Top Header */}
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-nexus animate-pulse" />
            <h1 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              NOTIFICATIONS_CENTER
            </h1>
          </div>
          <span className="font-mono text-3xs font-semibold text-slate-300 hidden sm:inline">
            // LIVE MEET & GMAIL TELEMETRY
          </span>
          {unreadNotificationsCount > 0 && (
            <span className="font-mono text-4xs font-bold px-1.5 py-0.5 rounded-none border border-hazard bg-void text-hazard text-glow-hazard shadow-[0_0_8px_rgba(255,49,49,0.5)] animate-pulse">
              <span className="text-hazard text-glow-hazard font-black text-xs mr-1">{unreadNotificationsCount}</span> NEW ALERTS
            </span>
          )}
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading}
            className="flex items-center gap-1.5 border border-line2 bg-surface px-2.5 py-1 font-mono text-3xs font-semibold text-slate-300 hover:border-nexus hover:text-white transition-colors disabled:opacity-50"
            title="Refresh alerts"
          >
            <RefreshCw className={`h-3 w-3 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">REFRESH</span>
          </button>

          <button
            type="button"
            onClick={handleAllRead}
            disabled={unreadNotificationsCount === 0}
            className="flex items-center gap-1.5 border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1 font-mono text-3xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void transition-colors disabled:opacity-40"
            title="Mark all notifications as read"
          >
            <Check className="h-3 w-3" />
            <span className="hidden sm:inline">MARK ALL READ</span>
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            disabled={notifications.length === 0}
            className="flex items-center gap-1 border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors disabled:opacity-40"
            title="Clear all alerts"
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden md:inline">CLEAR</span>
          </button>
        </div>
      </header>

      {/* Filter Chips Bar */}
      <div className="border-b border-line2 px-3 py-2 bg-surface2/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto term-scroll no-scrollbar">
          {(
            [
              { key: 'ALL', label: `ALL (${notifications.length})`, Icon: Bell },
              {
                key: 'MEETINGS',
                label: `GOOGLE MEET (${meetingCount})`,
                Icon: Video,
              },
              { key: 'GMAIL', label: `GMAIL (${gmailCount})`, Icon: Mail },
              { key: 'UNREAD', label: `UNREAD (${unreadNotificationsCount})`, Icon: Clock },
            ] as const
          ).map(({ key, label, Icon }) => {
            const active = activeFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`flex items-center gap-1.5 border px-2.5 py-1 font-mono text-3xs font-bold transition-all shrink-0 ${
                  active
                    ? 'border-nexus bg-nexus/20 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.2)]'
                    : 'border-line bg-void text-slate-300 hover:border-line2 hover:text-white'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        <span className="font-mono text-4xs text-dimmer hidden sm:inline">
          AUTO-SYNCING EVERY 60S
        </span>
      </div>

      {/* Notifications List */}
      <div className="flex-1 min-h-0 overflow-y-auto term-scroll p-3 space-y-2 bg-void/60">
        {filteredNotifications.length === 0 && (
          <div className="p-12 text-center font-mono text-3xs text-dimmer border border-dashed border-line bg-surface/40 max-w-lg mx-auto my-8 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
            <p className="font-bold text-slate-200 text-2xs uppercase">
              ALL SIGNALS CLEAR
            </p>
            <p className="leading-relaxed">
              No pending notifications under filter [{activeFilter}]. Incoming Google Meet sessions
              and Gmail transmissions will automatically surface here.
            </p>
          </div>
        )}

        {filteredNotifications.map((n) => {
          const isMeet = n.source === 'MEET'
          const isGmail = n.source === 'GMAIL'
          const statusTag = n.metadata?.statusTag

          return (
            <div
              key={n.id}
              className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border p-3 transition-all ${
                n.unread
                  ? isMeet
                    ? 'border-cyan-500/60 bg-cyan-500/[0.08] shadow-[0_0_12px_rgba(0,243,255,0.15)] border-l-4 border-l-cyan-400'
                    : 'border-amber-500/60 bg-amber-500/[0.08] shadow-[0_0_12px_rgba(245,158,11,0.15)] border-l-4 border-l-amber-400'
                  : 'border-line/70 bg-surface/60 hover:bg-surface2/80 opacity-80 hover:opacity-100'
              }`}
            >
              {/* Left Details */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Source Icon */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center border ${
                    isMeet
                      ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
                      : 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {isMeet ? <Video className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-mono text-4xs font-bold px-1.5 py-0.2 border ${
                        isMeet
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                          : 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {isMeet ? 'GOOGLE_MEET' : 'GMAIL_INBOX'}
                    </span>

                    {statusTag && (
                      <span className="font-mono text-4xs font-bold px-1.5 py-0.2 border border-rose-500/60 bg-rose-500/20 text-rose-300 animate-pulse">
                        {statusTag}
                      </span>
                    )}

                    {n.unread && (
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f3ff]" />
                    )}

                    <span className="font-mono text-3xs font-bold text-white truncate">
                      {n.title}
                    </span>
                  </div>

                  <p className="font-mono text-2xs text-slate-300 leading-relaxed select-text">
                    {n.description}
                  </p>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-line/40">
                <button
                  type="button"
                  onClick={() => handleActionClick(n)}
                  className={`flex items-center gap-1.5 border px-3 py-1 font-mono text-3xs font-bold transition-all shadow-sm ${
                    isMeet
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-void'
                      : 'border-nexus bg-nexus/20 text-nexus hover:bg-nexus hover:text-void'
                  }`}
                  title={isMeet ? 'Open Google Meet room' : 'Open email in Gmail view'}
                >
                  <span>{isMeet ? 'JOIN_MEET' : 'VIEW_EMAIL'}</span>
                  <ArrowRight className="h-3 w-3" />
                </button>

                {n.unread && (
                  <button
                    type="button"
                    onClick={() => handleMarkAsRead(n.id)}
                    className="border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-400 hover:text-white transition-colors"
                    title="Mark as read"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDismiss(n.id)}
                  className="border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-400 hover:text-rose-400 transition-colors"
                  title="Dismiss alert"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
