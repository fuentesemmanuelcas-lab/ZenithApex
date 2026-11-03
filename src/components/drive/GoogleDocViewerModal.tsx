import React, { useState } from 'react'
import {
  ExternalLinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
  XIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileIcon,
  CopyIcon,
  CheckIcon,
  InfoIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { TermButton } from '../ui/Primitives'
import { useZenith } from '../../contexts/ZenithContext'

interface GoogleDocViewerModalProps {
  fileId: string
  title: string
  mimeType?: string
  webViewLink?: string
  onClose: () => void
}

export function getGoogleEmbedUrl(fileId: string, mimeType?: string, mode: 'PREVIEW' | 'EDIT' = 'PREVIEW'): string {
  const isSheet = mimeType === 'application/vnd.google-apps.spreadsheet' || mimeType?.includes('sheet')
  const isDoc = mimeType === 'application/vnd.google-apps.document' || mimeType?.includes('doc')
  const isSlide = mimeType === 'application/vnd.google-apps.presentation' || mimeType?.includes('presentation') || mimeType?.includes('slide')

  if (mode === 'EDIT') {
    if (isSheet) return `https://docs.google.com/spreadsheets/d/${fileId}/edit?rm=minimal`
    if (isDoc) return `https://docs.google.com/document/d/${fileId}/edit?rm=minimal`
    if (isSlide) return `https://docs.google.com/presentation/d/${fileId}/edit?rm=minimal`
  }

  // PREVIEW mode is the most reliable embedding endpoint for Google Drive & Docs
  if (isSheet) {
    return `https://docs.google.com/spreadsheets/d/${fileId}/preview`
  }
  if (isDoc) {
    return `https://docs.google.com/document/d/${fileId}/preview`
  }
  if (isSlide) {
    return `https://docs.google.com/presentation/d/${fileId}/preview`
  }
  // Generic PDF, video, audio, or other drive file
  return `https://drive.google.com/file/d/${fileId}/preview`
}

export function GoogleDocViewerModal({
  fileId,
  title,
  mimeType,
  webViewLink,
  onClose,
}: GoogleDocViewerModalProps) {
  const { pushToast } = useZenith()
  const [viewMode, setViewMode] = useState<'PREVIEW' | 'EDIT'>('PREVIEW')
  const [iframeKey, setIframeKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const embedUrl = getGoogleEmbedUrl(fileId, mimeType, viewMode)
  const directLink =
    webViewLink ||
    (mimeType?.includes('sheet')
      ? `https://docs.google.com/spreadsheets/d/${fileId}/edit`
      : mimeType?.includes('doc')
      ? `https://docs.google.com/document/d/${fileId}/edit`
      : `https://drive.google.com/file/d/${fileId}/view`)

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directLink)
    setCopied(true)
    pushToast({
      title: 'LINK_COPIED',
      body: 'Document web URL copied to clipboard.',
      tone: 'nexus',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const getDocIcon = () => {
    if (mimeType?.includes('sheet')) return FileSpreadsheetIcon
    if (mimeType?.includes('doc')) return FileTextIcon
    return FileIcon
  }
  const DocIcon = getDocIcon()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm p-2 sm:p-4">
      <div
        className={`corner-bracket flex flex-col border border-nexus/50 bg-surface shadow-2xl transition-all duration-200 ${
          isMaximized ? 'h-[98vh] w-[98vw]' : 'h-[92vh] w-full max-w-6xl'
        }`}
      >
        {/* Top Bar Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <DocIcon className="h-4 w-4 shrink-0 text-nexus" />
            <span className="truncate font-mono text-xs font-bold tracking-wider text-white" title={title}>
              {title}
            </span>
            <span className="hidden rounded border border-line bg-void px-1.5 py-0.5 font-mono text-3xs text-slate-400 sm:inline">
              ID: {fileId.slice(0, 10)}…
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* View Mode Switcher: PREVIEW vs EDIT */}
            <div className="flex items-center border border-line bg-void p-0.5">
              <button
                type="button"
                onClick={() => {
                  setViewMode('PREVIEW')
                  setHasLoaded(false)
                  setIframeKey((k) => k + 1)
                }}
                className={`px-2 py-0.5 font-mono text-3xs font-bold transition-colors ${
                  viewMode === 'PREVIEW'
                    ? 'bg-nexus text-void shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Reliable embedded view (/preview)"
              >
                PREVIEW
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('EDIT')
                  setHasLoaded(false)
                  setIframeKey((k) => k + 1)
                }}
                className={`px-2 py-0.5 font-mono text-3xs font-bold transition-colors ${
                  viewMode === 'EDIT'
                    ? 'bg-nexus text-void shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Full inline editor (?rm=minimal)"
              >
                INLINE EDIT
              </button>
            </div>

            {/* Refresh Iframe */}
            <button
              type="button"
              onClick={() => {
                setHasLoaded(false)
                setIframeKey((k) => k + 1)
              }}
              title="Reload embedded document"
              className="flex h-7 w-7 items-center justify-center border border-line bg-void text-slate-300 hover:text-nexus hover:border-nexus transition-colors"
            >
              <RefreshCwIcon className="h-3.5 w-3.5" />
            </button>

            {/* Copy Direct Link */}
            <button
              type="button"
              onClick={handleCopyLink}
              title="Copy direct Google Docs/Drive URL"
              className="flex items-center gap-1 border border-line bg-void px-2 py-1 font-mono text-3xs text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
            >
              {copied ? <CheckIcon className="h-3 w-3 text-emerald-400" /> : <CopyIcon className="h-3 w-3" />}
              <span>{copied ? 'COPIED' : 'COPY LINK'}</span>
            </button>

            {/* Open External in New Tab (Prominent Primary) */}
            <a
              href={directLink}
              target="_blank"
              rel="noreferrer"
              title="Open full document directly in Google Workspace"
              className="flex items-center gap-1 border border-cyan-400 bg-cyan-500/20 px-3 py-1 font-mono text-3xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-void shadow-[0_0_8px_rgba(0,243,255,0.25)] transition-all"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              <span>OPEN IN GOOGLE DOCS</span>
            </a>

            {/* Maximize Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore window size' : 'Maximize window'}
              className="flex h-7 w-7 items-center justify-center border border-line bg-void text-slate-300 hover:text-white transition-colors"
            >
              {isMaximized ? <Minimize2Icon className="h-3.5 w-3.5" /> : <Maximize2Icon className="h-3.5 w-3.5" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Close viewer"
              className="flex h-7 w-7 items-center justify-center border border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500 hover:text-void transition-colors"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Security & Fallback Direct Link Sub-bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-void px-3 py-1.5 font-mono text-3xs text-slate-400">
          <div className="flex items-center gap-1.5 text-slate-300">
            <InfoIcon className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>
              Embedding via Google Workspace native frame. If your browser blocks 3rd-party frames or shows a refused connection, click{' '}
              <a
                href={directLink}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 underline font-bold hover:text-white"
              >
                [OPEN IN GOOGLE DOCS]
              </a>
              .
            </span>
          </div>
          <span className="hidden font-mono text-4xs text-slate-400 md:inline">
            ENDPOINT: {viewMode === 'PREVIEW' ? 'DOCS_PREVIEW_EMBED' : 'DOCS_MINIMAL_EDIT'}
          </span>
        </div>

        {/* Native Iframe Container with clean full-bleed styling */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-void flex flex-col">
          <iframe
            key={`${viewMode}-${iframeKey}`}
            src={embedUrl}
            title={title}
            width="100%"
            height="100%"
            onLoad={() => setHasLoaded(true)}
            className="flex-1 w-full border-0 bg-white"
            allow="autoplay; encrypted-media; camera; microphone"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}
