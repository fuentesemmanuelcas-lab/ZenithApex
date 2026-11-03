import type { CalendarEvent, OperatorRecord } from '../types/zenith'
import {
  deleteRecordFromFirestore,
  fetchRecordsFromFirestore,
  syncRecordToFirestore,
} from '../services/recordService'

/**
 * Apps Script bridge.
 *
 * When the app is served inside a Google Apps Script container, calls are
 * forwarded to `google.script.run`. Outside of it (local preview, offline)
 * the same call names are served by a localStorage fallback engine so the
 * interface stays fully interactive.
 */

const RECORD_KEY = 'zenith_local_records'
const EVENT_KEY = 'zenith_local_events'
const FRESH_KEY = 'zenith_dsh_freshness'
const PROFILE_KEY = 'zenith_operator_profiles'

export interface OperatorProfile {
  id: string
  handle: string
  clearance: string
  lastSeen: string
}

type ScriptRunner = {
  withSuccessHandler: (cb: (value: unknown) => void) => ScriptRunner
  withFailureHandler: (cb: (err: unknown) => void) => ScriptRunner
} & Record<string, (...args: unknown[]) => void>

declare global {
  interface Window {
    google?: { script?: { run?: ScriptRunner } }
  }
}

export const hasAppsScript = (): boolean =>
  typeof window !== 'undefined' && !!window.google?.script?.run

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — stay in-memory */
  }
}

const latency = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 90 + Math.random() * 210))

export const isDummyRecord = (r: OperatorRecord): boolean => {
  if (!r || !r.id) return true
  // NEVER purge CLIENT records or legitimate registered IDs!
  if (r.recordType === 'CLIENT' || r.id.startsWith('CL-')) return false
  if (r.id.startsWith('ZX-')) return true
  const opUpper = (r.operator || '').toUpperCase()
  const codeUpper = (r.codename || '').toUpperCase()
  if (
    opUpper.includes('KASUMI') ||
    opUpper.includes('OKOYE') ||
    codeUpper.includes('NIGHTHAWK') ||
    codeUpper.includes('DELTA_WIRE') ||
    codeUpper.includes('IRONCLAD')
  ) {
    return true
  }
  return false
}

const localHandlers: Record<string, (args: unknown[]) => unknown> = {
  getTrackerData: async () => {
    const rows = read<OperatorRecord[]>(RECORD_KEY, [])
    const sanitized = rows.filter((r) => !isDummyRecord(r)).map((r) => {
      if ((r.status as string) === 'PROCESSING' || !r.status) {
        return { ...r, status: 'ACTIVE' as const }
      }
      return r
    })
    if (sanitized.length !== rows.length) {
      write(RECORD_KEY, sanitized)
    }

    try {
      const remoteRecords = await fetchRecordsFromFirestore()
      if (remoteRecords && remoteRecords.length > 0) {
        const mergedMap = new Map<string, OperatorRecord>()
        sanitized.forEach((r) => mergedMap.set(r.id, r))
        remoteRecords.forEach((r) => mergedMap.set(r.id, r))
        const merged = Array.from(mergedMap.values()).filter((r) => !isDummyRecord(r))
        write(RECORD_KEY, merged)
        return merged
      }
    } catch (err) {
      console.warn('Firestore records sync notice in getTrackerData:', err)
    }

    return sanitized
  },
  getNexusData: () => ({ node: 'LIVE BRIDGE', ok: true }),
  updateSheetCell: (args) => {
    const [id, field, value] = args as [string, keyof OperatorRecord, string | number]
    const now = new Date().toISOString()
    const current = read<OperatorRecord[]>(RECORD_KEY, [])
    let targetRecord: OperatorRecord | null = null
    const rows = current.map((r) => {
      if (r.id === id) {
        targetRecord = { ...r, [field]: value, updatedAt: now }
        return targetRecord
      }
      return r
    })
    write(RECORD_KEY, rows)
    const fresh = read<Record<string, string>>(FRESH_KEY, {})
    fresh[id] = now
    write(FRESH_KEY, fresh)
    if (targetRecord) {
      syncRecordToFirestore(targetRecord).catch((err) => console.warn('Cell sync error:', err))
    }
    return rows
  },
  loadDSHFreshness: () => read<Record<string, string>>(FRESH_KEY, {}),
  saveDSHFreshness: (args) => {
    const [id, ts] = args as [string, string]
    const fresh = read<Record<string, string>>(FRESH_KEY, {})
    fresh[id] = ts
    write(FRESH_KEY, fresh)
    return fresh
  },
  getOperatorProfiles: () => read<OperatorProfile[]>(PROFILE_KEY, []),
  saveOperatorProfile: (args) => {
    const [profile] = args as [OperatorProfile]
    const list = read<OperatorProfile[]>(PROFILE_KEY, [])
    const next = list.some((p) => p.id === profile.id)
      ? list.map((p) => (p.id === profile.id ? profile : p))
      : [...list, profile]
    write(PROFILE_KEY, next)
    return next
  },
  createEntry: (args) => {
    const [record] = args as [OperatorRecord]
    const current = read<OperatorRecord[]>(RECORD_KEY, [])
    const exists = current.some((r) => r.id === record.id)
    const rows = exists ? current.map((r) => (r.id === record.id ? record : r)) : [record, ...current]
    write(RECORD_KEY, rows)
    syncRecordToFirestore(record).catch((err) => console.warn('Record create sync error:', err))
    return rows
  },
  saveFullEntry: (args) => {
    const [record] = args as [OperatorRecord]
    const now = new Date().toISOString()
    const rec = { ...record, updatedAt: now }
    const list = read<OperatorRecord[]>(RECORD_KEY, [])
    const exists = list.some((r) => r.id === rec.id)
    const next = exists ? list.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...list]
    write(RECORD_KEY, next)
    const fresh = read<Record<string, string>>(FRESH_KEY, {})
    fresh[rec.id] = now
    write(FRESH_KEY, fresh)
    syncRecordToFirestore(rec).catch((err) => console.warn('Record update sync error:', err))
    return next
  },
  deleteEntry: (args) => {
    const [id] = args as [string]
    const rows = read<OperatorRecord[]>(RECORD_KEY, []).filter((r) => r.id !== id)
    write(RECORD_KEY, rows)
    deleteRecordFromFirestore(id).catch((err) => console.warn('Record delete sync error:', err))
    return rows
  },
  getCalendarEvents: () => {
    const evs = read<CalendarEvent[]>(EVENT_KEY, [])
    const clean = evs.filter((e) => {
      if (!e || !e.id) return false
      if (e.id.startsWith('EV-0')) return false
      const title = (e.title || '').toLowerCase()
      if (
        title.includes('hazard review') ||
        title.includes('pipeline sync') ||
        title.includes('halo_drift') ||
        title.includes('qc freeze')
      ) {
        return false
      }
      return true
    })
    if (clean.length !== evs.length) {
      write(EVENT_KEY, clean)
    }
    return clean
  },
  saveCalendarEvent: (args) => {
    const [event] = args as [CalendarEvent]
    const events = read<CalendarEvent[]>(EVENT_KEY, [])
    const exists = events.some((e) => e.id === event.id)
    const next = exists ? events.map((e) => (e.id === event.id ? event : e)) : [...events, event]
    write(EVENT_KEY, next)
    return next
  },
  deleteCalendarEvent: (args) => {
    const [id] = args as [string]
    const next = read<CalendarEvent[]>(EVENT_KEY, []).filter((e) => e.id !== id)
    write(EVENT_KEY, next)
    return next
  },
}

export async function callNexus<T>(name: string, ...args: unknown[]): Promise<T> {
  const runner = window.google?.script?.run
  if (runner && typeof runner[name] === 'function') {
    return new Promise<T>((resolve, reject) => {
      const bound = runner
        .withSuccessHandler((value) => resolve(value as T))
        .withFailureHandler((err) => reject(err))
      ;(bound[name] as (...a: unknown[]) => void)(...args)
    })
  }
  await latency()
  const handler = localHandlers[name]
  if (!handler) throw new Error(`NEXUS: unknown call "${name}"`)
  return handler(args) as T
}

export const resetLocalBridge = (): void => {
  write(RECORD_KEY, [])
  write(EVENT_KEY, [])
  write(FRESH_KEY, {})
}
