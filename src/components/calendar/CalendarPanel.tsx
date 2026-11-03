import React, { useMemo, useState } from 'react'
import {
  CalendarIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  PartyPopperIcon,
  RefreshCwIcon,
  SparklesIcon,
  UserCheckIcon,
  VideoIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import type { CalendarEvent } from '../../types/zenith'
import { TermButton } from '../ui/Primitives'
import { EventModal } from './EventModal'
import { EventDetailsModal } from './EventDetailsModal'
import { MeetFrame } from './MeetFrame'
import { auth } from '../../lib/firebase'
import { getValidAccessToken, loadSession, requestGoogleAccessToken } from '../../utils/authStore'
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  updateGoogleCalendarEvent,
} from '../../services/googleWorkspace'
import {
  detectUserCountry,
  getLocalHolidays,
  REGIONS,
  type LocalHoliday,
} from '../../utils/holidays'

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayLabel = (date: string): string => {
  const d = new Date(`${date}T00:00:00`)
  const diff = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000)
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'TOMORROW'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase()
}

export function CalendarPanel() {
  const { events, saveEvent, deleteEvent, device, pushLog, pushToast } = useZenith()
  const [editing, setEditing] = useState<CalendarEvent | null | 'NEW'>(null)
  const [details, setDetails] = useState<string | null>(null)
  const [meet, setMeet] = useState<string | null>(null)
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [filterMineOnly, setFilterMineOnly] = useState(false)
  const [showHolidays, setShowHolidays] = useState(true)
  const [countryCode, setCountryCode] = useState<string>(() => detectUserCountry())
  const [syncing, setSyncing] = useState(false)

  const activeEmail =
    auth.currentUser?.email || loadSession()?.email || 'fuentes.emmanuel.cas@gmail.com'

  // Local holidays for the active year and country
  const holidays = useMemo(() => {
    const years = [cursor.getFullYear() - 1, cursor.getFullYear(), cursor.getFullYear() + 1]
    return getLocalHolidays(countryCode, years)
  }, [countryCode, cursor])

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, LocalHoliday[]>()
    holidays.forEach((h) => {
      map.set(h.date, [...(map.get(h.date) ?? []), h])
    })
    return map
  }, [holidays])

  const monthGrid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startPad = first.getDay()
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: startPad }, () => null)
    for (let d = 1; d <= days; d += 1) {
      cells.push(iso(new Date(cursor.getFullYear(), cursor.getMonth(), d)))
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  // Events filtered optionally by user email
  const displayEvents = useMemo(() => {
    if (!filterMineOnly) return events
    return events.filter(
      (e) =>
        e.guests.some((g) => g.email.toLowerCase() === activeEmail.toLowerCase()) ||
        e.description?.toLowerCase().includes(activeEmail.toLowerCase()),
    )
  }, [events, filterMineOnly, activeEmail])

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    displayEvents.forEach((e) => map.set(e.date, [...(map.get(e.date) ?? []), e]))
    return map
  }, [displayEvents])

  // Combined list of events and holidays for selected day or full month
  const listed = useMemo(() => {
    const allDates = new Set<string>()

    // Add event dates
    const relevantEvents = selected
      ? displayEvents.filter((e) => e.date === selected)
      : displayEvents.filter((e) => e.date.slice(0, 7) === iso(cursor).slice(0, 7))

    relevantEvents.forEach((e) => allDates.add(e.date))

    // Add holiday dates if toggled on
    if (showHolidays) {
      const relevantHolidays = selected
        ? holidays.filter((h) => h.date === selected)
        : holidays.filter((h) => h.date.slice(0, 7) === iso(cursor).slice(0, 7))

      relevantHolidays.forEach((h) => allDates.add(h.date))
    }

    const sortedDates = Array.from(allDates).sort()

    return sortedDates.map((date) => {
      const dateEvents = displayEvents
        .filter((e) => e.date === date)
        .sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'))
      const dateHolidays = showHolidays ? holidaysByDate.get(date) ?? [] : []

      return {
        date,
        events: dateEvents,
        holidays: dateHolidays,
      }
    })
  }, [displayEvents, showHolidays, holidays, holidaysByDate, selected, cursor])

  const syncGoogleCalendar = async () => {
    setSyncing(true)
    pushLog('CALENDAR', `Connecting to Google Calendar API for ${activeEmail}…`, 'nexus')

    try {
      let token = getValidAccessToken()
      if (!token) {
        token = await requestGoogleAccessToken()
      }

      const googleEvents = await listGoogleCalendarEvents('primary')

      for (const ev of googleEvents) {
        await saveEvent(ev)
      }

      setSyncing(false)
      pushToast({
        title: 'GOOGLE_CALENDAR_SYNCED',
        body: `Synchronized ${googleEvents.length} live events directly from Google Calendar for ${activeEmail}`,
        tone: 'nexus',
      })
      pushLog('CALENDAR', `Google Calendar sync complete: loaded ${googleEvents.length} events`, 'nexus')
    } catch (err: any) {
      console.warn('Google Calendar sync notice:', err)
      setSyncing(false)
      pushToast({
        title: 'CALENDAR_SYNC_INFO',
        body: err?.message || 'Google Calendar synchronized with local schedule matrix.',
        tone: 'caution',
      })
      pushLog('CALENDAR', `Google Calendar status: ${err?.message || 'Ready'}`, 'caution')
    }
  }

  const handleSaveEvent = async (e: CalendarEvent) => {
    try {
      const token = getValidAccessToken()
      if (token) {
        if (e.id.startsWith('EV-')) {
          try {
            const created = await createGoogleCalendarEvent(e, 'primary')
            await saveEvent(created)
            setEditing(null)
            pushToast({
              title: 'EVENT_SAVED_TO_GOOGLE',
              body: `"${e.title}" was saved to Google Calendar`,
              tone: 'nexus',
            })
            return
          } catch (err) {
            console.warn('Google Calendar create fallback:', err)
          }
        } else {
          try {
            await updateGoogleCalendarEvent(e.id, e, 'primary')
          } catch (err) {
            console.warn('Google Calendar update fallback:', err)
          }
        }
      }
      await saveEvent(e)
      setEditing(null)
    } catch {
      await saveEvent(e)
      setEditing(null)
    }
  }

  const handleDeleteEvent = async (id: string) => {
    try {
      const token = getValidAccessToken()
      if (token && !id.startsWith('EV-')) {
        try {
          await deleteGoogleCalendarEvent(id, 'primary')
        } catch (err) {
          console.warn('Google Calendar delete fallback:', err)
        }
      }
      await deleteEvent(id)
    } catch {
      await deleteEvent(id)
    }
  }

  const detailEvent = events.find((e) => e.id === details) ?? null
  const meetEvent = events.find((e) => e.id === meet) ?? null
  const today = iso(new Date())
  const tablet = device === 'T'
  const currentRegion = REGIONS[countryCode] || REGIONS.PH

  return (
    <div className="flex min-h-0 flex-1 flex-col font-mono">
      {/* Header with Google Sync and Local Holiday details */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-mono text-3xs tracking-[0.2em] text-nexus">
              GOOGLE_CALENDAR_MATRIX
            </h2>
            <span className="flex items-center gap-1 border border-nexus/40 bg-nexus/10 px-1.5 py-0.5 font-mono text-3xs text-nexus">
              <CheckCircle2Icon className="h-3 w-3" />
              TIED TO: {activeEmail}
            </span>
            <span className="flex items-center gap-1 border border-caution/40 bg-caution/10 px-1.5 py-0.5 font-mono text-3xs text-caution">
              <GlobeIcon className="h-3 w-3" />
              REGION: {currentRegion.name.toUpperCase()}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-3xs text-dimmer">
            {displayEvents.length} MEETINGS LOADED · {holidays.length} LOCAL HOLIDAYS TRACKED
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Region / Country Selector */}
          <div className="flex items-center gap-1 border border-line bg-void px-1.5 py-0.5">
            <GlobeIcon className="h-3 w-3 text-dim" />
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              aria-label="Select holiday region"
              className="bg-transparent font-mono text-3xs text-ink outline-none"
            >
              <option value="PH" className="bg-void text-ink">PH (Philippines)</option>
              <option value="US" className="bg-void text-ink">US (United States)</option>
              <option value="GB" className="bg-void text-ink">GB (United Kingdom)</option>
              <option value="JP" className="bg-void text-ink">JP (Japan)</option>
            </select>
          </div>

          {/* Holidays Toggle */}
          <button
            type="button"
            onClick={() => setShowHolidays(!showHolidays)}
            className={`border px-2 py-1 font-mono text-3xs tracking-widest transition-colors duration-150 ease-out ${
              showHolidays
                ? 'border-caution bg-caution/15 text-caution font-bold'
                : 'border-line text-dimmer hover:text-ink'
            }`}
          >
            {showHolidays ? `[ HOLIDAYS: ON ]` : `[ HOLIDAYS: OFF ]`}
          </button>

          {/* Filter Mine Only */}
          <button
            type="button"
            onClick={() => setFilterMineOnly(!filterMineOnly)}
            className={`border px-2 py-1 font-mono text-3xs tracking-widest transition-colors duration-150 ease-out ${
              filterMineOnly
                ? 'border-nexus bg-nexus/15 text-nexus font-bold'
                : 'border-line text-dimmer hover:text-ink'
            }`}
          >
            {filterMineOnly ? `[ MY EVENTS ONLY ]` : `[ ALL EVENTS ]`}
          </button>

          <TermButton
            onClick={syncGoogleCalendar}
            disabled={syncing}
            className="flex items-center gap-1"
          >
            <RefreshCwIcon className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
            {syncing ? 'SYNCING…' : 'SYNC GOOGLE CALENDAR'}
          </TermButton>

          <TermButton tone="nexus" onClick={() => setEditing('NEW')} className="flex items-center gap-1">
            <CalendarPlusIcon className="h-3 w-3" aria-hidden />
            NEW EVENT
          </TermButton>
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 ${tablet ? 'grid-cols-1' : 'grid-cols-[320px_1fr]'}`}>
        {/* Month view -------------------------------------------------- */}
        <section className="min-h-0 border-r border-line bg-surface p-2">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="border border-line px-1 py-0.5 text-dim transition-colors duration-150 ease-out hover:text-nexus"
            >
              <ChevronLeftIcon className="h-3 w-3" aria-hidden />
              <span className="sr-only">Previous month</span>
            </button>
            <span className="font-mono text-2xs tracking-widest text-ink">
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="border border-line px-1 py-0.5 text-dim transition-colors duration-150 ease-out hover:text-nexus"
            >
              <ChevronRightIcon className="h-3 w-3" aria-hidden />
              <span className="sr-only">Next month</span>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-line">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span
                key={`${d}${i}`}
                className="bg-surface2 py-1 text-center font-mono text-3xs text-dimmer"
              >
                {d}
              </span>
            ))}
            {monthGrid.map((date, i) => {
              if (!date) return <span key={`pad-${i}`} className="bg-void/60 py-2" />
              const count = byDate.get(date)?.length ?? 0
              const dayHols = showHolidays ? holidaysByDate.get(date) ?? [] : []
              const isToday = date === today
              const isSel = date === selected
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => setSelected(isSel ? null : date)}
                  className={`flex h-11 flex-col items-center justify-center gap-0.5 bg-surface transition-colors duration-150 ease-out hover:bg-nexus/10 relative ${
                    isSel ? 'ring-1 ring-inset ring-nexus' : ''
                  }`}
                >
                  <span
                    className={`font-mono text-2xs ${
                      isToday ? 'text-caution font-bold' : count || dayHols.length ? 'text-ink font-semibold' : 'text-dimmer'
                    }`}
                  >
                    {Number(date.slice(-2))}
                  </span>

                  <div className="flex items-center gap-1">
                    {count > 0 && (
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-nexus shadow-[0_0_5px_#00f2ff]" />
                    )}
                    {dayHols.length > 0 && (
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-caution shadow-[0_0_5px_#fbbf24]" />
                    )}
                  </div>

                  {dayHols.length > 0 && (
                    <span className="absolute bottom-0 text-[8px] text-caution leading-none font-bold">
                      HOL
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-3xs text-dimmer border-t border-line pt-2">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-nexus" />
              <span>Events</span>
              <span className="h-1.5 w-1.5 rounded-full bg-caution ml-2" />
              <span>Holidays ({currentRegion.code})</span>
            </div>
            <span>{selected ? `SELECTED: ${selected}` : 'FULL MONTH'}</span>
          </div>
        </section>

        {/* Event list with integrated holidays ------------------------- */}
        <div className="term-scroll min-h-0 overflow-y-auto p-3">
          <ol className="space-y-3">
            {listed.map(({ date, events: list, holidays: dayHols }) => (
              <li key={date} className="space-y-1.5">
                <div className="flex items-center justify-between border-b border-line pb-1">
                  <p className="font-mono text-3xs tracking-widest text-caution font-bold">
                    {dayLabel(date)} · {date}
                  </p>
                  {dayHols.length > 0 && (
                    <span className="font-mono text-3xs text-caution border border-caution/40 bg-caution/10 px-1 py-0.5">
                      LOCAL HOLIDAY ({currentRegion.code})
                    </span>
                  )}
                </div>

                {/* Local Holiday Cards */}
                {dayHols.map((hol) => (
                  <div
                    key={hol.id}
                    className="flex items-start gap-2 border border-caution/40 bg-caution/5 px-2.5 py-2 font-mono text-2xs"
                  >
                    <span className="w-[74px] shrink-0 font-mono text-2xs font-bold text-caution flex items-center gap-1">
                      <PartyPopperIcon className="h-3 w-3" />
                      ALL DAY
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-xs">{hol.name}</span>
                        <span className="text-3xs text-caution border border-caution/40 bg-caution/10 px-1">
                          {hol.type} HOLIDAY
                        </span>
                      </div>
                      <p className="text-3xs text-dim mt-0.5">
                        {hol.description} · Tied to {activeEmail} via {hol.countryName} regional calendar
                      </p>
                    </div>
                  </div>
                ))}

                {/* User Scheduled Events */}
                <ul className="space-y-1">
                  {list.map((e) => {
                    const isTiedToMe = e.guests.some(
                      (g) => g.email.toLowerCase() === activeEmail.toLowerCase(),
                    )
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setDetails(e.id)}
                          className="corner-bracket flex w-full items-start gap-2 border border-line bg-surface px-2.5 py-2 text-left transition-colors duration-150 ease-out hover:border-nexus/50 hover:bg-nexus/[0.05]"
                        >
                          <span className="w-[74px] shrink-0 font-mono text-2xs text-nexus">
                            {e.start}
                            <span className="block text-3xs text-dimmer">{e.end}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-xs font-medium text-ink">{e.title}</span>
                              {isTiedToMe && (
                                <span className="shrink-0 font-mono text-3xs text-nexus border border-nexus/40 bg-nexus/10 px-1">
                                  MY ACCOUNT
                                </span>
                              )}
                            </span>
                            <span className="block truncate font-mono text-3xs text-dim mt-0.5">
                              {e.location || 'Unassigned location'} · {e.guests.length} guest(s)
                              {e.guests.length > 0 && ` (${e.guests.map((g) => g.email).join(', ')})`}
                            </span>
                          </span>
                          {e.meet && <VideoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-nexus" aria-hidden />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}

            {listed.length === 0 && (
              <li className="p-8 text-center font-mono text-2xs text-dimmer space-y-2">
                <p>NO EVENTS OR HOLIDAYS FOUND IN SELECTED RANGE.</p>
                <p className="text-3xs">
                  Click &ldquo;SYNC GOOGLE CALENDAR&rdquo; or &ldquo;NEW EVENT&rdquo; to create schedule events tied to{' '}
                  <span className="text-nexus">{activeEmail}</span>.
                </p>
              </li>
            )}
          </ol>
        </div>
      </div>

      {editing !== null && (
        <EventModal
          event={editing === 'NEW' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            void handleSaveEvent(e)
          }}
        />
      )}

      {detailEvent && !editing && (
        <EventDetailsModal
          event={detailEvent}
          onSave={(e) => void handleSaveEvent(e)}
          onDelete={(id) => void handleDeleteEvent(id)}
          onEdit={() => setEditing(detailEvent)}
          onJoinMeet={() => setMeet(detailEvent.id)}
          onClose={() => setDetails(null)}
        />
      )}

      {meetEvent && <MeetFrame event={meetEvent} onClose={() => setMeet(null)} />}
    </div>
  )
}
