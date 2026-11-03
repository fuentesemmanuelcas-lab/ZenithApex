import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { CalendarEvent } from '../types/zenith'

export const EVENT_KEY_PREFIX = 'zenith_user_events_'

function getActiveUid(): string | null {
  return auth.currentUser?.uid || null
}

export function getLocalEvents(uid?: string | null): CalendarEvent[] {
  const activeUid = uid || getActiveUid()
  if (!activeUid) return []
  try {
    const raw = window.localStorage.getItem(`${EVENT_KEY_PREFIX}${activeUid}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.warn('Error reading local events:', err)
  }
  return []
}

export function saveLocalEvents(events: CalendarEvent[], uid?: string | null): void {
  const activeUid = uid || getActiveUid()
  if (!activeUid) return
  try {
    window.localStorage.setItem(`${EVENT_KEY_PREFIX}${activeUid}`, JSON.stringify(events))
  } catch (err) {
    console.warn('Error saving local events:', err)
  }
}

function cleanEventPayload(event: CalendarEvent): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if (value !== undefined) {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Persists an event to the authenticated user's Firestore collection:
 * /users/{userId}/events/{eventId}
 */
export async function syncEventToFirestore(event: CalendarEvent, uid?: string | null): Promise<void> {
  const activeUid = uid || getActiveUid()
  if (!event || !event.id || !activeUid) return

  // Update local storage first
  const current = getLocalEvents(activeUid)
  const exists = current.some((e) => e.id === event.id)
  const next = exists ? current.map((e) => (e.id === event.id ? event : e)) : [...current, event]
  saveLocalEvents(next, activeUid)

  try {
    const docRef = doc(db, 'users', activeUid, 'events', event.id)
    await setDoc(docRef, cleanEventPayload(event), { merge: true })
  } catch (err) {
    console.warn('Firestore event save error:', err)
  }
}

/**
 * Removes an event from the user's Firestore collection
 */
export async function deleteEventFromFirestore(id: string, uid?: string | null): Promise<void> {
  const activeUid = uid || getActiveUid()
  if (!id || !activeUid) return

  const current = getLocalEvents(activeUid).filter((e) => e.id !== id)
  saveLocalEvents(current, activeUid)

  try {
    const docRef = doc(db, 'users', activeUid, 'events', id)
    await deleteDoc(docRef)
  } catch (err) {
    console.warn('Firestore event delete error:', err)
  }
}

/**
 * Fetches the user's events from Firestore
 */
export async function fetchUserEventsFromFirestore(uid?: string | null): Promise<CalendarEvent[]> {
  const activeUid = uid || getActiveUid()
  if (!activeUid) return []

  const local = getLocalEvents(activeUid)
  try {
    const colRef = collection(db, 'users', activeUid, 'events')
    const snap = await getDocs(colRef)
    if (!snap.empty) {
      const remoteEvents: CalendarEvent[] = []
      snap.forEach((d) => {
        const data = d.data() as CalendarEvent
        if (data && data.id) {
          remoteEvents.push(data)
        }
      })

      const map = new Map<string, CalendarEvent>()
      local.forEach((e) => map.set(e.id, e))
      remoteEvents.forEach((e) => map.set(e.id, e))
      const merged = Array.from(map.values())
      saveLocalEvents(merged, activeUid)
      return merged
    }
  } catch (err) {
    console.warn('Firestore events fetch notice:', err)
  }

  return local
}

/**
 * Subscribes to real-time events for the active user only
 */
export function subscribeToUserEvents(
  uid: string,
  onEvents: (events: CalendarEvent[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  if (!uid) {
    onEvents([])
    return () => {}
  }

  const initial = getLocalEvents(uid)
  if (initial.length > 0) {
    onEvents(initial)
  }

  const colRef = collection(db, 'users', uid, 'events')
  return onSnapshot(
    colRef,
    (snap) => {
      const events: CalendarEvent[] = []
      snap.forEach((d) => {
        const data = d.data() as CalendarEvent
        if (data && data.id) {
          events.push(data)
        }
      })
      saveLocalEvents(events, uid)
      onEvents(events)
    },
    (err) => {
      console.warn('Firestore user events subscription notice:', err)
      if (onError) onError(err)
      onEvents(getLocalEvents(uid))
    },
  )
}
