import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  AppNotification,
  CalendarEvent,
  DeviceMode,
  LogLine,
  OperatorRecord,
  Stage,
  UserFile,
  ViewKey,
} from '../types/zenith'
import { STAGE_SLA_MAP } from '../types/zenith'
import { getActiveAvailableClients } from '../utils/format'
import { callNexus, isDummyRecord } from '../utils/nexusApi'
import { playChime } from '../utils/chime'
import { auth } from '../lib/firebase'
import { getCachedAccessToken, loadSession } from '../utils/authStore'
import { listGmailMessages } from '../services/googleWorkspace'
import { subscribeToUserFiles } from '../services/fileService'
import {
  deleteRecordFromFirestore,
  fetchRecordsFromFirestore,
  subscribeToFirestoreRecords,
  syncRecordToFirestore,
} from '../services/recordService'
import {
  deleteEventFromFirestore,
  fetchUserEventsFromFirestore,
  subscribeToUserEvents,
  syncEventToFirestore,
} from '../services/calendarService'

export interface Toast {
  id: string
  title: string
  body: string
  tone: 'nexus' | 'hazard' | 'caution'
}

interface ZenithState {
  records: OperatorRecord[]
  availableClients: string[]
  events: CalendarEvent[]
  userFiles: UserFile[]
  loading: boolean
  error: string | null
  bridge: 'APPS_SCRIPT' | 'LOCAL_FALLBACK'
  latency: number
  syncCycle: string
  freshness: Record<string, string>
  logs: LogLine[]
  view: ViewKey
  openTabs: ViewKey[]
  device: DeviceMode
  toasts: Toast[]
  setView: (v: ViewKey) => void
  openTab: (v: ViewKey) => void
  closeTab: (v: ViewKey) => void
  closeOtherTabs: (v: ViewKey) => void
  setDevice: (d: DeviceMode) => void
  setUserFiles: React.Dispatch<React.SetStateAction<UserFile[]>>
  addUserFile: (file: UserFile) => void
  removeUserFile: (fileId: string) => void
  refresh: () => Promise<void>
  updateRecord: (id: string, field: keyof OperatorRecord, value: string | number) => Promise<void>
  updateFullRecord: (record: OperatorRecord) => Promise<void>
  deleteRecord: (id: string) => Promise<void>
  createRecord: (record: OperatorRecord) => Promise<void>
  saveEvent: (event: CalendarEvent) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  pushLog: (operator: string, action: string, tone?: LogLine['tone']) => void
  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  notifications: AppNotification[]
  unreadNotificationsCount: number
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  dismissNotification: (id: string) => void
  dismissAllNotifications: () => void
  syncNotifications: () => Promise<void>
}

const ZenithContext = createContext<ZenithState | null>(null)

const stamp = (): string => new Date().toTimeString().slice(0, 8)

export function ZenithProvider({ children }: { children: React.ReactNode }) {
  const [currentUid, setCurrentUid] = useState<string | null>(
    () => auth.currentUser?.uid || loadSession()?.uid || null,
  )
  const [records, setRecords] = useState<OperatorRecord[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [userFiles, setUserFiles] = useState<UserFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState(42)
  const [syncCycle, setSyncCycle] = useState('--:--:--')
  const [freshness, setFreshness] = useState<Record<string, string>>({})
  const [logs, setLogs] = useState<LogLine[]>([])
  const [openTabs, setOpenTabs] = useState<ViewKey[]>(() => {
    try {
      const saved = localStorage.getItem('zenith_open_tabs')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validKeys: ViewKey[] = [
            'PIPELINE',
            'REGISTRY',
            'HISTORY',
            'DRIVE',
            'GMAIL',
            'NOTIFICATIONS',
            'MEET',
            'FILES',
            'MAP',
            'DASH',
          ]
          const filtered = parsed.filter((k): k is ViewKey => validKeys.includes(k))
          if (filtered.length > 0) return filtered
        }
      }
    } catch {
      // ignore
    }
    return ['DASH', 'MAP']
  })
  const [view, setViewInternal] = useState<ViewKey>(() => {
    try {
      const saved = localStorage.getItem('zenith_open_tabs')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0] as ViewKey
        }
      }
    } catch {
      // ignore
    }
    return 'DASH'
  })

  const setView = useCallback((v: ViewKey) => {
    setViewInternal(v)
    setOpenTabs((prev) => {
      if (prev.includes(v)) return prev
      const updated = [...prev, v]
      try {
        localStorage.setItem('zenith_open_tabs', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })
  }, [])

  const openTab = useCallback((v: ViewKey) => {
    setView(v)
  }, [setView])

  const closeTab = useCallback((v: ViewKey) => {
    setOpenTabs((prev) => {
      const nextTabs = prev.filter((t) => t !== v)
      const finalTabs = nextTabs.length > 0 ? nextTabs : (['DASH'] as ViewKey[])
      try {
        localStorage.setItem('zenith_open_tabs', JSON.stringify(finalTabs))
      } catch {
        // ignore
      }
      setViewInternal((currentView) => {
        if (currentView === v) {
          const closedIndex = prev.indexOf(v)
          return finalTabs[Math.min(closedIndex, finalTabs.length - 1)] || 'DASH'
        }
        return currentView
      })
      return finalTabs
    })
  }, [])

  const closeOtherTabs = useCallback((v: ViewKey) => {
    setOpenTabs([v])
    setViewInternal(v)
    try {
      localStorage.setItem('zenith_open_tabs', JSON.stringify([v]))
    } catch {
      // ignore
    }
  }, [])
  const [device, setDeviceState] = useState<DeviceMode>(() => {
    try {
      const saved = localStorage.getItem('zenith_device_mode') as DeviceMode | null
      if (saved === 'D' || saved === 'T') return saved
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 1024 ? 'T' : 'D'
    }
    return 'D'
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const notified = useRef<Set<string>>(new Set())

  // Notifications state: Meet briefings & Gmail alerts
  const [gmailAlerts, setGmailAlerts] = useState<AppNotification[]>([])
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('zenith_notifications_read')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('zenith_notifications_dismissed')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  const setDevice = useCallback((d: DeviceMode) => {
    setDeviceState(d)
    try {
      localStorage.setItem('zenith_device_mode', d)
    } catch {
      // ignore
    }
  }, [])

  // Auto-detect tablet mode on resize/orientation change if user hasn't explicitly locked preference
  useEffect(() => {
    const handleResize = () => {
      try {
        const saved = localStorage.getItem('zenith_device_mode')
        if (!saved) {
          const autoMode: DeviceMode = window.innerWidth <= 1024 ? 'T' : 'D'
          setDeviceState(autoMode)
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  // Keep active authenticated user ID strictly synchronized
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      const activeUid = user?.uid || loadSession()?.uid || null
      setCurrentUid(activeUid)
    })
    return () => unsubAuth()
  }, [])

  // 1. Subscribe to user files from Firestore: /users/{userId}/files
  useEffect(() => {
    if (!currentUid) {
      setUserFiles([])
      return
    }

    const unsubFiles = subscribeToUserFiles(
      currentUid,
      (files) => {
        setUserFiles(files)
      },
      (err) => {
        console.warn('ZenithContext files subscription warning:', err)
      },
    )

    return () => {
      unsubFiles()
    }
  }, [currentUid])

  // 2. Subscribe to user-scoped Firestore records: /users/{userId}/records
  useEffect(() => {
    if (!currentUid) {
      setRecords([])
      return
    }

    const unsubRecords = subscribeToFirestoreRecords(
      currentUid,
      (remoteRecords) => {
        setRecords(remoteRecords.filter((r) => !isDummyRecord(r)))
      },
      (err) => {
        console.warn('ZenithContext user records subscription notice:', err)
      },
    )

    return () => {
      unsubRecords()
    }
  }, [currentUid])

  // 3. Subscribe to user-scoped Firestore events: /users/{userId}/events
  useEffect(() => {
    if (!currentUid) {
      setEvents([])
      return
    }

    const unsubEvents = subscribeToUserEvents(
      currentUid,
      (remoteEvents) => {
        setEvents(remoteEvents)
      },
      (err) => {
        console.warn('ZenithContext user events subscription notice:', err)
      },
    )

    return () => {
      unsubEvents()
    }
  }, [currentUid])

  const addUserFile = useCallback((file: UserFile) => {
    setUserFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== file.id && f.name !== file.name)
      return [file, ...filtered]
    })
  }, [])

  const removeUserFile = useCallback((fileId: string) => {
    setUserFiles((prev) => prev.filter((f) => f.id !== fileId))
  }, [])

  const pushLog = useCallback((operator: string, action: string, tone?: LogLine['tone']) => {
    setLogs((prev) =>
      [...prev, { id: `L${Date.now()}${Math.random().toFixed(3)}`, ts: stamp(), operator, action, tone }].slice(-80),
    )
  }, [])

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `T${Date.now()}${Math.random().toFixed(3)}`
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 7000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /** refresh() — loads user-scoped data from Firestore */
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const t0 = performance.now()
    try {
      if (currentUid) {
        const [recs, evs, fresh] = await Promise.all([
          fetchRecordsFromFirestore(currentUid),
          fetchUserEventsFromFirestore(currentUid),
          callNexus<Record<string, string>>('loadDSHFreshness').catch(() => ({})),
        ])
        setRecords(recs.filter((r) => !isDummyRecord(r)))
        setEvents(evs)
        setFreshness(fresh ?? {})
        setLatency(Math.round(performance.now() - t0))
        setSyncCycle(stamp())
        pushLog('SYS', `sync cycle complete — ${recs.length} user records / ${evs.length} user events`, 'nexus')
      } else {
        setRecords([])
        setEvents([])
        setSyncCycle(stamp())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NEXUS link failure')
      pushLog('SYS', 'sync cycle FAILED — retry queued', 'hazard')
    } finally {
      setLoading(false)
    }
  }, [currentUid, pushLog])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Calendar reminder sweep — toast + chime for events inside 60 minutes. */
  useEffect(() => {
    const sweep = () => {
      const now = new Date()
      events.forEach((ev) => {
        if (!ev.date || !ev.start) return
        const evStart = new Date(`${ev.date}T${ev.start}`)
        const diffMs = evStart.getTime() - now.getTime()
        const diffMin = Math.round(diffMs / 60000)
        if (diffMin > 0 && diffMin <= 60 && !notified.current.has(ev.id)) {
          notified.current.add(ev.id)
          playChime()
          pushToast({
            title: `OPERATIONS BRIEFING: ${ev.title}`,
            body: `T-${diffMin}m (${ev.start}) · All channels verify clearance`,
            tone: 'caution',
          })
          pushLog('DISPATCH', `T-${diffMin}m alert triggered for ${ev.title}`, 'caution')
        }
      })
    }
    sweep()
    const id = window.setInterval(sweep, 45000)
    return () => window.clearInterval(id)
  }, [events, pushToast, pushLog])

  const updateRecord = useCallback(
    async (id: string, field: keyof OperatorRecord, value: string | number) => {
      const now = new Date().toISOString()
      let updatedRec: OperatorRecord | null = null
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r
          const updated: OperatorRecord = {
            ...r,
            [field]: value,
            updatedAt: now,
            lastAction: 'UPDATED',
          }
          if (field === 'stage' && typeof value === 'string' && STAGE_SLA_MAP[value as Stage]) {
            updated.sla = STAGE_SLA_MAP[value as Stage]
          }
          updatedRec = updated
          return updated
        }),
      )
      setFreshness((prev) => ({ ...prev, [id]: now }))
      pushLog('OPERATOR', `${id} ${String(field)} → ${String(value)}`)
      if (updatedRec && currentUid) {
        try {
          await syncRecordToFirestore(updatedRec, currentUid)
          setSyncCycle(stamp())
        } catch {
          pushLog('SYS', `commit failed on ${id} — held locally`, 'hazard')
        }
      }
    },
    [currentUid, pushLog],
  )

  const updateFullRecord = useCallback(
    async (record: OperatorRecord) => {
      const now = new Date().toISOString()
      const updated: OperatorRecord = {
        ...record,
        updatedAt: now,
        lastAction: 'UPDATED',
      }
      if (record.stage && STAGE_SLA_MAP[record.stage]) {
        updated.sla = STAGE_SLA_MAP[record.stage]
      }
      setRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)))
      setFreshness((prev) => ({ ...prev, [record.id]: now }))
      pushLog('OPERATOR', `modified record ${record.id} (${record.operator || record.client})`, 'nexus')
      if (currentUid) {
        try {
          await syncRecordToFirestore(updated, currentUid)
          setSyncCycle(stamp())
        } catch {
          pushLog('SYS', `commit failed on ${record.id} — held locally`, 'hazard')
        }
      }
    },
    [currentUid, pushLog],
  )

  const deleteRecord = useCallback(
    async (id: string) => {
      setRecords((prev) => prev.filter((r) => r.id !== id))
      pushLog('OPERATOR', `purged record ${id}`, 'hazard')
      if (currentUid) {
        try {
          await deleteRecordFromFirestore(id, currentUid)
        } catch {
          pushLog('SYS', `purge not acknowledged for ${id}`, 'hazard')
        }
      }
    },
    [currentUid, pushLog],
  )

  const createRecord = useCallback(
    async (record: OperatorRecord) => {
      const now = new Date().toISOString()
      const newRec: OperatorRecord = {
        ...record,
        createdAt: now,
        updatedAt: now,
        lastAction: 'NEW',
        sla: record.stage && STAGE_SLA_MAP[record.stage] ? STAGE_SLA_MAP[record.stage] : 20,
      }
      setRecords((prev) => [newRec, ...prev])
      setFreshness((prev) => ({ ...prev, [newRec.id]: now }))
      pushLog('OPERATOR', `created record ${newRec.id}`, 'nexus')
      if (currentUid) {
        try {
          await syncRecordToFirestore(newRec, currentUid)
        } catch {
          pushLog('SYS', `create not acknowledged for ${newRec.id}`, 'hazard')
        }
      }
    },
    [currentUid, pushLog],
  )

  const saveEvent = useCallback(
    async (event: CalendarEvent) => {
      setEvents((prev) =>
        prev.some((e) => e.id === event.id)
          ? prev.map((e) => (e.id === event.id ? event : e))
          : [...prev, event],
      )
      pushLog('CAL', `saved event ${event.id} — ${event.title}`, 'nexus')
      if (currentUid) {
        try {
          await syncEventToFirestore(event, currentUid)
        } catch {
          pushLog('SYS', 'calendar write held locally', 'caution')
        }
      }
    },
    [currentUid, pushLog],
  )

  const deleteEvent = useCallback(
    async (id: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== id))
      pushLog('CAL', `deleted event ${id}`, 'hazard')
      if (currentUid) {
        try {
          await deleteEventFromFirestore(id, currentUid)
        } catch {
          pushLog('SYS', 'calendar delete held locally', 'caution')
        }
      }
    },
    [currentUid, pushLog],
  )

  const availableClients = useMemo(() => {
    return getActiveAvailableClients(records)
  }, [records])

  // Periodic sync of unread Gmail notifications
  const syncNotifications = useCallback(async () => {
    const token = getCachedAccessToken()
    if (!token) return
    try {
      const res = await listGmailMessages({ query: 'is:unread in:inbox', maxResults: 10 })
      const alerts: AppNotification[] = res.messages.map((m) => ({
        id: `GMAIL-${m.id}`,
        source: 'GMAIL',
        title: `Email from ${m.fromName}`,
        description: `${m.subject} — ${m.snippet.slice(0, 110)}…`,
        timestamp: m.date,
        unread: true,
        targetTab: 'GMAIL',
        metadata: { messageId: m.id, from: m.from, subject: m.subject },
      }))
      setGmailAlerts(alerts)
    } catch (err) {
      console.warn('Gmail notification sync skipped:', err)
    }
  }, [])

  useEffect(() => {
    void syncNotifications()
    const id = setInterval(() => {
      void syncNotifications()
    }, 60000)
    return () => clearInterval(id)
  }, [syncNotifications])

  // Derive Google Meet alerts from events
  const meetingNotifications = useMemo<AppNotification[]>(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

    return events
      .filter((ev) => ev.date >= todayStr)
      .map((ev) => {
        const isToday = ev.date === todayStr
        let statusTag = 'UPCOMING'
        let timeTag = `${ev.date} · ${ev.start}`

        if (isToday) {
          const [startH, startM] = ev.start.split(':').map(Number)
          const startMin = (startH || 0) * 60 + (startM || 0)
          const diff = startMin - nowMinutes

          if (diff <= 15 && diff >= -45) {
            statusTag = 'HAPPENING_NOW'
            timeTag = `STARTING NOW (${ev.start} - ${ev.end})`
          } else if (diff > 15 && diff <= 120) {
            statusTag = 'STARTING_SOON'
            timeTag = `T-${diff}m (${ev.start})`
          } else {
            timeTag = `TODAY at ${ev.start}`
          }
        }

        return {
          id: `MEET-${ev.id}`,
          source: 'MEET',
          title: `Google Meet: ${ev.title}`,
          description: `${timeTag} · ${ev.description || 'Dispatch & briefing session'}${
            ev.location ? ` @ ${ev.location}` : ''
          }`,
          timestamp: `${ev.date}T${ev.start}:00Z`,
          unread: true,
          targetTab: 'MEET',
          metadata: { event: ev, statusTag, meet: ev.meet },
        }
      })
  }, [events])

  // Combined notifications list
  const notifications = useMemo<AppNotification[]>(() => {
    const combined = [...meetingNotifications, ...gmailAlerts]
      .filter((n) => !dismissedNotificationIds.has(n.id))
      .map((n) => ({
        ...n,
        unread: !readNotificationIds.has(n.id),
      }))

    return combined.sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1
      return b.timestamp.localeCompare(a.timestamp)
    })
  }, [meetingNotifications, gmailAlerts, readNotificationIds, dismissedNotificationIds])

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => n.unread).length
  }, [notifications])

  const markNotificationRead = useCallback((id: string) => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem('zenith_notifications_read', JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev)
      notifications.forEach((n) => next.add(n.id))
      try {
        localStorage.setItem('zenith_notifications_read', JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }, [notifications])

  const dismissNotification = useCallback((id: string) => {
    setDismissedNotificationIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem('zenith_notifications_dismissed', JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const dismissAllNotifications = useCallback(() => {
    setDismissedNotificationIds((prev) => {
      const next = new Set(prev)
      notifications.forEach((n) => next.add(n.id))
      try {
        localStorage.setItem('zenith_notifications_dismissed', JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }, [notifications])

  const value: ZenithState = {
    records,
    availableClients,
    events,
    userFiles,
    loading,
    error,
    bridge: 'LOCAL_FALLBACK',
    latency,
    syncCycle,
    freshness,
    logs,
    view,
    openTabs,
    device,
    toasts,
    setView,
    openTab,
    closeTab,
    closeOtherTabs,
    setDevice,
    setUserFiles,
    addUserFile,
    removeUserFile,
    refresh,
    updateRecord,
    updateFullRecord,
    deleteRecord,
    createRecord,
    saveEvent,
    deleteEvent,
    pushLog,
    pushToast,
    dismissToast,
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
    dismissAllNotifications,
    syncNotifications,
  }

  return <ZenithContext.Provider value={value}>{children}</ZenithContext.Provider>
}

export function useZenith(): ZenithState {
  const ctx = useContext(ZenithContext)
  if (!ctx) throw new Error('useZenith must be used within ZenithProvider')
  return ctx
}
