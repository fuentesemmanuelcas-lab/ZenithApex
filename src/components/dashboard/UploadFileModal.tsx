import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  ImageIcon,
  Loader2Icon,
  UploadCloudIcon,
  XIcon,
} from 'lucide-react'
import { auth } from '../../lib/firebase'
import { loadSession } from '../../utils/authStore'
import { uploadUserFile } from '../../services/fileService'
import { addUserFolder, getStoredFolders } from '../../services/folderService'
import { formatBytes } from '../../utils/format'
import { useZenith } from '../../contexts/ZenithContext'
import { Field, TermButton, inputCls } from '../ui/Primitives'
import type { UserFile } from '../../types/zenith'

export function getFileIcon(type?: string, name?: string) {
  const mime = (type || '').toLowerCase()
  const ext = (name || '').split('.').pop()?.toLowerCase()

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) {
    return <ImageIcon className="h-4 w-4 text-nexus" aria-hidden />
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['csv', 'xlsx', 'xls'].includes(ext || '')
  ) {
    return <FileSpreadsheetIcon className="h-4 w-4 text-caution" aria-hidden />
  }
  if (
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('html') ||
    ['json', 'ts', 'tsx', 'js', 'py', 'sh'].includes(ext || '')
  ) {
    return <FileCodeIcon className="h-4 w-4 text-hazard" aria-hidden />
  }
  if (
    mime.includes('pdf') ||
    mime.includes('text') ||
    ['pdf', 'txt', 'md', 'doc', 'docx'].includes(ext || '')
  ) {
    return <FileTextIcon className="h-4 w-4 text-ink" aria-hidden />
  }
  return <FileIcon className="h-4 w-4 text-dim" aria-hidden />
}

export function UploadFileModal({
  onClose,
  onUploaded,
  defaultFolder = 'ROOT',
}: {
  onClose: () => void
  onUploaded?: (file: UserFile) => void
  defaultFolder?: string
}) {
  const { pushLog, pushToast, addUserFile } = useZenith()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [folderId, setFolderId] = useState<string>(defaultFolder)
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const [newFolderName, setNewFolderName] = useState<string>('')
  const [showCreateFolder, setShowCreateFolder] = useState<boolean>(false)
  const [uploading, setUploading] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState<boolean>(false)
  const [completed, setCompleted] = useState<boolean>(false)

  const activeUid = auth.currentUser?.uid || loadSession()?.uid || null

  useEffect(() => {
    if (activeUid) {
      setCustomFolders(getStoredFolders(activeUid))
    }
  }, [activeUid])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    setError(null)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleAddFolderInline = async () => {
    if (!activeUid || !newFolderName.trim()) return
    const updated = await addUserFolder(activeUid, newFolderName)
    setCustomFolders(updated)
    setFolderId(newFolderName.trim().toUpperCase())
    setNewFolderName('')
    setShowCreateFolder(false)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (uploading || !selectedFile) return

    if (!activeUid) {
      setError('ACCESS_DENIED: You must be logged in to upload files.')
      return
    }

    setError(null)
    setUploading(true)
    setProgress(0)

    try {
      pushLog('STORAGE', `transmitting ${selectedFile.name} (${formatBytes(selectedFile.size)})`, 'dim')

      const uploadedFile = await uploadUserFile({
        file: selectedFile,
        uid: activeUid,
        folderId: folderId === 'ROOT' ? undefined : folderId,
        onProgress: (p) => setProgress(p),
      })

      setCompleted(true)
      addUserFile(uploadedFile)
      pushLog('STORAGE', `stored packet ${uploadedFile.name} successfully`, 'nexus')
      pushToast({
        title: 'FILE_TRANSMITTED',
        body: `${uploadedFile.name} (${formatBytes(uploadedFile.size)}) stored to Cloud Storage`,
        tone: 'nexus',
      })

      onUploaded?.(uploadedFile)
    } catch (err: any) {
      console.error('File upload failure:', err)
      const msg = err?.message || 'Failed to complete cloud transmission'
      setError(`TRANSMISSION_ERROR: ${msg}`)
      pushLog('STORAGE', `transmission error: ${msg}`, 'hazard')
      setUploading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="uploadModalTitle"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="corner-bracket w-full max-w-lg border border-line bg-surface p-5 shadow-2xl font-mono text-2xs animate-[slideIn_180ms_ease-out]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <UploadCloudIcon className="h-4 w-4 text-nexus" aria-hidden />
            <h2 id="uploadModalTitle" className="font-mono text-xs font-bold tracking-wider text-ink">
              TRANSMIT PAYLOAD // CLOUD_STORAGE
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="border border-line p-1 text-dim hover:border-hazard hover:text-hazard transition-colors disabled:opacity-50"
            aria-label="Close upload modal"
          >
            <XIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 border border-hazard/60 bg-hazard/10 p-2.5 text-3xs text-hazard"
          >
            <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-0.5">
              <p className="font-bold">PAYLOAD_TRANSMISSION_REJECTED</p>
              <p className="opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          {/* File Picker Drag/Drop Zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
              aria-label="Choose file to upload"
            />

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-150 ease-out ${
                isDragOver
                  ? 'border-nexus bg-nexus/15 text-nexus scale-[0.99]'
                  : selectedFile
                    ? 'border-nexus/60 bg-surface2 text-ink'
                    : 'border-line hover:border-nexus/50 hover:bg-surface2/60 text-dim'
              } ${uploading ? 'cursor-not-allowed opacity-75' : ''}`}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center h-10 w-10 border border-nexus/40 bg-void">
                    {getFileIcon(selectedFile.type, selectedFile.name)}
                  </div>
                  <div className="max-w-xs text-center">
                    <p className="truncate font-mono text-xs font-semibold text-ink">{selectedFile.name}</p>
                    <p className="mt-0.5 font-mono text-3xs text-dimmer">
                      {formatBytes(selectedFile.size)} · {selectedFile.type || 'application/octet-stream'}
                    </p>
                  </div>
                  {!uploading && (
                    <span className="font-mono text-3xs text-nexus underline underline-offset-2 mt-1">
                      CLICK TO CHANGE FILE
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <UploadCloudIcon className="h-8 w-8 text-dimmer" aria-hidden />
                  <p className="font-mono text-2xs text-ink font-medium">CHOOSE FILE TO TRANSMIT</p>
                  <p className="font-mono text-3xs text-dimmer">
                    Supports any document, data payload, image, or archive
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Folder selection */}
          <Field label="DIRECTORY / FOLDER">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <select
                    value={folderId}
                    disabled={uploading}
                    onChange={(e) => setFolderId(e.target.value)}
                    className={`${inputCls} pl-7`}
                  >
                    <option value="ROOT" className="bg-void text-ink">ROOT / DEFAULT</option>
                    {customFolders.map((f) => (
                      <option key={f} value={f} className="bg-void text-ink">
                        {f}
                      </option>
                    ))}
                  </select>
                  <FolderIcon className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-dim" aria-hidden />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(!showCreateFolder)}
                  title="Create new folder"
                  className="flex items-center gap-1 border border-line px-2 py-1 text-3xs text-dim hover:border-nexus hover:text-nexus"
                >
                  <FolderPlusIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">+ FOLDER</span>
                </button>
              </div>

              {showCreateFolder && (
                <div className="flex items-center gap-1.5 border border-nexus/40 bg-void p-1.5">
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Enter folder name…"
                    className="flex-1 bg-transparent px-2 py-0.5 font-mono text-3xs text-ink outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleAddFolderInline()
                      }
                    }}
                  />
                  <TermButton
                    type="button"
                    tone="nexus"
                    onClick={() => void handleAddFolderInline()}
                    className="py-0.5 px-2 text-3xs"
                  >
                    CREATE
                  </TermButton>
                </div>
              )}
            </div>
          </Field>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-1 border border-nexus/30 bg-void p-2.5">
              <div className="flex items-center justify-between font-mono text-3xs">
                <span className="flex items-center gap-1.5 text-nexus">
                  <Loader2Icon className="h-3 w-3 animate-spin" aria-hidden />
                  TRANSMITTING TO STORAGE CLUSTER…
                </span>
                <span className="font-bold tabular-nums text-nexus">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden bg-line">
                <div
                  className="h-full bg-nexus transition-[width] duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="font-mono text-3xs text-dimmer truncate">
                DESTINATION: user_uploads/{auth.currentUser?.uid || 'user'}/{selectedFile?.name}
              </p>
            </div>
          )}

          {/* Success indicator */}
          {completed && (
            <div className="flex items-center gap-2 border border-nexus/40 bg-nexus/10 p-2 text-3xs text-nexus">
              <CheckCircle2Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>PAYLOAD COMMITTED TO CLUSTER. CLOSING WORKSPACE…</span>
            </div>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <TermButton
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="py-1 px-3"
            >
              CANCEL
            </TermButton>
            <TermButton
              type="submit"
              tone="nexus"
              disabled={!selectedFile || uploading || completed}
              className="flex items-center gap-1 py-1 px-4 font-bold text-nexus text-glow-nexus"
            >
              {uploading ? (
                <>
                  <Loader2Icon className="h-3 w-3 animate-spin" aria-hidden />
                  TRANSMITTING…
                </>
              ) : (
                <>
                  <UploadCloudIcon className="h-3 w-3" aria-hidden />
                  START UPLOAD
                </>
              )}
            </TermButton>
          </div>
        </form>
      </div>
    </div>
  )
}
