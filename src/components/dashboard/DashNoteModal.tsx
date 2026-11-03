import React, { useState } from 'react'
import { XIcon } from 'lucide-react'
import type { OperatorRecord } from '../../types/zenith'
import { TermButton, inputCls } from '../ui/Primitives'
import { useZenith } from '../../contexts/ZenithContext'

/** #dashNoteModal — commits text updates to a record's note shard. */
export function DashNoteModal({
  record,
  onClose,
}: {
  record: OperatorRecord
  onClose: () => void
}) {
  const { updateRecord, pushToast } = useZenith()
  const [draft, setDraft] = useState(record.notes)

  return (
    <div id="dashNoteModal" className="fixed inset-0 z-[65] flex items-center justify-center bg-void/85 p-4">
      <div className="corner-bracket w-full max-w-md border border-hazard/40 bg-surface">
        <div className="flex items-center justify-between border-b border-line bg-surface2 px-3 py-2">
          <h2 className="font-mono text-3xs tracking-[0.2em] text-hazard">
            NOTE_SHARD // {record.id} · {record.codename}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-dim transition-colors duration-150 ease-out hover:text-hazard"
          >
            <XIcon className="h-4 w-4" aria-hidden />
            <span className="sr-only">Close note shard</span>
          </button>
        </div>
        <div className="p-3">
          <label className="mb-1 block font-mono text-3xs tracking-widest text-dim" htmlFor="note-shard">
            OPERATOR NOTES
          </label>
          <textarea
            id="note-shard"
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`${inputCls} resize-none font-mono text-2xs text-[#00f2ff]`}
            placeholder="log operational context…"
          />
          <p className="mt-1 font-mono text-3xs text-dimmer">{draft.length} CHARS BUFFERED</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-surface2 px-3 py-2">
          <TermButton tone="ghost" onClick={onClose}>
            DISCARD
          </TermButton>
          <TermButton
            onClick={() => {
              void updateRecord(record.id, 'notes', draft)
              pushToast({
                title: 'NOTES COMMITTED',
                body: `Directives updated for ${record.operator} [${record.id}] (Switched to Updated)`,
                tone: 'caution',
              })
              onClose()
            }}
          >
            COMMIT NOTES
          </TermButton>
        </div>
      </div>
    </div>
  )
}
