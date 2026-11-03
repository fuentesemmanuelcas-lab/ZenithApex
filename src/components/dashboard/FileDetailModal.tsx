import React, { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileCode,
  FileIcon,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { auth } from '../../lib/firebase'
import { loadSession } from '../../utils/authStore'
import {
  fetchUserFileText,
  triggerFileDownload,
  updateUserFileMetadata,
  updateUserTextFile,
} from '../../services/fileService'
import { formatBytes, relTime } from '../../utils/format'
import { useZenith } from '../../contexts/ZenithContext'
import { TermButton } from '../ui/Primitives'
import type { UserFile } from '../../types/zenith'

interface FileDetailModalProps {
  file: UserFile
  initialMode?: 'VIEW' | 'EDIT'
  availableFolders?: string[]
  onClose: () => void
  onDelete?: (file: UserFile) => void
  onUpdated?: (updatedFile: UserFile) => void
}

function isTextFile(file: UserFile): boolean {
  if (file.isNote || Boolean(file.content) || Boolean(file.extractedText)) return true
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  return (
    t.startsWith('text/') ||
    t.includes('json') ||
    t.includes('javascript') ||
    t.includes('typescript') ||
    t.includes('xml') ||
    t.includes('csv') ||
    n.endsWith('.txt') ||
    n.endsWith('.md') ||
    n.endsWith('.json') ||
    n.endsWith('.csv') ||
    n.endsWith('.log') ||
    n.endsWith('.js') ||
    n.endsWith('.ts') ||
    n.endsWith('.jsx') ||
    n.endsWith('.tsx') ||
    n.endsWith('.html') ||
    n.endsWith('.css') ||
    n.endsWith('.env')
  )
}

function isImageFile(file: UserFile): boolean {
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  return (
    t.startsWith('image/') ||
    n.endsWith('.png') ||
    n.endsWith('.jpg') ||
    n.endsWith('.jpeg') ||
    n.endsWith('.gif') ||
    n.endsWith('.webp') ||
    n.endsWith('.svg')
  )
}

function isPdfFile(file: UserFile): boolean {
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  return t.includes('pdf') || n.endsWith('.pdf')
}

function isWordDoc(file: UserFile): boolean {
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  return (
    t.includes('word') ||
    t.includes('officedocument.wordprocessingml') ||
    n.endsWith('.docx') ||
    n.endsWith('.doc')
  )
}

export function FileDetailModal({
  file,
  initialMode = 'VIEW',
  availableFolders = [],
  onClose,
  onDelete,
  onUpdated,
}: FileDetailModalProps) {
  const { pushToast, pushLog } = useZenith()
  const isText = isTextFile(file)
  const isImage = isImageFile(file)
  const isPdf = isPdfFile(file)
  const isWord = isWordDoc(file)
  const currentUser = auth.currentUser

  const initialText = file.content || file.extractedText || ''
  const [mode, setMode] = useState<'VIEW' | 'EDIT'>(initialMode)
  const [name, setName] = useState(file.name)
  const [folder, setFolder] = useState(file.folderId || 'ROOT')
  const [content, setContent] = useState<string>(initialText)
  const [initialContent, setInitialContent] = useState<string>(initialText)
  const [loadingContent, setLoadingContent] = useState(!initialText && isText && Boolean(file.downloadURL))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [pdfEngine, setPdfEngine] = useState<'NATIVE' | 'GOOGLE'>('NATIVE')
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedContent, setCopiedContent] = useState(false)

  // Fetch text content if text file and not yet cached
  useEffect(() => {
    setName(file.name)
    setFolder(file.folderId || 'ROOT')

    const currentText = file.content || file.extractedText || ''
    if (currentText) {
      setContent(currentText)
      setInitialContent(currentText)
      setLoadingContent(false)
      return
    }

    if (isText && (file.downloadURL || file.content)) {
      setLoadingContent(true)
      fetchUserFileText(file)
        .then((txt) => {
          setContent(txt)
          setInitialContent(txt)
        })
        .catch((err) => {
          console.error('Failed to load text content:', err)
          setError('Could not load text preview directly. You can still download the file.')
        })
        .finally(() => {
          setLoadingContent(false)
        })
    } else {
      setLoadingContent(false)
    }
  }, [file, isText])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const activeUid = auth.currentUser?.uid || loadSession()?.uid
    if (!activeUid) {
      setError('AUTHENTICATION_REQUIRED: User must be signed in.')
      return
    }

    const cleanName = name.trim()
    if (!cleanName) {
      setError('File name cannot be empty.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const targetFolder = folder === 'ROOT' || folder === 'ALL' ? null : folder

      if (isText) {
        // Update both file content and metadata
        const updated = await updateUserTextFile({
          uid: activeUid,
          file,
          newContent: content,
          newName: cleanName,
          newFolderId: targetFolder,
        })
        pushToast({
          title: 'FILE_UPDATED',
          body: `${cleanName} content and metadata successfully saved.`,
          tone: 'nexus',
        })
        pushLog('STORAGE', `updated text payload ${cleanName}`, 'nexus')
        onUpdated?.(updated)
        setMode('VIEW')
      } else {
        // Update metadata only
        await updateUserFileMetadata(activeUid, file.id, {
          name: cleanName,
          folderId: targetFolder,
        })
        const updated: UserFile = {
          ...file,
          name: cleanName,
          folderId: targetFolder,
        }
        pushToast({
          title: 'FILE_METADATA_SAVED',
          body: `${cleanName} directory and name updated.`,
          tone: 'nexus',
        })
        pushLog('STORAGE', `renamed/moved file to ${cleanName}`, 'nexus')
        onUpdated?.(updated)
        setMode('VIEW')
      }
    } catch (err: any) {
      console.error('Error updating file:', err)
      setError(err?.message || 'Failed to update file.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyDirectUrl = async () => {
    if (!file.downloadURL) return
    try {
      await navigator.clipboard.writeText(file.downloadURL)
      setCopiedLink(true)
      pushToast({
        title: 'PAYLOAD_URL_COPIED',
        body: 'Direct file access URL copied to clipboard.',
        tone: 'nexus',
      })
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleCopyContent = async () => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopiedContent(true)
      pushToast({
        title: 'NOTE_COPIED',
        body: 'Note content copied to clipboard.',
        tone: 'nexus',
      })
      setTimeout(() => setCopiedContent(false), 2000)
    } catch {
      // ignore
    }
  }

  const renderDate = (f: UserFile) => {
    if (!f.createdAt) return 'RECENT'
    if (typeof f.createdAt === 'object' && 'seconds' in f.createdAt) {
      return relTime(new Date(f.createdAt.seconds * 1000).toISOString())
    }
    if (typeof f.createdAt === 'string') {
      return relTime(f.createdAt)
    }
    return 'RECENT'
  }

  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(
    file.downloadURL || '',
  )}&embedded=true`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-detail-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-2 sm:p-4 backdrop-blur-sm"
    >
      <div
        className={`flex flex-col border border-nexus/50 bg-surface shadow-2xl shadow-nexus/15 animate-in fade-in zoom-in-95 duration-150 font-mono transition-all ${
          isMaximized
            ? 'h-[96vh] w-[96vw] max-w-none'
            : 'h-[88vh] max-h-[92vh] w-full max-w-5xl'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface2 px-4 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-nexus/40 bg-nexus/10 text-nexus">
              {isImage ? (
                <ImageIcon className="h-4 w-4" />
              ) : isText ? (
                <FileText className="h-4 w-4" />
              ) : isPdf ? (
                <FileCode className="h-4 w-4 text-nexus" />
              ) : isWord ? (
                <FileText className="h-4 w-4 text-nexus" />
              ) : (
                <FileIcon className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-2">
                <h2
                  id="file-detail-modal-title"
                  className="font-mono text-xs font-bold tracking-[0.15em] text-nexus text-glow-nexus truncate"
                >
                  {name}
                </h2>
                <span className="shrink-0 border border-line bg-void px-1.5 py-0.5 text-3xs text-dimmer">
                  {folder === 'ROOT' || !folder ? 'ROOT' : folder}
                </span>
              </div>
              <p className="font-mono text-3xs text-dimmer">
                {formatBytes(file.size)} · {file.type || 'application/octet-stream'} · {renderDate(file)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Direct Open in Tab */}
            {file.downloadURL && (
              <a
                href={file.downloadURL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1 border border-line bg-surface px-2.5 py-1 text-3xs font-bold text-dimmer hover:border-nexus hover:text-nexus"
                title="Open raw document in new browser window"
              >
                <ExternalLink className="h-3 w-3" />
                <span>NEW TAB</span>
              </a>
            )}

            {/* Mode switch */}
            {mode === 'VIEW' ? (
              <button
                type="button"
                onClick={() => setMode('EDIT')}
                className="flex items-center gap-1 border border-line bg-surface px-2.5 py-1 text-3xs font-bold text-ink hover:border-nexus hover:text-nexus"
                title="Edit file details or content"
              >
                <Edit2 className="h-3 w-3" />
                <span>EDIT</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode('VIEW')}
                className="flex items-center gap-1 border border-line bg-surface px-2.5 py-1 text-3xs font-bold text-dimmer hover:text-ink"
                title="Return to preview mode"
              >
                <Eye className="h-3 w-3" />
                <span>VIEW</span>
              </button>
            )}

            {/* Maximize / Restore */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="flex h-7 w-7 items-center justify-center border border-line bg-surface text-dim hover:text-nexus"
              title={isMaximized ? 'Restore normal view' : 'Maximize window'}
            >
              {isMaximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Download */}
            <button
              type="button"
              onClick={() => triggerFileDownload(file)}
              className="flex h-7 w-7 items-center justify-center border border-nexus/40 bg-nexus/10 text-nexus hover:bg-nexus/20"
              title="Download file"
            >
              <Download className="h-3.5 w-3.5" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center border border-line bg-surface text-dim hover:text-hazard"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="term-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {error && (
            <div className="border border-hazard/40 bg-hazard/10 p-2.5 text-2xs text-hazard">
              {error}
            </div>
          )}

          {mode === 'VIEW' ? (
            <div className="flex flex-col h-full space-y-3">
              {/* PDF Document Viewer */}
              {isPdf && (
                <div className="flex flex-col flex-1 min-h-[55vh] border border-nexus/30 bg-void">
                  {/* PDF Control Sub-bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-1.5 text-3xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-nexus flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        PDF_INLINE_VIEWER
                      </span>
                      <span className="text-dimmer hidden sm:inline">
                        ({formatBytes(file.size)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Engine Switcher */}
                      <span className="text-dimmer text-3xs">ENGINE:</span>
                      <button
                        type="button"
                        onClick={() => setPdfEngine('NATIVE')}
                        className={`px-2 py-0.5 text-3xs border transition-colors ${
                          pdfEngine === 'NATIVE'
                            ? 'border-nexus bg-nexus/20 text-nexus font-bold'
                            : 'border-line bg-surface text-dim hover:text-ink'
                        }`}
                        title="Native browser PDF engine"
                      >
                        NATIVE
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdfEngine('GOOGLE')}
                        className={`px-2 py-0.5 text-3xs border transition-colors ${
                          pdfEngine === 'GOOGLE'
                            ? 'border-nexus bg-nexus/20 text-nexus font-bold'
                            : 'border-line bg-surface text-dim hover:text-ink'
                        }`}
                        title="Google Docs Cloud PDF Renderer"
                      >
                        GOOGLE VIEWER
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyDirectUrl}
                        className="flex items-center gap-1 border border-line bg-surface px-2 py-0.5 text-3xs text-dim hover:text-nexus"
                        title="Copy direct file URL"
                      >
                        {copiedLink ? <Check className="h-3 w-3 text-nexus" /> : <Copy className="h-3 w-3" />}
                        <span className="hidden sm:inline">{copiedLink ? 'COPIED' : 'COPY LINK'}</span>
                      </button>

                      <a
                        href={file.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 border border-nexus/40 bg-nexus/10 px-2 py-0.5 text-3xs font-bold text-nexus hover:bg-nexus hover:text-void"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>EXPAND TAB</span>
                      </a>
                    </div>
                  </div>

                  {/* Render Embedded PDF */}
                  <div className="relative flex-1 min-h-[52vh] w-full bg-void">
                    <iframe
                      key={pdfEngine}
                      src={
                        pdfEngine === 'NATIVE'
                          ? file.downloadURL
                          : googleViewerUrl
                      }
                      title={`PDF Preview for ${file.name}`}
                      className="h-full w-full border-0 min-h-[52vh]"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}

              {/* Word Document (.docx / .doc) Viewer */}
              {isWord && (
                <div className="flex flex-col flex-1 min-h-[55vh] border border-nexus/30 bg-void">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-1.5 text-3xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-nexus flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        WORD_DOCUMENT_VIEWER
                      </span>
                      <span className="text-dimmer">({formatBytes(file.size)})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={file.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 border border-nexus/40 bg-nexus/10 px-2 py-0.5 text-3xs font-bold text-nexus hover:bg-nexus hover:text-void"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>OPEN IN NEW TAB</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => triggerFileDownload(file)}
                        className="flex items-center gap-1 border border-line bg-surface px-2 py-0.5 text-3xs text-ink hover:text-nexus"
                      >
                        <Download className="h-3 w-3" />
                        <span>DOWNLOAD</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative flex-1 min-h-[52vh] w-full bg-void flex flex-col">
                    <iframe
                      src={googleViewerUrl}
                      title={`Word Document Preview for ${file.name}`}
                      className="flex-1 w-full border-0 min-h-[50vh] bg-surface"
                      loading="lazy"
                    />
                    <div className="border-t border-line bg-surface2 px-3 py-2 text-3xs flex items-center justify-between text-slate-300">
                      <span>If preview does not render inline, you can open directly in Google Workspace or download.</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://docs.google.com/viewer?url=${encodeURIComponent(file.downloadURL || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-nexus underline font-bold"
                        >
                          Google Viewer Tab
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Text File View */}
              {isText && (
                <div className="border border-line bg-void p-3 flex-1 flex flex-col min-h-[40vh]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2 mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-3xs text-nexus font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        {file.isNote ? 'NOTE_DETAILS' : 'DOCUMENT_PAYLOAD'}
                      </span>
                      <span className="text-3xs text-dimmer">
                        ({content ? content.split('\n').length : 0} lines · {content.length} chars · {content.trim() ? content.trim().split(/\s+/).length : 0} words)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyContent}
                        disabled={!content}
                        className="flex items-center gap-1 border border-line bg-surface px-2 py-0.5 text-3xs font-bold text-dim hover:border-nexus hover:text-nexus disabled:opacity-40"
                        title="Copy note text"
                      >
                        {copiedContent ? <Check className="h-3 w-3 text-nexus" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedContent ? 'COPIED' : 'COPY TEXT'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('EDIT')}
                        className="flex items-center gap-1 border border-nexus/40 bg-nexus/10 px-2 py-0.5 text-3xs font-bold text-nexus hover:bg-nexus/20"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>EDIT NOTE</span>
                      </button>
                    </div>
                  </div>
                  {loadingContent ? (
                    <div className="flex h-48 items-center justify-center gap-2 text-2xs text-dim">
                      <Loader2 className="h-4 w-4 animate-spin text-nexus" />
                      <span>FETCHING NOTE DETAILS…</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto bg-surface/30 border border-line/40 p-3 min-h-[140px]">
                      {content ? (
                        <pre className="whitespace-pre-wrap font-mono text-2xs leading-relaxed text-ink select-text">
                          {content}
                        </pre>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[140px] text-center p-4">
                          <p className="font-mono text-2xs text-dimmer italic mb-2">No text details found in this note.</p>
                          <button
                            type="button"
                            onClick={() => setMode('EDIT')}
                            className="font-mono text-3xs text-nexus underline hover:text-nexus/80"
                          >
                            Click here to add note details and directives
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Image File View */}
              {isImage && (
                <div className="flex flex-col items-center justify-center border border-line bg-void/60 p-4 min-h-[40vh] flex-1">
                  <img
                    src={file.downloadURL}
                    alt={file.name}
                    className="max-h-[60vh] max-w-full object-contain border border-line shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-3 flex items-center gap-3 text-3xs text-dimmer">
                    <span>NAME: {file.name}</span>
                    <span>SIZE: {formatBytes(file.size)}</span>
                  </div>
                </div>
              )}

              {/* Other Binary / Unsupported Format */}
              {!isText && !isImage && !isPdf && !isWord && (
                <div className="flex h-48 flex-col items-center justify-center border border-dashed border-line bg-void/40 p-6 text-center">
                  <FileIcon className="h-8 w-8 text-dimmer mb-2" />
                  <p className="text-2xs font-bold text-ink">{file.name}</p>
                  <p className="mt-1 text-3xs text-dimmer">
                    Binary or proprietary container format. Download to inspect locally.
                  </p>
                  <TermButton
                    tone="nexus"
                    onClick={() => triggerFileDownload(file)}
                    className="mt-3 flex items-center gap-1.5"
                  >
                    <Download className="h-3 w-3" />
                    DOWNLOAD FILE ({formatBytes(file.size)})
                  </TermButton>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border border-line bg-surface2/50 p-3 text-3xs shrink-0">
                <div>
                  <span className="text-dimmer block">DIRECTORY</span>
                  <span className="font-bold text-ink">{file.folderId || 'ROOT'}</span>
                </div>
                <div>
                  <span className="text-dimmer block">PAYLOAD SIZE</span>
                  <span className="font-bold text-ink">{formatBytes(file.size)}</span>
                </div>
                <div>
                  <span className="text-dimmer block">MIME TYPE</span>
                  <span className="font-bold text-ink truncate block">{file.type || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-dimmer block">TIMESTAMP</span>
                  <span className="font-bold text-ink">{renderDate(file)}</span>
                </div>
              </div>
            </div>
          ) : (
            /* EDIT MODE */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-3xs text-dimmer block mb-1 font-bold">
                    FILE NAME <span className="text-hazard">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. document.txt"
                    className="w-full border border-line bg-void px-2.5 py-1.5 font-mono text-2xs text-ink outline-none focus:border-nexus"
                  />
                </div>

                <div>
                  <label className="text-3xs text-dimmer block mb-1 font-bold">
                    DIRECTORY FOLDER
                  </label>
                  <select
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    className="w-full border border-line bg-void px-2.5 py-1.5 font-mono text-2xs text-ink outline-none focus:border-nexus"
                  >
                    <option value="ROOT">ROOT / DEFAULT</option>
                    {availableFolders.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* If text file, allow editing content */}
              {isText && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-3xs text-dimmer font-bold">
                      DOCUMENT CONTENT (TEXT PAYLOAD)
                    </label>
                    <span className="text-3xs text-dimmer">
                      {content.length} chars · {content.split('\n').length} lines
                    </span>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={12}
                    placeholder="Type content here..."
                    className="w-full border border-line bg-void p-3 font-mono text-2xs leading-relaxed text-ink outline-none focus:border-nexus resize-y"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-line">
                <div>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(file)
                        onClose()
                      }}
                      className="flex items-center gap-1.5 text-3xs text-hazard hover:underline font-bold"
                    >
                      <Trash2 className="h-3 w-3" />
                      DELETE FILE
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <TermButton type="button" onClick={() => setMode('VIEW')}>
                    CANCEL
                  </TermButton>
                  <TermButton
                    tone="nexus"
                    type="submit"
                    disabled={saving || !name.trim()}
                    className="flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        SAVING…
                      </>
                    ) : (
                      <>
                        <Save className="h-3 w-3" />
                        SAVE CHANGES
                      </>
                    )}
                  </TermButton>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

