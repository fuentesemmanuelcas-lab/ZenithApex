import React, { useState } from 'react'
import { FileText, Folder, Loader2, Save, X } from 'lucide-react'
import { auth } from '../../lib/firebase'
import { loadSession } from '../../utils/authStore'
import { createUserNote } from '../../services/fileService'
import { useZenith } from '../../contexts/ZenithContext'

import type { UserFile } from '../../types/zenith'

interface CreateNoteModalProps {
  initialFolder?: string
  availableFolders?: string[]
  onClose: () => void
  onSuccess?: (newNote?: UserFile) => void
}

export function CreateNoteModal({
  initialFolder = 'ROOT',
  availableFolders = [],
  onClose,
  onSuccess,
}: CreateNoteModalProps) {
  const { pushToast, pushLog } = useZenith()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [folder, setFolder] = useState(initialFolder)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const activeUid = auth.currentUser?.uid || loadSession()?.uid
    if (!activeUid) {
      setError('You must be signed in to create notes.')
      return
    }

    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Please provide a title for the note.')
      return
    }

    if (!content.trim()) {
      setError('Note content cannot be empty.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const createdNote = await createUserNote({
        uid: activeUid,
        title: cleanTitle,
        content: content.trim(),
        folderId: folder === 'ROOT' || folder === 'ALL' ? undefined : folder,
      })

      pushToast({
        title: 'NOTE_CREATED',
        body: `Note "${cleanTitle}" saved to Nexus File Hub`,
        tone: 'nexus',
      })
      pushLog('STORAGE', `created note "${cleanTitle}"`, 'nexus')

      onSuccess?.(createdNote)
      onClose()
    } catch (err: any) {
      console.error('Note creation error:', err)
      setError(err?.message || 'Failed to save note. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-note-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-3 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col border border-nexus/50 bg-surface shadow-2xl shadow-nexus/15 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center border border-nexus/40 bg-nexus/10 text-nexus">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 id="create-note-title" className="font-mono text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
                NEXUS_HUB // CREATE_NOTE
              </h2>
              <p className="font-mono text-3xs text-dimmer">
                Compose document note and store directly in cloud storage node
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-6 w-6 items-center justify-center border border-line text-dim transition-colors hover:border-hazard hover:bg-hazard/10 hover:text-hazard"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col space-y-3 p-4 text-ink overflow-y-auto">
            {error && (
              <div className="border border-hazard/60 bg-hazard/10 px-3 py-2 font-mono text-2xs text-hazard leading-relaxed">
                [ERROR] {error}
              </div>
            )}

            {/* Note Title & Folder Target */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                  <FileText className="h-3 w-3 text-nexus" />
                  NOTE TITLE *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Operator Shift Protocols, Delivery Matrix Brief"
                  className="w-full border border-line bg-void px-3 py-1.5 font-mono text-2xs text-ink placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 font-mono text-3xs font-bold tracking-wider text-dim">
                  <Folder className="h-3 w-3 text-nexus" />
                  FOLDER DESTINATION
                </label>
                <select
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="w-full border border-line bg-void px-2.5 py-1.5 font-mono text-2xs text-ink outline-none transition-colors focus:border-nexus"
                >
                  <option value="ROOT">/ (ROOT FOLDER)</option>
                  {availableFolders
                    .filter((f) => f !== 'ALL' && f !== 'ROOT')
                    .map((f) => (
                      <option key={f} value={f}>
                        /{f}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Note Content Textarea */}
            <div className="flex flex-1 min-h-[220px] flex-col space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-mono text-3xs font-bold tracking-wider text-dim">
                  NOTE CONTENT (MARKDOWN / PLAIN TEXT) *
                </label>
                <span className="font-mono text-3xs text-dimmer">
                  {content.length} CHARS · {content.split('\n').length} LINES
                </span>
              </div>
              <textarea
                required
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter directives, intake notes, operational briefs, shift logs, or markdown documentation here..."
                className="w-full flex-1 resize-none border border-line bg-void p-3 font-mono text-2xs leading-relaxed text-ink placeholder:text-dimmer outline-none transition-colors focus:border-nexus"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-line bg-surface2 px-4 py-3">
            <span className="font-mono text-3xs text-dimmer">
              AUTOMATICALLY INDEXED AND ACCESSIBLE ACROSS NEXUS HUB
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="border border-line bg-surface px-3 py-1.5 font-mono text-2xs text-dim transition-colors hover:border-hazard hover:text-hazard"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 border border-nexus bg-nexus/15 px-4 py-1.5 font-mono text-2xs font-bold tracking-wider text-nexus transition-all hover:bg-nexus hover:text-void disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>SAVING NOTE...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    <span>SAVE NOTE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
