import React, { useState, useMemo } from 'react'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  VideoIcon,
  ClockIcon,
  CalendarDaysIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import type { CalendarEvent } from '../../types/zenith'
import { EventModal } from './EventModal'
import { EventDetailsModal } from './EventDetailsModal'
import { MeetFrame } from './MeetFrame'

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function SidebarCalendar() {
  const { events, saveEvent, deleteEvent, setView, pushToast, pushLog } = useZenith()
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string>(() => iso(new Date()))

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null)
  const [meetEvent, setMeetEvent] = useState<CalendarEvent | null>(null)

  const todayIso = useMemo(() => iso(new Date()), [])

  // Map events by ISO date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    events.forEach((e) => {
      const list = map.get(e.date) || []
      list.push(e)
      map.set(e.date, list)
    })
    return map
  }, [events])

  // Calendar cells for current cursor month
  const monthCells = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startPad = firstDay.getDay()
    const totalDays = new Date(year, month + 1, 0).getDate()

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = []

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate()
    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i)
      cells.push({
        dateStr: iso(d),
        dayNum: prevMonthDays - i,
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const current = new Date(year, month, d)
      cells.push({
        dateStr: iso(current),
        dayNum: d,
        isCurrentMonth: true,
      })
    }

    // Remaining trailing padding to complete the 7-column rows
    const remainder = cells.length % 7
    if (remainder !== 0) {
      const fillCount = 7 - remainder
      for (let d = 1; d <= fillCount; d++) {
        const next = new Date(year, month + 1, d)
        cells.push({
          dateStr: iso(next),
          dayNum: d,
          isCurrentMonth: false,
        })
      }
    }

    return cells
  }, [cursor])

  const prevMonth = () => {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const jumpToToday = () => {
    const now = new Date()
    setCursor(now)
    setSelectedDate(iso(now))
  }

  const isCurrentCursorMonth =
    cursor.getFullYear() === new Date().getFullYear() &&
    cursor.getMonth() === new Date().getMonth()

  // Events for the selected date
  const selectedDayEvents = useMemo(() => {
    return (eventsByDate.get(selectedDate) || []).slice().sort((a, b) =>
      (a.start || '00:00').localeCompare(b.start || '00:00'),
    )
  }, [eventsByDate, selectedDate])

  const handleOpenCreate = () => {
    setEditingEvent({
      id: `EV-${Date.now().toString().slice(-6)}`,
      title: '',
      date: selectedDate,
      start: '09:00',
      end: '09:30',
      location: '',
      description: '',
      guests: [],
      meet: true,
    })
    setShowCreateModal(true)
  }

  const handleSaveEvent = async (e: CalendarEvent) => {
    try {
      await saveEvent(e)
      setShowCreateModal(false)
      setEditingEvent(null)
      if (detailEvent?.id === e.id) {
        setDetailEvent(e)
      }
      pushToast({
        title: 'EVENT SAVED',
        body: `"${e.title || 'Untitled'}" updated in calendar`,
        tone: 'nexus',
      })
      pushLog('CALENDAR', `Saved event: ${e.title} (${e.date})`, 'nexus')
    } catch (err) {
      pushToast({
        title: 'SAVE FAILED',
        body: (err as Error)?.message || 'Could not save event',
        tone: 'hazard',
      })
    }
  }

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteEvent(id)
      setDetailEvent(null)
      pushToast({
        title: 'EVENT DELETED',
        body: `Event ${id} removed`,
        tone: 'caution',
      })
      pushLog('CALENDAR', `Deleted event: ${id}`, 'caution')
    } catch (err) {
      pushToast({
        title: 'DELETE FAILED',
        body: (err as Error)?.message || 'Could not delete event',
        tone: 'hazard',
      })
    }
  }

  return (
    <section className="corner-bracket border border-line bg-surface font-mono">
      {/* Calendar Header */}
      <div className="flex items-center justify-between border-b border-line bg-surface2 px-2.5 py-1.5 text-3xs">
        <div className="flex items-center gap-1.5 font-bold tracking-wider text-nexus">
          <CalendarIcon className="h-3 w-3" />
          <span>CALENDAR</span>
        </div>
        <div className="flex items-center gap-1">
          {!isCurrentCursorMonth && (
            <button
              type="button"
              onClick={jumpToToday}
              className="border border-nexus/40 bg-nexus/10 px-1 py-0.2 text-3xs font-bold text-nexus hover:bg-nexus hover:text-void transition-colors"
              title="Jump to today"
            >
              TODAY
            </button>
          )}
          <button
            type="button"
            onClick={prevMonth}
            className="p-0.5 text-dim hover:text-nexus transition-colors"
            title="Previous month"
          >
            <ChevronLeftIcon className="h-3 w-3" />
          </button>
          <span className="font-bold text-ink px-0.5 text-3xs min-w-[58px] text-center">
            {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-0.5 text-dim hover:text-nexus transition-colors"
            title="Next month"
          >
            <ChevronRightIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="ml-1 border border-nexus/50 bg-nexus/15 p-0.5 text-nexus hover:bg-nexus hover:text-void transition-colors"
            title="Add new event"
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px border-b border-line/60 bg-surface/50 text-center text-3xs text-dimmer py-1 font-bold">
        {WEEK_DAYS.map((wd, i) => (
          <div key={i}>{wd}</div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className="grid grid-cols-7 gap-px bg-line/40 p-1">
        {monthCells.map((cell) => {
          const isToday = cell.dateStr === todayIso
          const isSelected = cell.dateStr === selectedDate
          const hasEvents = (eventsByDate.get(cell.dateStr)?.length ?? 0) > 0

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => setSelectedDate(cell.dateStr)}
              className={`relative flex flex-col items-center justify-center h-6 text-3xs transition-all duration-100 ${
                isSelected
                  ? 'border border-nexus bg-nexus/20 text-nexus font-bold shadow-[0_0_6px_rgba(0,240,255,0.3)]'
                  : isToday
                    ? 'border border-caution/80 bg-caution/10 text-caution font-bold'
                    : cell.isCurrentMonth
                      ? 'bg-void text-ink hover:bg-surface2 hover:text-nexus'
                      : 'bg-void/60 text-dimmer hover:text-dim'
              }`}
            >
              <span>{cell.dayNum}</span>
              {hasEvents && (
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    isSelected ? 'bg-nexus' : 'bg-nexus animate-pulse'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Selected Date Mini Preview */}
      <div className="border-t border-line/70 bg-surface2/60 p-1.5 text-3xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-bold text-dimmer">
            {selectedDate === todayIso ? 'TODAY' : selectedDate}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-dimmer text-3xs">
              {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'EVENT' : 'EVENTS'}
            </span>
            <button
              type="button"
              onClick={() => setView('DASH')}
              className="text-dim hover:text-nexus text-3xs flex items-center gap-0.5"
              title="Open full calendar view in dashboard"
            >
              <CalendarDaysIcon className="h-2.5 w-2.5" />
              <span>EXPAND</span>
            </button>
          </div>
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="flex items-center justify-between py-1 px-1.5 border border-dashed border-line/50 text-dimmer text-3xs">
            <span>No events scheduled</span>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="text-nexus hover:underline font-bold"
            >
              + ADD
            </button>
          </div>
        ) : (
          <div className="space-y-1 max-h-[72px] overflow-y-auto term-scroll pr-0.5">
            {selectedDayEvents.map((e) => (
              <div
                key={e.id}
                onClick={() => setDetailEvent(e)}
                className="group flex cursor-pointer items-center justify-between border border-line bg-void px-1.5 py-0.5 hover:border-nexus/60 transition-colors"
              >
                <div className="min-w-0 flex-1 truncate pr-1">
                  <div className="flex items-center gap-1 truncate font-semibold text-ink group-hover:text-nexus">
                    {e.meet && <VideoIcon className="h-2.5 w-2.5 text-nexus shrink-0" />}
                    <span className="truncate">{e.title || 'Untitled Event'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-dimmer text-3xs">
                    <ClockIcon className="h-2 w-2" />
                    <span>
                      {e.start || '00:00'} - {e.end || '00:00'}
                    </span>
                  </div>
                </div>
                <span className="text-dimmer group-hover:text-nexus text-3xs">»</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <EventModal
          event={editingEvent}
          onSave={handleSaveEvent}
          onClose={() => {
            setShowCreateModal(false)
            setEditingEvent(null)
          }}
        />
      )}

      {detailEvent && (
        <EventDetailsModal
          event={detailEvent}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onEdit={() => {
            setEditingEvent(detailEvent)
            setShowCreateModal(true)
            setDetailEvent(null)
          }}
          onJoinMeet={() => {
            setMeetEvent(detailEvent)
            setDetailEvent(null)
          }}
          onClose={() => setDetailEvent(null)}
        />
      )}

      {meetEvent && (
        <MeetFrame event={meetEvent} onClose={() => setMeetEvent(null)} />
      )}
    </section>
  )
}
