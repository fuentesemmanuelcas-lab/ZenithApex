import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

const FOLDER_STORAGE_KEY_PREFIX = 'zenith_user_folders_'

/**
 * Loads dynamic folders created by the user from localStorage and syncs with Firestore.
 */
export function getStoredFolders(uid?: string): string[] {
  if (!uid) return []
  try {
    const raw = localStorage.getItem(`${FOLDER_STORAGE_KEY_PREFIX}${uid}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.warn('Failed to parse stored folders:', e)
  }
  return []
}

/**
 * Fetch folders from Firestore if available.
 */
export async function fetchUserFoldersFromFirestore(uid: string): Promise<string[]> {
  if (!uid) return []
  try {
    const ref = doc(db, 'users', uid, 'folders', 'index')
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data()
      if (Array.isArray(data?.folders)) {
        saveUserFoldersToStorage(uid, data.folders)
        return data.folders
      }
    }
  } catch (err) {
    console.warn('Firestore fetch folders notice:', err)
  }
  return getStoredFolders(uid)
}

function saveUserFoldersToStorage(uid: string, folders: string[]): void {
  try {
    localStorage.setItem(`${FOLDER_STORAGE_KEY_PREFIX}${uid}`, JSON.stringify(folders))
  } catch (e) {
    console.warn('LocalStorage save folder error:', e)
  }
}

/**
 * Save user folders to local storage and sync to Cloud Firestore.
 */
export async function saveUserFolders(uid: string, folders: string[]): Promise<void> {
  if (!uid) return
  const clean = Array.from(new Set(folders.map((f) => f.trim()).filter((f) => f && f !== 'ROOT' && f !== 'ALL')))
  saveUserFoldersToStorage(uid, clean)

  try {
    const ref = doc(db, 'users', uid, 'folders', 'index')
    await setDoc(ref, { folders: clean, updatedAt: new Date().toISOString() }, { merge: true })
  } catch (err) {
    console.warn('Firestore folder sync held locally:', err)
  }
}

/**
 * Add a new folder for the user.
 */
export async function addUserFolder(uid: string, folderName: string): Promise<string[]> {
  const clean = folderName.trim().toUpperCase()
  if (!clean || clean === 'ROOT' || clean === 'ALL') return getStoredFolders(uid)

  const current = getStoredFolders(uid)
  if (!current.includes(clean)) {
    const updated = [...current, clean]
    await saveUserFolders(uid, updated)
    return updated
  }
  return current
}

/**
 * Delete a folder for the user.
 */
export async function deleteUserFolder(uid: string, folderName: string): Promise<string[]> {
  const clean = folderName.trim().toUpperCase()
  const current = getStoredFolders(uid)
  const updated = current.filter((f) => f !== clean)
  await saveUserFolders(uid, updated)
  return updated
}
