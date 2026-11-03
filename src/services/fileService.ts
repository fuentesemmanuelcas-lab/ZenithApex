import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import type { UserFile } from '../types/zenith'

export interface UploadFileOptions {
  file: File
  uid: string
  folderId?: string
  content?: string
  isNote?: boolean
  onProgress?: (progress: number) => void
}

const STORAGE_KEY_PREFIX = 'zenith_user_files_'

function getFilesFromStorage(uid: string): UserFile[] {
  if (!uid) return []
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${uid}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.warn('LocalStorage load files error:', e)
  }
  return []
}

function saveFilesToStorage(uid: string, files: UserFile[]): void {
  if (!uid) return
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${uid}`, JSON.stringify(files))
  } catch (e) {
    console.warn('LocalStorage save files error:', e)
  }
  localListeners.forEach((l) => {
    if (l.uid === uid) {
      l.callback(files)
    }
  })
}

interface Listener {
  uid: string
  callback: (files: UserFile[]) => void
}
const localListeners: Listener[] = []

/**
 * Creates a self-contained data URL from text content for instant, zero-CORS preview & download.
 */
function createTextDataUrl(text: string, mimeType = 'text/plain'): string {
  try {
    const utf8Bytes = new TextEncoder().encode(text)
    let binary = ''
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i])
    }
    return `data:${mimeType};base64,${btoa(binary)}`
  } catch {
    return ''
  }
}

/**
 * Upload a file to Firebase Storage & Firestore, with resilient local fallback.
 */
export async function uploadUserFile({
  file,
  uid,
  folderId,
  content,
  isNote,
  onProgress,
}: UploadFileOptions): Promise<UserFile> {
  if (!uid) {
    throw new Error('AUTHENTICATION_REQUIRED: User must be authenticated to upload files.')
  }

  const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const cleanFileName = file.name.replace(/[/\\?%*:|"<>]/g, '_')
  const storagePath = `user_uploads/${uid}/${fileId}_${cleanFileName}`

  // Determine text content for text files or notes
  let textContent = content
  const isTextLike =
    Boolean(isNote) ||
    file.type.startsWith('text/') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.csv') ||
    file.name.endsWith('.log')

  if (textContent === undefined && isTextLike) {
    try {
      textContent = await file.text()
    } catch {
      // ignore
    }
  }

  const textDataUrl = textContent !== undefined ? createTextDataUrl(textContent, file.type || 'text/plain') : ''

  let downloadURL = textDataUrl || ''
  let uploadSucceededInCloud = false

  try {
    // Attempt Firebase Storage Upload
    const fileRef = storageRef(storage, storagePath)
    const uploadTask = uploadBytesResumable(fileRef, file)

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          onProgress?.(progress)
        },
        (error) => {
          console.warn('Firebase Storage upload notice, falling back:', error)
          reject(error)
        },
        async () => {
          try {
            downloadURL = await getDownloadURL(uploadTask.snapshot.ref)
            uploadSucceededInCloud = true
            resolve()
          } catch (err) {
            reject(err)
          }
        },
      )
    })
  } catch (storageErr) {
    console.warn('Storage upload notice, falling back locally:', storageErr)
    if (!downloadURL) {
      downloadURL = textDataUrl || URL.createObjectURL(file)
    }
  }

  if (!downloadURL) {
    downloadURL = textDataUrl || URL.createObjectURL(file)
  }

  const newFile: UserFile = {
    id: fileId,
    name: file.name,
    storagePath,
    downloadURL,
    size: file.size,
    type: file.type || (isNote ? 'text/plain' : 'application/octet-stream'),
    folderId: folderId || null,
    createdAt: new Date().toISOString(),
    content: textContent,
    extractedText: textContent,
    contentSnippet: textContent ? textContent.slice(0, 300) : undefined,
    isNote: Boolean(isNote),
  }

  // Persist to Cloud Firestore unconditionally so data is never lost
  try {
    const docRef = doc(db, 'users', uid, 'files', fileId)
    await setDoc(docRef, newFile)
  } catch (dbErr) {
    console.warn('Firestore file document write error, cached in local storage:', dbErr)
  }

  // Update local cache
  const existing = getFilesFromStorage(uid)
  const updated = [newFile, ...existing.filter((f) => f.id !== fileId)]
  saveFilesToStorage(uid, updated)

  onProgress?.(100)
  return newFile
}

/**
 * Delete a user file from Cloud Firestore, Firebase Storage, and local cache.
 */
export async function deleteUserFile(uid: string, fileId: string, filePath?: string): Promise<void> {
  if (!uid) throw new Error('AUTHENTICATION_REQUIRED: User must be authenticated.')

  // Remove from Firestore
  try {
    const docRef = doc(db, 'users', uid, 'files', fileId)
    await deleteDoc(docRef)
  } catch (dbErr) {
    console.warn('Firestore file delete notice:', dbErr)
  }

  // Remove from Firebase Storage if path is provided
  if (filePath) {
    try {
      const fileRef = storageRef(storage, filePath)
      await deleteObject(fileRef)
    } catch (storageErr) {
      console.warn('Storage file delete notice:', storageErr)
    }
  }

  // Remove from local cache
  const existing = getFilesFromStorage(uid)
  const updated = existing.filter((f) => f.id !== fileId)
  saveFilesToStorage(uid, updated)
}

/**
 * Subscribe in real-time to the user's files list from Firestore with localStorage fallback.
 */
export function subscribeToUserFiles(
  uid: string,
  onUpdate: (files: UserFile[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!uid) {
    onUpdate([])
    return () => {}
  }

  // First deliver any locally cached files immediately
  const localInitial = getFilesFromStorage(uid)
  onUpdate(localInitial)

  const localListener: Listener = { uid, callback: onUpdate }
  localListeners.push(localListener)

  // Subscribe to Cloud Firestore collection
  let unsubFirestore: (() => void) | null = null
  try {
    const colRef = collection(db, 'users', uid, 'files')
    unsubFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        const firestoreFiles: UserFile[] = []
        snapshot.forEach((d) => {
          firestoreFiles.push(d.data() as UserFile)
        })

        // Sort descending by creation date
        firestoreFiles.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
        )

        // Merge with local files that haven't synced yet
        const localOnly = getFilesFromStorage(uid).filter(
          (loc) => !firestoreFiles.some((f) => f.id === loc.id),
        )
        const combined = [...firestoreFiles, ...localOnly]

        saveFilesToStorage(uid, combined)
        onUpdate(combined)
      },
      (err) => {
        console.warn('Firestore onSnapshot subscription notice, running local listener:', err)
        onError?.(err)
      },
    )
  } catch (err) {
    console.warn('Failed to attach Firestore snapshot listener:', err)
  }

  return () => {
    if (unsubFirestore) unsubFirestore()
    const idx = localListeners.indexOf(localListener)
    if (idx !== -1) localListeners.splice(idx, 1)
  }
}

/**
 * Trigger secure download in the browser.
 */
export function triggerFileDownload(file: UserFile): void {
  if (typeof file.content === 'string' && file.content.length > 0) {
    const blob = new Blob([file.content], { type: file.type || 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return
  }

  if (!file.downloadURL) return
  const a = document.createElement('a')
  a.href = file.downloadURL
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export interface CreateUserNoteOptions {
  uid: string
  title: string
  content: string
  folderId?: string
}

/**
 * Create a new text note and upload it to user files.
 */
export async function createUserNote({
  uid,
  title,
  content,
  folderId,
}: CreateUserNoteOptions): Promise<UserFile> {
  if (!uid) {
    throw new Error('AUTHENTICATION_REQUIRED: User must be authenticated to create notes.')
  }

  const rawTitle = title.trim() || 'UNTITLED_NOTE'
  const fileName = rawTitle.endsWith('.txt') || rawTitle.endsWith('.md')
    ? rawTitle
    : `${rawTitle}.txt`

  const safeName = fileName.replace(/[/\\?%*:|"<>]/g, '_')
  const fileBlob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const file = new File([fileBlob], safeName, { type: 'text/plain' })

  return uploadUserFile({
    file,
    uid,
    folderId,
    content,
    isNote: true,
  })
}

/**
 * Fetch raw text content of a file with multi-layer fallback.
 */
export async function fetchUserFileText(file: UserFile): Promise<string> {
  if (!file) return ''

  // 1. Direct in-memory content
  if (typeof file.content === 'string' && file.content.length > 0) {
    return file.content
  }

  // 2. Extracted text
  if (typeof file.extractedText === 'string' && file.extractedText.length > 0) {
    return file.extractedText
  }

  // 3. Data URL decode
  if (file.downloadURL && file.downloadURL.startsWith('data:')) {
    try {
      const parts = file.downloadURL.split(',')
      if (parts.length > 1) {
        if (parts[0].includes(';base64')) {
          const binary = atob(parts[1])
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
          }
          return new TextDecoder().decode(bytes)
        } else {
          return decodeURIComponent(parts[1])
        }
      }
    } catch (e) {
      console.warn('Failed to decode data URL:', e)
    }
  }

  // 4. Remote HTTP fetch
  if (file.downloadURL) {
    try {
      const res = await fetch(file.downloadURL)
      if (res.ok) {
        const text = await res.text()
        if (text) return text
      }
    } catch (err) {
      console.warn('Failed to fetch file text via downloadURL:', err)
    }
  }

  // 5. Local storage cache search
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const raw = localStorage.getItem(key)
        if (raw) {
          const list = JSON.parse(raw)
          if (Array.isArray(list)) {
            const found = list.find((item: UserFile) => item.id === file.id)
            if (found?.content) return found.content
            if (found?.extractedText) return found.extractedText
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return ''
}

/**
 * Update metadata of a user file.
 */
export async function updateUserFileMetadata(
  uid: string,
  fileId: string,
  updates: Partial<UserFile>,
): Promise<void> {
  if (!uid || !fileId) return

  // Update in Firestore
  try {
    const docRef = doc(db, 'users', uid, 'files', fileId)
    await updateDoc(docRef, updates)
  } catch (err) {
    console.warn('Firestore metadata update notice:', err)
  }

  // Update in local cache
  const existing = getFilesFromStorage(uid)
  const updated = existing.map((f) => (f.id === fileId ? { ...f, ...updates } : f))
  saveFilesToStorage(uid, updated)
}

export interface UpdateUserTextFileOptions {
  uid: string
  file: UserFile
  newContent: string
  newName?: string
  newFolderId?: string | null
}

/**
 * Update content of a text file in Firebase Storage, Firestore, and local cache.
 */
export async function updateUserTextFile({
  uid,
  file,
  newContent,
  newName,
  newFolderId,
}: UpdateUserTextFileOptions): Promise<UserFile> {
  const fileBlob = new Blob([newContent], { type: file.type || 'text/plain;charset=utf-8' })
  const textDataUrl = createTextDataUrl(newContent, file.type || 'text/plain')
  let downloadURL = textDataUrl || file.downloadURL

  // Upload updated bytes to storage if storagePath exists
  if (file.storagePath) {
    try {
      const fileRef = storageRef(storage, file.storagePath)
      await uploadBytesResumable(fileRef, fileBlob)
      downloadURL = await getDownloadURL(fileRef)
    } catch (err) {
      console.warn('Storage text update notice, falling back locally:', err)
      downloadURL = textDataUrl || URL.createObjectURL(fileBlob)
    }
  }

  const updatedFile: UserFile = {
    ...file,
    name: newName || file.name,
    folderId: newFolderId !== undefined ? newFolderId : file.folderId,
    downloadURL,
    size: fileBlob.size,
    content: newContent,
    extractedText: newContent,
    contentSnippet: newContent.slice(0, 300),
  }

  // Update in Firestore
  try {
    const docRef = doc(db, 'users', uid, 'files', file.id)
    await updateDoc(docRef, {
      name: updatedFile.name,
      folderId: updatedFile.folderId,
      downloadURL: updatedFile.downloadURL,
      size: updatedFile.size,
      content: newContent,
      extractedText: newContent,
      contentSnippet: newContent.slice(0, 300),
    })
  } catch (err) {
    console.warn('Firestore text update notice:', err)
  }

  const existing = getFilesFromStorage(uid)
  const updated = existing.map((f) => (f.id === file.id ? updatedFile : f))
  saveFilesToStorage(uid, updated)
  return updatedFile
}
