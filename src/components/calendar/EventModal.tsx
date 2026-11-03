import React, { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import type { CalendarEvent, Guest } from '../../types/zenith'
import { Field, TermButton, inputCls } from '../ui/Primitives'
import { auth } from '../../lib/firebase'
import { loadSession } from '../../utils/authStore'

const blank = (): CalendarEvent => {
  const userEmail = auth.currentUser?.email || loadSession()?.email || 'fuentes.emmanuel.cas@gmail.com'
  return {
    id: `EV-${Date.now().toString().slice(-6)}`,
    title: '',
    date: new Date().toISOString().slice(0, 10),
    start: '09:00',
    end: '09:30',
    location: '',
    description: '',
    guests: userEmail ? [{ email: userEmail, rsvp: 'YES' }] : [],
    meet: true,
  }
}

export function EventModal({
  event,
  onSave,
  onClose,
}: {
  event: CalendarEvent | null
  onSave: (e: CalendarEvent) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<CalendarEvent>(event ?? blank())
  const [guest, setGuest] = useState('')

  const set = <K extends keyof CalendarEvent>(key: K, value: CalendarEvent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const addGuest = () => {
    const email = guest.trim()
    if (!email) return
    const next: Guest = { email, rsvp: 'PENDING' }
    setDraft((d) => ({ ...d, guests: [...d.guests, next] }))
    setGuest('')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-void/85 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.title.trim()) return
          onSave(draft)
        }}
        className="corner-bracket w-full max-w-lg border border-nexus/40 bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line bg-surface2 px-3 py-2">
          <h2 className="font-mono text-3xs tracking-[0.2em] text-nexus">
            {event ? 'EDIT_EVENT' : 'CREATE_EVENT'} // GOOGLE_CALENDAR
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-dim transition-colors duration-150 ease-out hover:text-hazard"
          >
            <XIcon className="h-4 w-4" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="term-scroll max-h-[70vh] space-y-3 overflow-y-auto p-3">
          <Field label="TITLE">
            <input
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              required
              className={inputCls}
              placeholder="Depot review…"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="DATE">
              <input
                type="date"
                value={draft.date}
                onChange={(e) => set('date', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="START">
              <input
                type="time"
                value={draft.start}
                onChange={(e) => set('start', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="END">
              <input
                type="time"
                value={draft.end}
                onChange={(e) => set('end', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="LOCATION">
            <input
              value={draft.location}
              onChange={(e) => set('location', e.target.value)}
              className={inputCls}
              placeholder="Depot 07 / Bay 3"
            />
          </Field>
          <Field label="DESCRIPTION">
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              className={`${inputCls} resize-none`}
            />
          </Field>

          <div>
            <span className="mb-1 block font-mono text-3xs tracking-widest text-dim">GUESTS</span>
            <div className="flex gap-2">
              <input
                value={guest}
                onChange={(e) => setGuest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addGuest()
                  }
                }}
                className={inputCls}
                placeholder="operator@zenith.os"
                aria-label="Guest email"
              />
              <TermButton onClick={addGuest} className="flex shrink-0 items-center gap-1">
                <PlusIcon className="h-3 w-3" aria-hidden />
                ADD
              </TermButton>
            </div>
            <ul className="mt-2 space-y-1">
              {draft.guests.map((g) => (
                <li
                  key={g.email}
                  className="flex items-center justify-between border border-line bg-void px-2 py-1"
                >
                  <span className="font-mono text-2xs text-ink">{g.email}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, guests: d.guests.filter((x) => x.email !== g.email) }))
                    }
                    className="font-mono text-3xs text-dim transition-colors duration-150 ease-out hover:text-hazard"
                  >
                    REMOVE
                  </button>
                </li>
              ))}
              {draft.guests.length === 0 && (
                <li className="font-mono text-3xs text-dimmer">no guests attached</li>
              )}
            </ul>
          </div>

          <label className="flex items-center gap-2 font-mono text-2xs text-dim">
            <input
              type="checkbox"
              checked={draft.meet}
              onChange={(e) => set('meet', e.target.checked)}
              className="h-3 w-3 accent-[#00f2ff]"
            />
            ATTACH GOOGLE MEET FRAME
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-surface2 px-3 py-2">
          <TermButton tone="ghost" onClick={onClose}>
            CANCEL
          </TermButton>
          <TermButton type="submit">COMMIT EVENT</TermButton>
        </div>
      </form>
    </div>
  )
}
