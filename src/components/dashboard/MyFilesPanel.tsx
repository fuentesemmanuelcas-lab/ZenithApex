import React, { useEffect, useMemo, useState } from 'react'
import {
  DownloadIcon,
  Edit2Icon,
  EyeIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  HardDriveIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { loadSession } from '../../utils/authStore'
import {
  deleteUserFile,
  subscribeToUserFiles,
  triggerFileDownload,
} from '../../services/fileService'
import {
  addUserFolder,
  deleteUserFolder,
  getStoredFolders,
} from '../../services/folderService'
import { formatBytes, relTime } from '../../utils/format'
import { useZenith } from '../../contexts/ZenithContext'
import { PanelHead, Pill, TermButton } from '../ui/Primitives'
import { UploadFileModal, getFileIcon } from './UploadFileModal'
import { CreateNoteModal } from '../modals/CreateNoteModal'
import { FileDetailModal } from './FileDetailModal'
import type { NexusFile, UserFile } from '../../types/zenith'

export function MyFilesPanel({ compact = false }: { compact?: boolean }) {
  const { device, pushLog, pushToast } = useZenith()
  const [files, setFiles] = useState<UserFile[]>([])
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const [newFolderName, setNewFolderName] = useState<string>('')
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<string>('')
  const [folderFilter, setFolderFilter] = useState<string>('ALL')
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false)
  const [showNoteModal, setShowNoteModal] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean
    file: UserFile | null
    mode: 'VIEW' | 'EDIT'
  }>({
    isOpen: false,
    file: null,
    mode: 'VIEW',
  })

  const [user, setUser] = useState<User | null>(() => auth.currentUser)
  const tablet = device === 'T' || compact

  // Track auth state reactively
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
    })
    return () => unsub()
  }, [])

  const effectiveUid = user?.uid || loadSession()?.uid || null

  // Load custom folders for the user (No dummy folders)
  useEffect(() => {
    if (effectiveUid) {
      setCustomFolders(getStoredFolders(effectiveUid))
    }
  }, [effectiveUid])

  // Real-time synchronization with Firestore users/{uid}/files
  useEffect(() => {
    if (!effectiveUid) {
      setFiles([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = subscribeToUserFiles(
      effectiveUid,
      (userFiles) => {
        setFiles(userFiles)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.warn('Files subscription notice:', err)
        // Keep existing cached files available rather than blocking the UI
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [effectiveUid])

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files
      .filter((f) => {
        if (folderFilter === 'ALL') return true
        if (folderFilter === 'ROOT') return !f.folderId || f.folderId === 'ROOT'
        return f.folderId === folderFilter
      })
      .filter((f) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          f.name.toLowerCase().includes(q) ||
          f.type.toLowerCase().includes(q) ||
          (f.folderId && f.folderId.toLowerCase().includes(q))
        )
      })
  }, [files, folderFilter, query])

  // Total storage used
  const totalBytes = useMemo(() => {
    return files.reduce((acc, f) => {
      const s = typeof f.size === 'number' ? f.size : parseInt(String(f.size) || '0', 10)
      return acc + (isNaN(s) ? 0 : s)
    }, 0)
  }, [files])

  // Add folder handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveUid || !newFolderName.trim()) return
    const name = newFolderName.trim().toUpperCase()
    const updated = await addUserFolder(effectiveUid, name)
    setCustomFolders(updated)
    setFolderFilter(name)
    setNewFolderName('')
    setShowFolderModal(false)
    pushToast({
      title: 'FOLDER_CREATED',
      body: `Folder "${name}" established in personal cloud node`,
      tone: 'nexus',
    })
    pushLog('STORAGE', `created folder "${name}"`, 'nexus')
  }

  // Delete folder handler
  const handleDeleteFolder = async (folderToDelete: string) => {
    if (!effectiveUid || folderToDelete === 'ALL' || folderToDelete === 'ROOT') return
    const updated = await deleteUserFolder(effectiveUid, folderToDelete)
    setCustomFolders(updated)
    if (folderFilter === folderToDelete) {
      setFolderFilter('ALL')
    }
    pushToast({
      title: 'FOLDER_REMOVED',
      body: `Folder "${folderToDelete}" deleted`,
      tone: 'hazard',
    })
    pushLog('STORAGE', `removed folder "${folderToDelete}"`, 'hazard')
  }

  // Delete handler
  const handleDelete = async (file: UserFile) => {
    if (!effectiveUid || deletingId) return

    setDeletingId(file.id)
    pushLog('STORAGE', `purging file ${file.name}…`, 'hazard')

    try {
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
      await deleteUserFile(effectiveUid, file.id, file.storagePath)

      pushToast({
        title: 'FILE_DELETED',
        body: `${file.name} permanently removed from storage`,
        tone: 'hazard',
      })
      pushLog('STORAGE', `purged ${file.name} (${file.id}) from cluster`, 'hazard')
    } catch (err: any) {
      console.error('Delete file error:', err)
      setError(err?.message || 'Failed to delete file')
      pushLog('STORAGE', `delete failure on ${file.name}: ${err?.message}`, 'hazard')
    } finally {
      setDeletingId(null)
    }
  }

  // Download handler
  const handleDownload = (file: UserFile) => {
    pushLog('STORAGE', `retrieving download URL for ${file.name}`, 'nexus')
    triggerFileDownload(file)
  }

  // Format file creation date
  const renderDate = (file: UserFile) => {
    if (!file.createdAt) return 'RECENT'
    if (typeof file.createdAt === 'object' && 'seconds' in file.createdAt) {
      return relTime(new Date(file.createdAt.seconds * 1000).toISOString())
    }
    if (typeof file.createdAt === 'string') {
      return relTime(file.createdAt)
    }
    return 'RECENT'
  }

  if (!effectiveUid) {
    return (
      <section className="border border-line bg-surface p-6 text-center">
        <PanelHead label="MY_FILES // ACCESS_LOCKED" tone="hazard" />
        <div className="py-8">
          <HardDriveIcon className="mx-auto h-8 w-8 text-hazard mb-2" aria-hidden />
          <p className="font-mono text-xs text-hazard font-bold">AUTHENTICATION_REQUIRED</p>
          <p className="mt-1 font-mono text-3xs text-dimmer">
            Log in with your operator credentials to access your secure Cloud Storage node.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="myFilesSection" className="flex min-h-0 flex-1 flex-col border border-line bg-surface">
      {/* Header bar */}
      <PanelHead
        label="MY_FILES // CLOUD_STORAGE"
        tone="nexus"
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-3xs text-dimmer hidden sm:inline">
              NODE: user_uploads/{effectiveUid.slice(0, 8)}…
            </span>
            <Pill className="border-nexus/40 bg-nexus/10 text-nexus">
              {files.length} {files.length === 1 ? 'FILE' : 'FILES'} · {formatBytes(totalBytes)}
            </Pill>
          </div>
        }
      />

      {/* Toolbar: Search, Folder Management, and Add File */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search bar */}
          <div className="flex items-center gap-1.5 border border-line bg-void px-2">
            <SearchIcon className="h-3 w-3 text-dimmer" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter files by name, type…"
              aria-label="Filter user files"
              className={`bg-transparent py-1 font-mono text-2xs text-ink outline-none placeholder:text-dimmer ${
                tablet ? 'w-32' : 'w-48'
              }`}
            />
          </div>

          {/* Folder Filter Selection */}
          <div className="flex items-center gap-1">
            <FolderIcon className="h-3 w-3 text-dimmer" aria-hidden />
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              aria-label="Filter by folder"
              className="border border-line bg-void px-1.5 py-1 font-mono text-3xs text-ink outline-none"
            >
              <option value="ALL">ALL FOLDERS</option>
              <option value="ROOT">ROOT / DEFAULT</option>
              {customFolders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* New Folder Action */}
          <button
            type="button"
            onClick={() => setShowFolderModal(true)}
            title="Create a new folder"
            className="flex items-center gap-1 border border-line px-2 py-1 font-mono text-3xs text-dim hover:border-nexus hover:text-nexus"
          >
            <FolderPlusIcon className="h-3 w-3" />
            <span className="hidden sm:inline">+ FOLDER</span>
          </button>

          {/* Delete Active Folder (if custom folder selected) */}
          {folderFilter !== 'ALL' && folderFilter !== 'ROOT' && (
            <button
              type="button"
              onClick={() => handleDeleteFolder(folderFilter)}
              title={`Delete folder ${folderFilter}`}
              className="flex items-center gap-1 border border-line px-2 py-1 font-mono text-3xs text-hazard hover:border-hazard hover:bg-hazard/10"
            >
              <Trash2Icon className="h-3 w-3" />
              <span>DELETE FOLDER</span>
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <TermButton
            tone="nexus"
            onClick={() => setShowNoteModal(true)}
            className="flex items-center gap-1 border-nexus bg-nexus/15 px-3 py-1 font-bold text-nexus text-glow-nexus hover:bg-nexus hover:text-void"
          >
            <PlusIcon className="h-3 w-3" aria-hidden />
            + CREATE NOTE
          </TermButton>
          <TermButton
            tone="nexus"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1 px-3 py-1 font-bold text-nexus text-glow-nexus"
          >
            <UploadIcon className="h-3 w-3" aria-hidden />
            UPLOAD FILE
          </TermButton>
        </div>
      </div>

      {/* Table & Content */}
      <div className="term-scroll min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 font-mono text-2xs text-dim">
            <Loader2Icon className="h-5 w-5 animate-spin text-nexus" aria-hidden />
            <span>SYNCING STORAGE CLUSTER WITH FIRESTORE…</span>
          </div>
        ) : error ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-center font-mono text-2xs text-hazard">
            <p className="font-bold">STORAGE_SYNC_ERROR</p>
            <p className="text-3xs text-dim">{error}</p>
            <TermButton tone="hazard" onClick={() => window.location.reload()} className="mt-2">
              RETRY SYNC
            </TermButton>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-dashed border-line bg-void">
              <FileIcon className="h-6 w-6 text-dimmer" aria-hidden />
            </div>
            <div>
              <p className="font-mono text-2xs font-bold text-ink">
                {query ? 'NO MATCHING FILES FOUND' : 'NO FILES UPLOADED YET'}
              </p>
              <p className="mt-1 font-mono text-3xs text-dimmer">
                {query
                  ? 'Try clearing the search filter or folder selection.'
                  : 'Transmit payloads directly to your personal cloud repository with the "Add File" button.'}
              </p>
            </div>
            {!query && (
              <TermButton tone="nexus" onClick={() => setShowUploadModal(true)} className="flex items-center gap-1.5">
                <UploadIcon className="h-3 w-3" aria-hidden />
                UPLOAD YOUR FIRST FILE
              </TermButton>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse font-mono">
            <thead className="sticky top-0 z-10 bg-surface2 text-3xs font-bold text-dimmer">
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left">FILE NAME</th>
                <th className="px-3 py-2 text-left hidden sm:table-cell">DIRECTORY</th>
                <th className="px-3 py-2 text-left">SIZE</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">MODIFIED</th>
                <th className="px-3 py-2 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-2xs">
              {filteredFiles.map((file) => (
                <tr key={file.id} className="hover:bg-nexus/[0.04] transition-colors group">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setDetailModal({ isOpen: true, file, mode: 'VIEW' })}
                      className="flex items-center gap-2 text-left w-full group/name"
                    >
                      <div className="shrink-0">{getFileIcon(file.type, file.name)}</div>
                      <span className="font-bold text-ink truncate max-w-xs group-hover/name:text-nexus transition-colors">
                        {file.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-dim text-3xs hidden sm:table-cell">
                    <span className="border border-line bg-void px-1.5 py-0.5">
                      {file.folderId || 'ROOT'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-dimmer text-3xs tabular-nums">
                    {formatBytes(file.size)}
                  </td>
                  <td className="px-3 py-2 text-dimmer text-3xs hidden md:table-cell">
                    {renderDate(file)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ isOpen: true, file, mode: 'VIEW' })}
                        title="View file payload and preview"
                        className="flex h-6 w-6 items-center justify-center border border-line bg-surface text-dim hover:border-nexus hover:text-nexus"
                      >
                        <EyeIcon className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailModal({ isOpen: true, file, mode: 'EDIT' })}
                        title="Edit file details and content"
                        className="flex h-6 w-6 items-center justify-center border border-line bg-surface text-dim hover:border-nexus hover:text-nexus"
                      >
                        <Edit2Icon className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        title="Download file"
                        className="flex h-6 w-6 items-center justify-center border border-nexus/40 bg-nexus/10 text-nexus hover:border-nexus hover:bg-nexus/20"
                      >
                        <DownloadIcon className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(file)}
                        disabled={deletingId === file.id}
                        title="Delete file"
                        className="flex h-6 w-6 items-center justify-center border border-line text-dim hover:border-hazard hover:text-hazard disabled:opacity-50"
                      >
                        {deletingId === file.id ? (
                          <Loader2Icon className="h-3 w-3 animate-spin text-hazard" />
                        ) : (
                          <Trash2Icon className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm border border-line bg-surface p-4 font-mono shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-1.5 text-nexus font-bold text-xs">
                <FolderPlusIcon className="h-4 w-4" />
                <span>NEW FOLDER DIRECTORY</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="text-dim hover:text-hazard"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="mt-3 space-y-3">
              <div>
                <label className="text-3xs text-dimmer block mb-1">FOLDER NAME</label>
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. INVOICES, LOGS, PACKETS"
                  autoFocus
                  className="w-full border border-line bg-void px-2.5 py-1.5 font-mono text-2xs text-ink outline-none focus:border-nexus"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <TermButton type="button" onClick={() => setShowFolderModal(false)}>
                  CANCEL
                </TermButton>
                <TermButton tone="nexus" type="submit" disabled={!newFolderName.trim()}>
                  CREATE FOLDER
                </TermButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload File Modal */}
      {showUploadModal && (
        <UploadFileModal
          onClose={() => setShowUploadModal(false)}
          defaultFolder={folderFilter === 'ALL' ? 'ROOT' : folderFilter}
          onUploaded={() => {
            setShowUploadModal(false)
          }}
        />
      )}

      {/* Create Note Modal */}
      {showNoteModal && (
        <CreateNoteModal
          initialFolder={folderFilter === 'ALL' ? 'ROOT' : folderFilter}
          availableFolders={customFolders}
          onClose={() => setShowNoteModal(false)}
          onSuccess={(createdNote) => {
            setShowNoteModal(false)
            if (createdNote) {
              setFiles((prev) => {
                const filtered = prev.filter((f) => f.id !== createdNote.id)
                return [createdNote, ...filtered]
              })
            }
          }}
        />
      )}

      {/* View & Edit File Detail Modal */}
      {detailModal.isOpen && detailModal.file && (
        <FileDetailModal
          file={detailModal.file}
          initialMode={detailModal.mode}
          availableFolders={customFolders}
          onClose={() => setDetailModal({ isOpen: false, file: null, mode: 'VIEW' })}
          onDelete={(f) => {
            handleDelete(f)
            setDetailModal({ isOpen: false, file: null, mode: 'VIEW' })
          }}
          onUpdated={(updated) => {
            setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
            setDetailModal((prev) => ({ ...prev, file: updated }))
          }}
        />
      )}
    </section>
  )
}
