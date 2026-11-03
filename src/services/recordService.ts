import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { OperatorRecord } from '../types/zenith'

export const RECORD_KEY_PREFIX = 'zenith_user_records_'

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string
  operationType: OperationType
  path: string | null
  authInfo: {
    userId?: string | null
    email?: string | null
    emailVerified?: boolean | null
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  }
  console.warn('Firestore User Record Notice: ', JSON.stringify(errInfo))
}

function getActiveUid(): string | null {
  return auth.currentUser?.uid || null
}

/**
 * Clean record to strip any undefined values before sending to Firestore
 */
function cleanRecordPayload(record: OperatorRecord): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      cleaned[key] = value
    }
  }
  return cleaned
}

export function getLocalRecords(uid?: string | null): OperatorRecord[] {
  const activeUid = uid || getActiveUid()
  if (!activeUid) return []
  try {
    const raw = window.localStorage.getItem(`${RECORD_KEY_PREFIX}${activeUid}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.warn('Error reading user local records:', err)
  }
  return []
}

export function saveLocalRecords(records: OperatorRecord[], uid?: string | null): void {
  const activeUid = uid || getActiveUid()
  if (!activeUid) return
  try {
    window.localStorage.setItem(`${RECORD_KEY_PREFIX}${activeUid}`, JSON.stringify(records))
  } catch (err) {
    console.warn('Error saving user local records:', err)
  }
}

/**
 * Persists a single record to the user's private Firestore collection:
 * /users/{userId}/records/{recordId}
 */
export async function syncRecordToFirestore(record: OperatorRecord, uid?: string | null): Promise<void> {
  const activeUid = uid || getActiveUid()
  if (!record || !record.id || !activeUid) return

  // Update localStorage first for zero-latency local availability
  const current = getLocalRecords(activeUid)
  const exists = current.some((r) => r.id === record.id)
  const next = exists ? current.map((r) => (r.id === record.id ? record : r)) : [record, ...current]
  saveLocalRecords(next, activeUid)

  // Persist to Cloud Firestore under user's private subcollection
  try {
    const payload = cleanRecordPayload(record)
    const docRef = doc(db, 'users', activeUid, 'records', record.id)
    await setDoc(docRef, payload, { merge: true })
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${activeUid}/records/${record.id}`)
  }
}

/**
 * Removes a record from the user's private Firestore collection
 */
export async function deleteRecordFromFirestore(id: string, uid?: string | null): Promise<void> {
  const activeUid = uid || getActiveUid()
  if (!id || !activeUid) return

  // Update local storage
  const current = getLocalRecords(activeUid).filter((r) => r.id !== id)
  saveLocalRecords(current, activeUid)

  // Delete from Cloud Firestore
  try {
    const docRef = doc(db, 'users', activeUid, 'records', id)
    await deleteDoc(docRef)
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${activeUid}/records/${id}`)
  }
}

/**
 * Fetches operational records from the user's private collection
 */
export async function fetchRecordsFromFirestore(uid?: string | null): Promise<OperatorRecord[]> {
  const activeUid = uid || getActiveUid()
  if (!activeUid) return []

  const local = getLocalRecords(activeUid)
  try {
    const colRef = collection(db, 'users', activeUid, 'records')
    const snap = await getDocs(colRef)
    if (!snap.empty) {
      const remoteRecords: OperatorRecord[] = []
      snap.forEach((d) => {
        const data = d.data() as OperatorRecord
        if (data && data.id) {
          remoteRecords.push(data)
        }
      })

      // Merge remote records with local records
      const recordMap = new Map<string, OperatorRecord>()
      local.forEach((r) => recordMap.set(r.id, r))
      remoteRecords.forEach((r) => {
        const existing = recordMap.get(r.id)
        if (!existing) {
          recordMap.set(r.id, r)
        } else {
          const remoteTime = new Date(r.updatedAt || 0).getTime()
          const localTime = new Date(existing.updatedAt || 0).getTime()
          if (remoteTime >= localTime) {
            recordMap.set(r.id, r)
          }
        }
      })

      const merged = Array.from(recordMap.values())
      saveLocalRecords(merged, activeUid)
      return merged
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${activeUid}/records`)
  }
  return local
}

/**
 * Subscribes to real-time updates for the authenticated user's records only:
 * /users/{userId}/records
 */
export function subscribeToFirestoreRecords(
  uid: string,
  onRecords: (records: OperatorRecord[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  if (!uid) {
    onRecords([])
    return () => {}
  }

  const initial = getLocalRecords(uid)
  if (initial.length > 0) {
    onRecords(initial)
  }

  const colRef = collection(db, 'users', uid, 'records')
  return onSnapshot(
    colRef,
    (snap) => {
      const records: OperatorRecord[] = []
      snap.forEach((d) => {
        const data = d.data() as OperatorRecord
        if (data && data.id) {
          records.push(data)
        }
      })

      // Update local storage cache
      saveLocalRecords(records, uid)
      onRecords(records)
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${uid}/records`)
      if (onError) onError(err)
      const local = getLocalRecords(uid)
      onRecords(local)
    },
  )
}
