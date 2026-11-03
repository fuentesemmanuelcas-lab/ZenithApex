import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Mail,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Send,
  Plus,
  ExternalLink,
  Inbox,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  ArrowLeft,
  Reply,
  Eye,
  FileText,
  MailCheck,
  MailQuestion,
  X,
  Loader2,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import {
  listGmailMessages,
  getGmailMessageDetails,
  modifyGmailMessage,
  trashGmailMessage,
  sendGmailMessage,
  getGmailProfile,
  ensureWorkspaceAccessToken,
  type GmailProfile,
} from '../../services/googleWorkspace'
import {
  getCachedAccessToken,
  signInWithGooglePopup,
  WORKSPACE_SCOPES,
  loadSession,
} from '../../utils/authStore'
import type { GmailFullMessage, GmailMessageSummary } from '../../types/zenith'

type FilterCategory = 'INBOX' | 'UNREAD' | 'STARRED' | 'SENT'

export function GmailView() {
  const { pushToast, pushLog, device } = useZenith()
  const isTablet = device === 'T'

  // Authentication & Profile state
  const [hasToken, setHasToken] = useState<boolean>(() => !!getCachedAccessToken())
  const [profile, setProfile] = useState<GmailProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Message list state
  const [messages, setMessages] = useState<GmailMessageSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('INBOX')
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()

  // Detail pane state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeMessage, setActiveMessage] = useState<GmailFullMessage | null>(null)
  const [viewFormat, setViewFormat] = useState<'HTML' | 'TEXT'>('HTML')

  // Compose Modal state
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeCc, setComposeCc] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)

  // Delete confirmation
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Mobile/Tablet detail view toggle
  const [showMobileDetail, setShowMobileDetail] = useState(false)

  // Build Gmail API query string based on filter category and user search
  const buildQuery = useCallback(
    (cat: FilterCategory, search: string): string => {
      const parts: string[] = []
      if (cat === 'INBOX') parts.push('in:inbox')
      else if (cat === 'UNREAD') parts.push('is:unread in:inbox')
      else if (cat === 'STARRED') parts.push('is:starred')
      else if (cat === 'SENT') parts.push('in:sent')

      if (search.trim()) {
        parts.push(search.trim())
      }
      return parts.join(' ')
    },
    [],
  )

  // Fetch messages from Gmail API
  const fetchMessages = useCallback(
    async (isRefresh = false) => {
      const token = getCachedAccessToken()
      if (!token) {
        setHasToken(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const query = buildQuery(activeFilter, searchQuery)
        const res = await listGmailMessages({ query, maxResults: 25 })
        setMessages(res.messages)
        setNextPageToken(res.nextPageToken)

        // Also fetch profile in background if not yet loaded
        if (!profile) {
          getGmailProfile()
            .then(setProfile)
            .catch(() => {})
        }

        if (isRefresh) {
          pushToast({
            title: 'GMAIL_SYNCHRONIZED',
            body: `Retrieved ${res.messages.length} messages from Gmail`,
            tone: 'nexus',
          })
          pushLog('GMAIL', `inbox sync completed (${res.messages.length} messages)`, 'nexus')
        }
      } catch (err: any) {
        console.error('Failed to load Gmail messages:', err)
        const msg = err?.message || 'Failed to communicate with Gmail API'
        if (msg.includes('401') || msg.includes('403') || msg.includes('access token')) {
          setHasToken(false)
        }
        setError(msg)
      } finally {
        setLoading(false)
      }
    },
    [activeFilter, searchQuery, buildQuery, profile, pushToast, pushLog],
  )

  // Initial load
  useEffect(() => {
    if (hasToken) {
      void fetchMessages()
    }
  }, [hasToken, activeFilter])

  // Fetch detail when a message is selected
  useEffect(() => {
    if (!selectedId) {
      setActiveMessage(null)
      return
    }

    let isMounted = true
    setDetailLoading(true)
    getGmailMessageDetails(selectedId)
      .then((detail) => {
        if (!isMounted) return
        setActiveMessage(detail)
        // If unread, mark as read in Gmail automatically
        if (detail.isUnread) {
          modifyGmailMessage(detail.id, { removeLabelIds: ['UNREAD'] }).catch(() => {})
          setMessages((prev) =>
            prev.map((m) =>
              m.id === detail.id ? { ...m, isUnread: false, labels: m.labels.filter((l) => l !== 'UNREAD') } : m,
            ),
          )
        }
      })
      .catch((err) => {
        console.error('Failed to load email details:', err)
        pushToast({
          title: 'EMAIL_LOAD_FAILED',
          body: err?.message || 'Unable to retrieve full email body',
          tone: 'hazard',
        })
      })
      .finally(() => {
        if (isMounted) setDetailLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedId, pushToast])

  // Handle Google OAuth Sign-in
  const handleConnectGoogle = async () => {
    setAuthLoading(true)
    try {
      const res = await signInWithGooglePopup(WORKSPACE_SCOPES)
      if (res.success && getCachedAccessToken()) {
        setHasToken(true)
        pushToast({
          title: 'GOOGLE_LINK_AUTHENTICATED',
          body: 'Gmail authorization cleared. Loading messages…',
          tone: 'nexus',
        })
        pushLog('AUTH', 'Gmail OAuth token acquired', 'nexus')
      } else {
        setError(res.error || 'Failed to authenticate Google Workspace.')
      }
    } catch (err: any) {
      setError(err?.message || 'Google Sign-In failed.')
    } finally {
      setAuthLoading(false)
    }
  }

  // Toggle Star
  const handleToggleStar = async (e: React.MouseEvent, msg: GmailMessageSummary) => {
    e.stopPropagation()
    const willStar = !msg.isStarred
    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              isStarred: willStar,
              labels: willStar ? [...m.labels, 'STARRED'] : m.labels.filter((l) => l !== 'STARRED'),
            }
          : m,
      ),
    )
    if (activeMessage && activeMessage.id === msg.id) {
      setActiveMessage((prev) => (prev ? { ...prev, isStarred: willStar } : null))
    }

    try {
      await modifyGmailMessage(msg.id, {
        addLabelIds: willStar ? ['STARRED'] : [],
        removeLabelIds: !willStar ? ['STARRED'] : [],
      })
      pushLog('GMAIL', `${willStar ? 'starred' : 'unstarred'} message [${msg.id}]`, 'dim')
    } catch (err) {
      // Revert on failure
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
      pushToast({ title: 'ACTION_FAILED', body: 'Failed to update star in Gmail', tone: 'hazard' })
    }
  }

  // Toggle Read / Unread
  const handleToggleRead = async (msg: GmailMessageSummary | GmailFullMessage) => {
    const willUnread = !msg.isUnread
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              isUnread: willUnread,
              labels: willUnread ? [...m.labels, 'UNREAD'] : m.labels.filter((l) => l !== 'UNREAD'),
            }
          : m,
      ),
    )
    if (activeMessage && activeMessage.id === msg.id) {
      setActiveMessage((prev) => (prev ? { ...prev, isUnread: willUnread } : null))
    }

    try {
      await modifyGmailMessage(msg.id, {
        addLabelIds: willUnread ? ['UNREAD'] : [],
        removeLabelIds: !willUnread ? ['UNREAD'] : [],
      })
      pushToast({
        title: willUnread ? 'MARKED_AS_UNREAD' : 'MARKED_AS_READ',
        body: msg.subject,
        tone: 'nexus',
      })
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isUnread: msg.isUnread } : m)))
    }
  }

  // Confirm and Trash Message
  const handleExecuteTrash = async () => {
    if (!deleteTargetId) return
    const targetId = deleteTargetId
    setDeleteTargetId(null)

    try {
      await trashGmailMessage(targetId)
      setMessages((prev) => prev.filter((m) => m.id !== targetId))
      if (selectedId === targetId) {
        setSelectedId(null)
        setActiveMessage(null)
        setShowMobileDetail(false)
      }
      pushToast({
        title: 'MESSAGE_TRASHED',
        body: 'Message moved to Gmail Trash bin',
        tone: 'hazard',
      })
      pushLog('GMAIL', `trashed message ${targetId}`, 'hazard')
    } catch (err: any) {
      pushToast({
        title: 'TRASH_FAILED',
        body: err?.message || 'Could not delete message from Gmail',
        tone: 'hazard',
      })
    }
  }

  // Reply to active message
  const handleStartReply = () => {
    if (!activeMessage) return
    setComposeTo(activeMessage.from)
    setComposeSubject(
      activeMessage.subject.toLowerCase().startsWith('re:')
        ? activeMessage.subject
        : `Re: ${activeMessage.subject}`,
    )
    setComposeBody(`\n\n--- Original Transmission on ${activeMessage.date} ---\n${activeMessage.bodyText.slice(0, 500)}`)
    setComposeOpen(true)
  }

  // Send Email execution (after confirmation)
  const handleExecuteSend = async () => {
    setConfirmSendOpen(false)
    setSending(true)
    try {
      await sendGmailMessage({
        to: composeTo.trim(),
        cc: composeCc.trim() || undefined,
        subject: composeSubject.trim() || '(No Subject)',
        body: composeBody,
      })
      pushToast({
        title: 'TRANSMISSION_DISPATCHED',
        body: `Email successfully transmitted to ${composeTo.trim()}`,
        tone: 'nexus',
      })
      pushLog('GMAIL', `dispatched email to ${composeTo.trim()}`, 'nexus')
      setComposeOpen(false)
      setComposeTo('')
      setComposeCc('')
      setComposeSubject('')
      setComposeBody('')
      void fetchMessages()
    } catch (err: any) {
      console.error('Failed to send email:', err)
      pushToast({
        title: 'TRANSMISSION_FAILED',
        body: err?.message || 'Gmail transmission rejected',
        tone: 'hazard',
      })
    } finally {
      setSending(false)
    }
  }

  const unreadCount = useMemo(() => messages.filter((m) => m.isUnread).length, [messages])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-void text-ink overflow-hidden">
      {/* Top Header */}
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-nexus" />
            <h1 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              GMAIL_INBOX
            </h1>
          </div>
          <span className="font-mono text-3xs font-semibold text-slate-300 hidden sm:inline">
            // CORRESPONDENCE_NODE
          </span>
          {unreadCount > 0 && (
            <span className="font-mono text-4xs font-bold px-1.5 py-0.5 rounded-none border border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_8px_rgba(0,243,255,0.3)]">
              {unreadCount} UNREAD
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {hasToken && (
            <>
              <button
                type="button"
                onClick={() => {
                  setComposeTo('')
                  setComposeCc('')
                  setComposeSubject('')
                  setComposeBody('')
                  setComposeOpen(true)
                }}
                className="flex items-center gap-1.5 border border-cyan-500/60 bg-cyan-500/15 px-2.5 py-1 font-mono text-3xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void transition-all active:scale-95 shadow-[0_0_8px_rgba(0,243,255,0.2)]"
                title="Compose and dispatch new email"
              >
                <Plus className="h-3 w-3" />
                <span>COMPOSE</span>
              </button>

              <button
                type="button"
                onClick={() => void fetchMessages(true)}
                disabled={loading}
                className="flex items-center gap-1.5 border border-line2 bg-surface px-2.5 py-1 font-mono text-3xs font-semibold text-slate-300 hover:border-nexus hover:text-white transition-colors disabled:opacity-50"
                title="Sync Gmail inbox"
              >
                <RefreshCw className={`h-3 w-3 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">SYNC</span>
              </button>

              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 border border-line2 bg-surface px-2 py-1 font-mono text-3xs font-semibold text-slate-300 hover:border-nexus hover:text-white transition-colors"
                title="Open native Gmail in new tab"
              >
                <ExternalLink className="h-3 w-3" />
                <span className="hidden md:inline">GMAIL.COM</span>
              </a>
            </>
          )}

          {!hasToken && (
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={authLoading}
              className="flex items-center gap-1.5 border border-cyan-400 bg-cyan-500/20 px-3 py-1 font-mono text-3xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void transition-colors"
            >
              {authLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              <span>CONNECT GMAIL</span>
            </button>
          )}
        </div>
      </header>

      {/* Auth Gate Banner (If not authenticated with Google) */}
      {!hasToken && (
        <div className="p-6 flex flex-1 flex-col items-center justify-center text-center">
          <div className="max-w-md border border-cyan-500/40 bg-surface/80 p-6 shadow-2xl backdrop-blur-md space-y-4">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center border border-cyan-400/60 bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.3)]">
                <Mail className="h-6 w-6" />
              </div>
            </div>
            <div>
              <h2 className="font-mono text-sm font-bold tracking-widest text-white uppercase">
                GMAIL AUTHENTICATION REQUIRED
              </h2>
              <p className="font-mono text-3xs text-dimmer mt-1.5 leading-relaxed">
                Authorize Google Workspace to inspect your Gmail inbox, read communications, review
                candidate inquiries, and dispatch transmissions directly inside Zenith Apex OS.
              </p>
            </div>
            {error && (
              <div className="border border-hazard/60 bg-hazard/10 px-3 py-2 font-mono text-3xs text-hazard leading-relaxed text-left">
                [AUTH_FAULT] {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2 border border-nexus bg-nexus/25 py-2 font-mono text-2xs font-bold text-nexus hover:bg-nexus hover:text-void transition-all shadow-[0_0_12px_rgba(0,243,255,0.25)]"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              <span>AUTHORIZE GMAIL NODE</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Mail Client Interface */}
      {hasToken && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Filter Sidebar & Email List */}
          <div
            className={`flex flex-col border-r border-line bg-surface/95 transition-all duration-200 ${
              isTablet && showMobileDetail ? 'hidden' : 'w-full md:w-[380px] lg:w-[420px] shrink-0'
            }`}
          >
            {/* Search & Filter Toolbar */}
            <div className="border-b border-line2 p-2 space-y-2 bg-surface2/60">
              <div className="flex items-center gap-1.5 border border-line bg-void px-2.5 py-1">
                <Search className="h-3 w-3 text-dimmer shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void fetchMessages()
                  }}
                  placeholder="search inbox (e.g. from:client, invoice)…"
                  className="w-full bg-transparent font-mono text-2xs text-ink placeholder:text-dimmer outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      void fetchMessages()
                    }}
                    className="text-dimmer hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto term-scroll no-scrollbar">
                {(
                  [
                    { key: 'INBOX', label: 'INBOX', Icon: Inbox },
                    { key: 'UNREAD', label: 'UNREAD', Icon: MailQuestion },
                    { key: 'STARRED', label: 'STARRED', Icon: Star },
                    { key: 'SENT', label: 'SENT', Icon: Send },
                  ] as const
                ).map(({ key, label, Icon }) => {
                  const isActive = activeFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveFilter(key)}
                      className={`flex items-center gap-1 border px-2 py-0.5 font-mono text-3xs font-bold transition-all shrink-0 ${
                        isActive
                          ? 'border-nexus bg-nexus/20 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.2)]'
                          : 'border-line bg-void text-slate-400 hover:border-line2 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Email Message List */}
            <div className="flex-1 min-h-0 overflow-y-auto term-scroll divide-y divide-line/30 bg-void/50">
              {loading && messages.length === 0 && (
                <div className="p-8 flex flex-col items-center justify-center gap-2 text-dimmer">
                  <RefreshCw className="h-5 w-5 animate-spin text-nexus" />
                  <span className="font-mono text-3xs">SYNCHRONIZING_MESSAGES…</span>
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="p-8 text-center font-mono text-3xs text-dimmer space-y-1">
                  <Mail className="h-6 w-6 mx-auto text-slate-600 mb-2" />
                  <p className="font-bold text-slate-400">NO CORRESPONDENCE FOUND</p>
                  <p>No messages match the current filter [{activeFilter}] or search query.</p>
                </div>
              )}

              {messages.map((msg) => {
                const isSelected = selectedId === msg.id
                return (
                  <div
                    key={msg.id}
                    onClick={() => {
                      setSelectedId(msg.id)
                      if (isTablet) setShowMobileDetail(true)
                    }}
                    className={`group relative flex cursor-pointer items-start gap-2.5 p-2.5 transition-all select-none border-l-2 ${
                      isSelected
                        ? 'border-l-nexus bg-nexus/10'
                        : msg.isUnread
                          ? 'border-l-cyan-400 bg-surface hover:bg-surface2'
                          : 'border-l-transparent hover:bg-surface/60'
                    }`}
                  >
                    {/* Star Button */}
                    <button
                      type="button"
                      onClick={(e) => void handleToggleStar(e, msg)}
                      className="mt-0.5 shrink-0 text-slate-500 hover:text-amber-300 transition-colors"
                      title={msg.isStarred ? 'Unstar message' : 'Star message'}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          msg.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                        }`}
                      />
                    </button>

                    {/* Message Meta & Snippet */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {msg.isUnread && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_#00f3ff]"
                              title="Unread"
                            />
                          )}
                          <span
                            className={`font-mono text-2xs truncate ${
                              msg.isUnread ? 'font-bold text-white' : 'font-medium text-slate-300'
                            }`}
                          >
                            {msg.fromName}
                          </span>
                        </div>
                        <span className="font-mono text-4xs text-dimmer shrink-0">
                          {msg.date.includes('T') ? msg.date.slice(5, 10) : msg.date.slice(0, 11)}
                        </span>
                      </div>

                      <div
                        className={`font-mono text-2xs truncate ${
                          msg.isUnread ? 'font-bold text-cyan-300' : 'text-slate-200'
                        }`}
                      >
                        {msg.subject}
                      </div>

                      <p className="font-mono text-3xs text-dimmer line-clamp-1 leading-normal">
                        {msg.snippet}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* List Footer Status */}
            <div className="border-t border-line2 px-3 py-1.5 bg-surface font-mono text-4xs text-dimmer flex items-center justify-between">
              <span>{messages.length} TRANSMISSIONS</span>
              {profile && <span>ACCOUNT: {profile.emailAddress}</span>}
            </div>
          </div>

          {/* Right Column: Reading Pane */}
          <div
            className={`flex-1 min-h-0 flex-col bg-surface/40 overflow-hidden ${
              isTablet && !showMobileDetail ? 'hidden' : 'flex'
            }`}
          >
            {/* If no email selected */}
            {!selectedId && (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="border border-line2 bg-void/50 p-6 max-w-sm space-y-3">
                  <Mail className="h-8 w-8 text-slate-600 mx-auto" />
                  <p className="font-mono text-2xs font-bold tracking-widest text-slate-300 uppercase">
                    NO MESSAGE SELECTED
                  </p>
                  <p className="font-mono text-3xs text-dimmer leading-relaxed">
                    Select a correspondence record from the ledger on the left to review payload,
                    inspect metadata, or execute a reply.
                  </p>
                </div>
              </div>
            )}

            {/* If email is selected and loading */}
            {selectedId && detailLoading && !activeMessage && (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="flex items-center gap-2 font-mono text-2xs text-nexus">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>DECRYPTING_TRANSMISSION_PAYLOAD…</span>
                </div>
              </div>
            )}

            {/* Full Email Details */}
            {activeMessage && (
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                {/* Email Action Bar */}
                <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2">
                  <div className="flex items-center gap-2">
                    {isTablet && (
                      <button
                        type="button"
                        onClick={() => setShowMobileDetail(false)}
                        className="flex items-center gap-1 border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-300 hover:text-white"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        <span>BACK</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleStartReply}
                      className="flex items-center gap-1.5 border border-cyan-500/60 bg-cyan-500/15 px-2.5 py-1 font-mono text-3xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void transition-colors"
                      title="Reply to sender"
                    >
                      <Reply className="h-3 w-3" />
                      <span>REPLY</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleRead(activeMessage)}
                      className="flex items-center gap-1 border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-300 hover:text-white"
                      title={activeMessage.isUnread ? 'Mark as read' : 'Mark as unread'}
                    >
                      <MailCheck className="h-3 w-3 text-cyan-400" />
                      <span>{activeMessage.isUnread ? 'READ' : 'UNREAD'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(activeMessage.id)}
                      className="flex items-center gap-1 border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-300 hover:text-rose-400 hover:border-rose-500/50"
                      title="Move email to trash"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>TRASH</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Format Toggle */}
                    <div className="flex items-center border border-line bg-void p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewFormat('HTML')}
                        className={`px-2 py-0.5 font-mono text-4xs font-bold transition-colors ${
                          viewFormat === 'HTML' ? 'bg-nexus/25 text-nexus' : 'text-dimmer hover:text-white'
                        }`}
                      >
                        HTML
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewFormat('TEXT')}
                        className={`px-2 py-0.5 font-mono text-4xs font-bold transition-colors ${
                          viewFormat === 'TEXT' ? 'bg-nexus/25 text-nexus' : 'text-dimmer hover:text-white'
                        }`}
                      >
                        TEXT
                      </button>
                    </div>

                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${activeMessage.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 border border-line bg-void px-2 py-1 font-mono text-3xs text-dimmer hover:text-white hover:border-nexus transition-colors"
                      title="Inspect message in native Google Mail"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Email Header Info */}
                <div className="border-b border-line2 bg-surface2/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-mono text-base font-bold text-white tracking-wide">
                      {activeMessage.subject}
                    </h2>
                    <span className="font-mono text-3xs text-cyan-400 font-semibold">
                      {activeMessage.date}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3 text-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center border border-cyan-400/50 bg-cyan-500/10 font-mono text-xs font-bold text-cyan-300 shrink-0">
                        {activeMessage.fromName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 truncate">
                        <div className="font-mono font-bold text-white truncate">
                          {activeMessage.fromName}
                        </div>
                        <div className="font-mono text-3xs text-dimmer truncate">
                          &lt;{activeMessage.from}&gt;
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-3xs text-dimmer shrink-0">
                      {activeMessage.to && <span>TO: {activeMessage.to}</span>}
                    </div>
                  </div>
                </div>

                {/* Email Body Content */}
                <div className="flex-1 min-h-0 overflow-y-auto term-scroll p-4 bg-void/90">
                  {viewFormat === 'HTML' && activeMessage.bodyHtml ? (
                    <div
                      className="gmail-body-container font-sans text-sm text-slate-200 leading-relaxed max-w-4xl"
                      dangerouslySetInnerHTML={{ __html: activeMessage.bodyHtml }}
                    />
                  ) : (
                    <div className="font-mono text-2xs text-slate-200 whitespace-pre-wrap leading-relaxed select-text max-w-4xl">
                      {activeMessage.bodyText || activeMessage.snippet}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose Email Modal */}
      {composeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-3 backdrop-blur-sm"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col border border-nexus/60 bg-surface shadow-2xl shadow-nexus/15 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface2 px-4 py-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-nexus" />
                <h3 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
                  GMAIL // DISPATCH_COMPOSITION
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="text-dimmer hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!composeTo.trim()) {
                  pushToast({ title: 'VALIDATION_ERROR', body: 'Recipient required', tone: 'hazard' })
                  return
                }
                setConfirmSendOpen(true)
              }}
              className="flex flex-1 flex-col p-4 space-y-3 overflow-y-auto term-scroll"
            >
              <div className="space-y-1">
                <label className="font-mono text-3xs font-bold text-dimmer uppercase">
                  RECIPIENT (TO) *
                </label>
                <input
                  type="email"
                  required
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@domain.com"
                  className="w-full border border-line bg-void px-3 py-1.5 font-mono text-2xs text-white placeholder:text-dimmer outline-none focus:border-nexus"
                />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-3xs font-bold text-dimmer uppercase">
                  CARBON COPY (CC)
                </label>
                <input
                  type="text"
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                  placeholder="optional cc addresses…"
                  className="w-full border border-line bg-void px-3 py-1.5 font-mono text-2xs text-white placeholder:text-dimmer outline-none focus:border-nexus"
                />
              </div>

              <div className="space-y-1">
                <label className="font-mono text-3xs font-bold text-dimmer uppercase">
                  SUBJECT *
                </label>
                <input
                  type="text"
                  required
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject title…"
                  className="w-full border border-line bg-void px-3 py-1.5 font-mono text-2xs text-white placeholder:text-dimmer outline-none focus:border-nexus"
                />
              </div>

              <div className="space-y-1 flex-1 flex flex-col min-h-[180px]">
                <label className="font-mono text-3xs font-bold text-dimmer uppercase">
                  MESSAGE BODY *
                </label>
                <textarea
                  required
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Compose message directives or candidate correspondence…"
                  className="flex-1 w-full border border-line bg-void p-3 font-mono text-2xs text-white placeholder:text-dimmer outline-none focus:border-nexus resize-none leading-relaxed term-scroll"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="border border-line bg-void px-3 py-1.5 font-mono text-2xs font-semibold text-slate-300 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex items-center gap-1.5 border border-nexus bg-nexus/25 px-4 py-1.5 font-mono text-2xs font-bold text-nexus hover:bg-nexus hover:text-void transition-colors shadow-[0_0_8px_rgba(0,243,255,0.2)] disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>DISPATCH EMAIL</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Destructive Send Confirmation Dialog (Per Workspace Skill requirement) */}
      {confirmSendOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-void/85 p-3 backdrop-blur-md"
        >
          <div className="w-full max-w-md border border-cyan-400 bg-surface p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-cyan-400" />
              <h4 className="font-mono text-xs font-bold tracking-widest text-white uppercase">
                CONFIRM EMAIL TRANSMISSION
              </h4>
            </div>
            <p className="font-mono text-2xs text-slate-300 leading-relaxed">
              Are you sure you want to send this email via Google Gmail to{' '}
              <strong className="text-nexus">{composeTo}</strong> with subject &quot;{composeSubject}&quot;?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSendOpen(false)}
                className="border border-line bg-void px-3 py-1.5 font-mono text-2xs text-slate-300 hover:text-white"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteSend()}
                className="border border-cyan-400 bg-cyan-500/25 px-4 py-1.5 font-mono text-2xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void transition-colors shadow-[0_0_10px_rgba(0,243,255,0.3)]"
              >
                CONFIRM & SEND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-void/85 p-3 backdrop-blur-md"
        >
          <div className="w-full max-w-md border border-hazard bg-surface p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-hazard" />
              <h4 className="font-mono text-xs font-bold tracking-widest text-hazard uppercase">
                CONFIRM MESSAGE DISPOSAL
              </h4>
            </div>
            <p className="font-mono text-2xs text-slate-300 leading-relaxed">
              Move this transmission to Google Mail Trash? The item will be removed from your active
              ledger.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="border border-line bg-void px-3 py-1.5 font-mono text-2xs text-slate-300 hover:text-white"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteTrash()}
                className="border border-hazard bg-hazard/25 px-4 py-1.5 font-mono text-2xs font-bold text-hazard hover:bg-hazard hover:text-white transition-colors"
              >
                MOVE TO TRASH
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
