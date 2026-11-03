import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  HardDriveIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import {
  createDriveFolder,
  deleteDriveFilePermanently,
  ensureWorkspaceAccessToken,
  listDriveFiles,
  trashDriveFile,
  uploadDriveFile,
  type GoogleDriveFile,
} from '../../services/googleWorkspace'
import { useZenith } from '../../contexts/ZenithContext'
import { getCachedAccessToken, loadSession, setCachedAccessToken, signInWithGooglePopup } from '../../utils/authStore'
import { formatBytes, relTime } from '../../utils/format'
import { PanelHead, Pill, TermButton } from '../ui/Primitives'
import { GoogleDocViewerModal } from './GoogleDocViewerModal'

type FileFilter = 'ALL' | 'FOLDERS' | 'SPREADSHEETS' | 'DOCS' | 'IMAGES' | 'PDFS'

export function GoogleDriveView() {
  const { pushLog, pushToast, device } = useZenith()
  const [files, setFiles] = useState<GoogleDriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FileFilter>('ALL')
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null)
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null)
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([])
  const [needsAuth, setNeedsAuth] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // In-app Document Viewer Modal
  const [docViewerTarget, setDocViewerTarget] = useState<GoogleDriveFile | null>(null)

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Confirmation Modal state for destructive operations (MANDATORY)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<GoogleDriveFile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const tablet = device === 'T'
  const session = loadSession()

  const loadFiles = async (folderId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const token = getCachedAccessToken()
      if (!token) {
        setNeedsAuth(true)
        setLoading(false)
        return
      }
      setNeedsAuth(false)
      const res = await listDriveFiles({
        folderId: folderId || currentFolder?.id,
        query: searchQuery.trim() || undefined,
        pageSize: 60,
      })
      setFiles(res.files || [])
      if (res.files.length > 0 && !selectedFile) {
        setSelectedFile(res.files[0])
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to fetch Google Drive files'
      if (
        msg.includes('401') ||
        msg.includes('403') ||
        msg.toLowerCase().includes('insufficient') ||
        msg.toLowerCase().includes('scope') ||
        msg.includes('Authentication required') ||
        msg.includes('invalid_token')
      ) {
        setCachedAccessToken(null)
        setNeedsAuth(true)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFiles()
  }, [currentFolder])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      const res = await signInWithGooglePopup([
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.readonly',
      ])
      if (res.success) {
        setNeedsAuth(false)
        pushToast({
          title: 'GOOGLE DRIVE CONNECTED',
          body: `Access granted for ${res.session?.email || 'Google Account'}`,
          tone: 'nexus',
        })
        pushLog('DRIVE', `authenticated Google Drive session (${res.session?.email})`, 'nexus')
        await loadFiles()
      } else {
        setError(res.error || 'Could not connect to Google Drive')
      }
    } catch (err) {
      setError((err as Error)?.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleOpenFolder = (folder: GoogleDriveFile) => {
    if (folder.mimeType === 'application/vnd.google-apps.folder') {
      const next = { id: folder.id, name: folder.name }
      if (currentFolder) {
        setFolderHistory((prev) => [...prev, currentFolder])
      }
      setCurrentFolder(next)
      setSelectedFile(null)
    }
  }

  const handleGoBack = (targetIndex?: number) => {
    if (targetIndex === undefined) {
      // Go up one level
      if (folderHistory.length > 0) {
        const last = folderHistory[folderHistory.length - 1]
        setFolderHistory((prev) => prev.slice(0, -1))
        setCurrentFolder(last)
      } else {
        setCurrentFolder(null)
      }
    } else if (targetIndex === -1) {
      // Root
      setFolderHistory([])
      setCurrentFolder(null)
    } else {
      const target = folderHistory[targetIndex]
      setFolderHistory((prev) => prev.slice(0, targetIndex))
      setCurrentFolder(target)
    }
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    setLoading(true)
    try {
      const created = await createDriveFolder(newFolderName.trim(), currentFolder?.id)
      pushToast({
        title: 'FOLDER CREATED',
        body: `Created "${created.name}" in Google Drive`,
        tone: 'nexus',
      })
      pushLog('DRIVE', `created folder "${created.name}" [${created.id}]`, 'nexus')
      setNewFolderName('')
      setShowFolderModal(false)
      await loadFiles()
    } catch (err) {
      setError((err as Error)?.message || 'Failed to create folder')
    } finally {
      setLoading(false)
    }
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)
    try {
      const uploaded = await uploadDriveFile(uploadFile, currentFolder?.id)
      pushToast({
        title: 'FILE TRANSMITTED',
        body: `Uploaded "${uploaded.name}" to Google Drive`,
        tone: 'nexus',
      })
      pushLog('DRIVE', `uploaded file "${uploaded.name}" (${uploaded.size || 'unknown size'})`, 'nexus')
      setUploadFile(null)
      setShowUploadModal(false)
      await loadFiles()
    } catch (err) {
      setError((err as Error)?.message || 'Failed to upload file to Google Drive')
    } finally {
      setUploading(false)
    }
  }

  const executeDelete = async () => {
    if (!deleteConfirmTarget) return
    setDeleting(true)
    try {
      await trashDriveFile(deleteConfirmTarget.id)
      pushToast({
        title: 'FILE TRASHED',
        body: `Moved "${deleteConfirmTarget.name}" to Google Drive Trash`,
        tone: 'caution',
      })
      pushLog('DRIVE', `trashed file ${deleteConfirmTarget.id} (${deleteConfirmTarget.name})`, 'caution')
      setDeleteConfirmTarget(null)
      if (selectedFile?.id === deleteConfirmTarget.id) {
        setSelectedFile(null)
      }
      await loadFiles()
    } catch (err) {
      setError((err as Error)?.message || 'Failed to delete file from Google Drive')
    } finally {
      setDeleting(false)
    }
  }

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      if (filter === 'FOLDERS') return f.mimeType === 'application/vnd.google-apps.folder'
      if (filter === 'SPREADSHEETS') return f.mimeType.includes('spreadsheet') || f.mimeType.includes('sheet')
      if (filter === 'DOCS') return f.mimeType.includes('document') || f.mimeType.includes('text')
      if (filter === 'IMAGES') return f.mimeType.startsWith('image/')
      if (filter === 'PDFS') return f.mimeType.includes('pdf')
      return true
    })
  }, [files, filter])

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') return FolderIcon
    if (mimeType.includes('spreadsheet') || mimeType.includes('sheet')) return FileSpreadsheetIcon
    if (mimeType.includes('document') || mimeType.includes('text')) return FileTextIcon
    if (mimeType.startsWith('image/')) return ImageIcon
    if (mimeType.includes('json') || mimeType.includes('code') || mimeType.includes('javascript'))
      return FileCodeIcon
    return FileIcon
  }

  if (needsAuth) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-void text-ink">
        <header className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
          <div className="flex items-center gap-2">
            <HardDriveIcon className="h-3.5 w-3.5 text-nexus" />
            <h1 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              GOOGLE_DRIVE // CLOUD_STORAGE
            </h1>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="corner-bracket max-w-md border border-line bg-surface p-6 text-center shadow-2xl">
            <HardDriveIcon className="mx-auto mb-4 h-12 w-12 text-nexus" />
            <h2 className="font-mono text-sm font-bold tracking-widest text-ink">
              CONNECT GOOGLE DRIVE
            </h2>
            <p className="mt-2 font-mono text-2xs leading-relaxed text-dim">
              Link your Google Account to browse, upload, organize, and sync files directly through the Zenith Apex OS terminal.
            </p>
            <div className="mt-3 border border-nexus/30 bg-nexus/5 p-2 font-mono text-3xs text-dim text-left">
              <span className="font-bold text-nexus">NOTICE:</span> In testing mode, sign in with your developer account <strong className="text-ink">fuentes.emmanuel.cas@gmail.com</strong>. Accounts outside the developer tester list will receive Google Error 403 access_denied.
            </div>
            {error && (
              <div className="mt-3 border border-hazard/40 bg-hazard/10 p-2 font-mono text-3xs text-hazard">
                {error}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center justify-center gap-2 border border-nexus bg-nexus/15 px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-nexus transition-all hover:bg-nexus hover:text-void disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <HardDriveIcon className="h-4 w-4" />
                )}
                {connecting ? 'AUTHENTICATING OAUTH…' : 'AUTHORIZE GOOGLE DRIVE'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-void text-ink">
      {/* Top Header */}
      <header className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <HardDriveIcon className="h-3.5 w-3.5 text-nexus" />
            <h1 className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              GOOGLE_DRIVE
            </h1>
          </div>
          <Pill className="border-nexus/40 bg-nexus/10 text-nexus">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexus" />
            DRIVE_V3_LIVE
          </Pill>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void loadFiles()
            }}
            className="flex items-center gap-1 border border-line bg-void px-2 py-0.5"
          >
            <SearchIcon className="h-3 w-3 text-dimmer" />
            <input
              type="text"
              placeholder="Search Google Drive…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 bg-transparent font-mono text-3xs text-ink outline-none placeholder:text-dimmer"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  void loadFiles()
                }}
                className="text-dimmer hover:text-ink"
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            )}
          </form>

          {/* Action Buttons */}
          <TermButton
            onClick={() => setShowFolderModal(true)}
            className="flex items-center gap-1 text-3xs"
          >
            <FolderPlusIcon className="h-3 w-3" />
            NEW FOLDER
          </TermButton>

          <TermButton
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1 text-3xs border-nexus text-nexus hover:bg-nexus hover:text-void"
          >
            <UploadIcon className="h-3 w-3" />
            UPLOAD FILE
          </TermButton>

          <button
            type="button"
            onClick={() => void loadFiles()}
            disabled={loading}
            title="Refresh Google Drive"
            className="flex h-6 w-6 items-center justify-center border border-line bg-void text-dim hover:text-nexus"
          >
            <RefreshCwIcon className={`h-3 w-3 ${loading ? 'animate-spin text-nexus' : ''}`} />
          </button>
        </div>
      </header>

      {/* Breadcrumb & Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/50 px-3 py-1 text-3xs font-mono">
        <div className="flex items-center gap-1.5 text-dim">
          <button
            type="button"
            onClick={() => handleGoBack(-1)}
            className={`hover:text-nexus ${!currentFolder ? 'font-bold text-nexus' : ''}`}
          >
            MY_DRIVE
          </button>
          {folderHistory.map((f, i) => (
            <React.Fragment key={f.id}>
              <span>/</span>
              <button
                type="button"
                onClick={() => handleGoBack(i)}
                className="hover:text-nexus"
              >
                {f.name}
              </button>
            </React.Fragment>
          ))}
          {currentFolder && (
            <>
              <span>/</span>
              <span className="font-bold text-nexus">{currentFolder.name}</span>
            </>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1">
          {(['ALL', 'FOLDERS', 'SPREADSHEETS', 'DOCS', 'IMAGES', 'PDFS'] as FileFilter[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`border px-1.5 py-0.5 tracking-wider transition-colors ${
                  filter === f
                    ? 'border-nexus/60 bg-nexus/15 text-nexus font-bold'
                    : 'border-line text-dimmer hover:text-ink'
                }`}
              >
                {f}
              </button>
            ),
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between border-b border-hazard/40 bg-hazard/10 px-3 py-1.5 font-mono text-3xs text-hazard">
          <div className="flex items-center gap-1.5">
            <AlertTriangleIcon className="h-3 w-3" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-hazard hover:underline"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Main Grid: File Explorer + File Inspector */}
      <div className={`grid min-h-0 flex-1 ${tablet ? 'grid-cols-1' : 'grid-cols-[1fr_320px]'}`}>
        {/* Left: Files Explorer List */}
        <div className="term-scroll min-h-0 flex-1 overflow-y-auto border-r border-line p-3">
          {loading && files.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 font-mono text-3xs text-dim">
              <Loader2Icon className="h-6 w-6 animate-spin text-nexus" />
              <span>SYNCING GOOGLE DRIVE INDEX…</span>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 font-mono text-3xs text-dimmer">
              <HardDriveIcon className="h-8 w-8 text-line" />
              <span className="font-bold text-dim">NO FILES FOUND</span>
              <p className="text-3xs">
                {searchQuery
                  ? 'No matching files found for this query.'
                  : 'This folder is empty. Upload files or create folders.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
              {filteredFiles.map((file) => {
                const Icon = getFileIcon(file.mimeType)
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
                const isSelected = selectedFile?.id === file.id
                const isSheet =
                  file.mimeType.includes('spreadsheet') || file.mimeType.includes('sheet')

                return (
                  <div
                    key={file.id}
                    onClick={() => setSelectedFile(file)}
                    onDoubleClick={() => (isFolder ? handleOpenFolder(file) : setDocViewerTarget(file))}
                    className={`group relative flex cursor-pointer flex-col justify-between border p-2.5 transition-all ${
                      isSelected
                        ? 'border-nexus bg-nexus/10 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                        : 'border-line bg-surface hover:border-nexus/40 hover:bg-surface2'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center border ${
                          isFolder
                            ? 'border-caution/50 bg-caution/10 text-caution'
                            : isSheet
                              ? 'border-nexus/50 bg-nexus/10 text-nexus'
                              : 'border-line bg-void text-dim'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-mono text-2xs font-semibold text-ink group-hover:text-nexus"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <p className="truncate font-mono text-3xs text-dimmer">
                          {isFolder
                            ? 'FOLDER'
                            : file.size
                              ? formatBytes(Number(file.size))
                              : 'CLOUD DOC'}
                          {file.modifiedTime && ` · ${relTime(file.modifiedTime)}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-line/40 pt-1.5 font-mono text-3xs">
                      {isFolder ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenFolder(file)
                          }}
                          className="text-nexus hover:underline"
                        >
                          OPEN FOLDER →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDocViewerTarget(file)
                          }}
                          className="flex items-center gap-1 font-bold text-nexus hover:underline"
                        >
                          <EyeIcon className="h-3 w-3" />
                          <span>VIEW / EDIT</span>
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Open in Google Workspace"
                            className="text-dim hover:text-nexus"
                          >
                            <ExternalLinkIcon className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirmTarget(file)
                          }}
                          title="Trash file"
                          className="text-dimmer hover:text-hazard"
                        >
                          <Trash2Icon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: File Details / Inspector */}
        <div className="flex min-h-0 flex-col bg-surface">
          <PanelHead
            label="FILE_INSPECTOR"
            right={
              selectedFile && (
                <span className="font-mono text-3xs text-dimmer">ID: {selectedFile.id.slice(0, 8)}…</span>
              )
            }
          />

          {selectedFile ? (
            <div className="term-scroll flex-1 overflow-y-auto p-3 space-y-3 font-mono text-2xs">
              <div className="border border-line bg-void p-3">
                <div className="flex items-center gap-2">
                  {React.createElement(getFileIcon(selectedFile.mimeType), {
                    className: 'h-5 w-5 text-nexus',
                  })}
                  <h3 className="truncate text-xs font-bold text-ink" title={selectedFile.name}>
                    {selectedFile.name}
                  </h3>
                </div>

                <dl className="mt-3 space-y-1.5 text-3xs border-t border-line pt-2">
                  <div className="flex justify-between">
                    <dt className="text-dimmer">MIME_TYPE:</dt>
                    <dd className="truncate text-dim max-w-[170px]" title={selectedFile.mimeType}>
                      {selectedFile.mimeType}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-dimmer">FILE_SIZE:</dt>
                    <dd className="text-ink">
                      {selectedFile.size ? formatBytes(Number(selectedFile.size)) : 'GOOGLE WORKSPACE CLOUD'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-dimmer">MODIFIED:</dt>
                    <dd className="text-dim">
                      {selectedFile.modifiedTime ? relTime(selectedFile.modifiedTime) : 'N/A'}
                    </dd>
                  </div>
                  {selectedFile.owners?.[0] && (
                    <div className="flex justify-between">
                      <dt className="text-dimmer">OWNER:</dt>
                      <dd className="text-nexus truncate max-w-[160px]">
                        {selectedFile.owners[0].displayName || selectedFile.owners[0].emailAddress}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Actions */}
              <div className="space-y-1.5">
                {selectedFile.mimeType !== 'application/vnd.google-apps.folder' && (
                  <button
                    type="button"
                    onClick={() => setDocViewerTarget(selectedFile)}
                    className="flex w-full items-center justify-center gap-1.5 border border-nexus bg-nexus/15 py-2 font-mono text-3xs font-bold tracking-wider text-nexus transition-all hover:bg-nexus hover:text-void shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    VIEW / EDIT IN APP (NATIVE)
                  </button>
                )}

                {selectedFile.webViewLink && (
                  <a
                    href={selectedFile.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 border border-line bg-void py-1.5 font-mono text-3xs font-bold tracking-wider text-ink transition-all hover:border-nexus hover:text-nexus"
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    OPEN IN GOOGLE WORKSPACE
                  </a>
                )}

                {selectedFile.mimeType === 'application/vnd.google-apps.folder' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenFolder(selectedFile)}
                    className="flex w-full items-center justify-center gap-1.5 border border-line bg-void py-2 font-mono text-3xs text-ink hover:border-nexus hover:text-nexus"
                  >
                    <FolderIcon className="h-3.5 w-3.5" />
                    NAVIGATE INTO FOLDER
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedFile.webViewLink) {
                        navigator.clipboard.writeText(selectedFile.webViewLink)
                        pushToast({
                          title: 'LINK COPIED',
                          body: 'Google Drive file link copied to clipboard',
                          tone: 'nexus',
                        })
                      }
                    }}
                    className="flex w-full items-center justify-center gap-1.5 border border-line bg-void py-2 font-mono text-3xs text-dim hover:text-ink"
                  >
                    COPY DRIVE LINK
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDeleteConfirmTarget(selectedFile)}
                  className="flex w-full items-center justify-center gap-1.5 border border-hazard/40 bg-hazard/10 py-1.5 font-mono text-3xs text-hazard hover:bg-hazard hover:text-void"
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                  MOVE TO TRASH
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center font-mono text-2xs text-dimmer">
              Select a file or folder from Google Drive to inspect properties and metadata.
            </div>
          )}
        </div>
      </div>

      {/* NEW FOLDER MODAL */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4">
          <div className="corner-bracket w-full max-w-sm border border-line bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-2 font-mono text-xs font-bold text-nexus">
              <span>CREATE DRIVE FOLDER</span>
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="text-dimmer hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="mt-4 space-y-3 font-mono text-2xs">
              <div>
                <label className="block text-3xs text-dimmer mb-1">FOLDER NAME</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g., Client Portfolios, Logistics 2026…"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full border border-line bg-void px-2.5 py-1.5 text-ink outline-none focus:border-nexus"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="border border-line px-3 py-1 text-dim hover:text-ink"
                >
                  CANCEL
                </button>
                <TermButton type="submit" disabled={loading || !newFolderName.trim()}>
                  {loading ? 'CREATING…' : 'CREATE FOLDER'}
                </TermButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD FILE MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4">
          <div className="corner-bracket w-full max-w-md border border-line bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-2 font-mono text-xs font-bold text-nexus">
              <span>UPLOAD TO GOOGLE DRIVE</span>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-dimmer hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-3 font-mono text-2xs">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-line bg-void p-6 text-center transition-colors hover:border-nexus"
              >
                <UploadIcon className="mb-2 h-8 w-8 text-nexus" />
                <p className="font-bold text-ink">
                  {uploadFile ? uploadFile.name : 'Choose a file or drop here'}
                </p>
                <p className="text-3xs text-dimmer mt-1">
                  {uploadFile
                    ? `${formatBytes(uploadFile.size)} · ${uploadFile.type || 'file'}`
                    : 'Documents, Sheets, CSV, Images, Logs'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setUploadFile(e.target.files[0])
                    }
                  }}
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="border border-line px-3 py-1 text-dim hover:text-ink"
                >
                  CANCEL
                </button>
                <TermButton type="submit" disabled={uploading || !uploadFile}>
                  {uploading ? 'TRANSMITTING…' : 'START UPLOAD'}
                </TermButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP GOOGLE DOCUMENT / SHEET / SLIDE VIEWER MODAL */}
      {docViewerTarget && (
        <GoogleDocViewerModal
          fileId={docViewerTarget.id}
          title={docViewerTarget.name}
          mimeType={docViewerTarget.mimeType}
          webViewLink={docViewerTarget.webViewLink}
          onClose={() => setDocViewerTarget(null)}
        />
      )}

      {/* EXPLICIT CONFIRMATION MODAL FOR DESTRUCTIVE ACTION (MANDATORY PER WORKSPACE SKILL) */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 backdrop-blur-sm p-4">
          <div className="corner-bracket w-full max-w-sm border border-hazard bg-surface p-4 shadow-2xl">
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-hazard">
              <AlertTriangleIcon className="h-4 w-4" />
              <span>CONFIRM GOOGLE DRIVE REMOVAL</span>
            </div>
            <p className="mt-3 font-mono text-2xs leading-relaxed text-ink">
              Are you sure you want to move <span className="font-bold text-hazard">"{deleteConfirmTarget.name}"</span> to Google Drive Trash?
            </p>
            <p className="mt-1 font-mono text-3xs text-dimmer">
              ID: {deleteConfirmTarget.id}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-line/60 pt-3 font-mono text-2xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={deleting}
                className="border border-line px-3 py-1 text-dim hover:text-ink"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={deleting}
                className="border border-hazard bg-hazard px-3 py-1 font-bold text-void transition-colors hover:bg-hazard/80"
              >
                {deleting ? 'TRASHING…' : 'CONFIRM TRASH'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
