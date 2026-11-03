import React from 'react'
import { CalendarClockIcon, MapPinIcon, Trash2Icon, VideoIcon, XIcon } from 'lucide-react'
import type { CalendarEvent, Rsvp } from '../../types/zenith'
import { TermButton } from '../ui/Primitives'

const PROTOCOL: Rsvp[] = ['YES', 'NO', 'MAYBE']

const rsvpTone: Record<Rsvp, string> = {
  YES: 'border-nexus/60 bg-nexus/10 text-nexus',
  NO: 'border-hazard/60 bg-hazard/10 text-hazard',
  MAYBE: 'border-caution/60 bg-caution/10 text-caution',
  PENDING: 'border-line2 text-dimmer',
}

export function EventDetailsModal({
  event,
  onSave,
  onDelete,
  onEdit,
  onJoinMeet,
  onClose,
}: {
  event: CalendarEvent
  onSave: (e: CalendarEvent) => void
  onDelete: (id: string) => void
  onEdit: () => void
  onJoinMeet: () => void
  onClose: () => void
}) {
  const setRsvp = (email: string, rsvp: Rsvp) =>
    onSave({
      ...event,
      guests: event.guests.map((g) => (g.email === email ? { ...g, rsvp } : g)),
    })

  return (
    <div id="viewCalModal" className="fixed inset-0 z-40 flex items-center justify-center bg-void/85 p-4">
      <div className="corner-bracket w-full max-w-md border border-nexus/40 bg-surface">
        <div className="flex items-center justify-between border-b border-line bg-surface2 px-3 py-2">
          <h2 className="font-mono text-3xs tracking-[0.2em] text-nexus">EVENT_DETAILS // {event.id}</h2>
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
          <h3 className="text-base font-semibold text-ink">{event.title}</h3>
          <p className="flex items-center gap-2 font-mono text-2xs text-dim">
            <CalendarClockIcon className="h-3.5 w-3.5 text-nexus" aria-hidden />
            {event.date} · {event.start}–{event.end}
          </p>
          <p className="flex items-center gap-2 font-mono text-2xs text-dim">
            <MapPinIcon className="h-3.5 w-3.5 text-nexus" aria-hidden />
            {event.location || 'unassigned'}
          </p>
          {event.description && (
            <p className="border border-line bg-void p-2 text-2xs leading-relaxed text-dim">
              {event.description}
            </p>
          )}

          <div>
            <p className="mb-1 font-mono text-3xs tracking-widest text-dimmer">
              RSVP_PROTOCOL — GUESTS ({event.guests.length})
            </p>
            <ul className="space-y-1">
              {event.guests.map((g) => (
                <li
                  key={g.email}
                  className="flex flex-wrap items-center justify-between gap-2 border border-line bg-void px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-2xs text-ink">{g.email}</span>
                  <span className="flex items-center gap-1">
                    {PROTOCOL.map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={g.rsvp === p}
                        onClick={() => setRsvp(g.email, p)}
                        className={`border px-1.5 py-[1px] font-mono text-3xs tracking-wider transition-colors duration-150 ease-out ${
                          g.rsvp === p ? rsvpTone[p] : 'border-line2 text-dimmer hover:text-ink'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
              {event.guests.length === 0 && (
                <li className="font-mono text-3xs text-dimmer">no guests attached</li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface2 px-3 py-2">
          <TermButton
            tone="hazard"
            onClick={() => {
              onDelete(event.id)
              onClose()
            }}
            className="flex items-center gap-1"
          >
            <Trash2Icon className="h-3 w-3" aria-hidden />
            DELETE
          </TermButton>
          <TermButton tone="ghost" onClick={onEdit}>
            EDIT
          </TermButton>
          {event.meet && (
            <TermButton onClick={onJoinMeet} className="flex items-center gap-1">
              <VideoIcon className="h-3 w-3" aria-hidden />
              JOIN MEET
            </TermButton>
          )}
        </div>
      </div>
    </div>
  )
}
