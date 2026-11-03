import React, { useState } from 'react'
import {
  ExternalLinkIcon,
  MicIcon,
  VideoIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
  ShieldCheckIcon,
  UsersIcon,
  CalendarIcon,
  SparklesIcon,
} from 'lucide-react'
import type { CalendarEvent } from '../../types/zenith'
import { TermButton, Pill } from '../ui/Primitives'

function extractMeetUrl(event: CalendarEvent): string {
  if (event.description && event.description.includes('https://meet.google.com/')) {
    const match = event.description.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)
    if (match) return match[0]
  }
  if (event.location && event.location.includes('meet.google.com')) {
    return event.location
  }
  if (event.id && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(event.id)) {
    return `https://meet.google.com/${event.id}`
  }
  return 'https://meet.google.com/'
}

/** MeetFrame — Interview Launcher & Session Console */
export function MeetFrame({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const meetUrl = extractMeetUrl(event)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(meetUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div id="meetEmbedContainer" className="fixed inset-0 z-[60] flex flex-col bg-void/95 p-3 font-mono">
      {/* Top Bar */}
      <div className="flex items-center justify-between border border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-nexus" />
          <h2 className="text-3xs font-bold tracking-[0.2em] text-nexus">
            MEET_CONSOLE // {event.title.toUpperCase()}
          </h2>
          <span className="text-3xs text-dimmer">
            {event.date} {event.start}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-3xs text-dim sm:flex">
            <MicIcon className="h-3 w-3 text-nexus" aria-hidden /> READY
          </span>
          <TermButton tone="hazard" onClick={onClose} className="flex items-center gap-1">
            <XIcon className="h-3 w-3" aria-hidden />
            CLOSE
          </TermButton>
        </div>
      </div>

      {/* Main Grid */}
      <div className="relative mt-2 grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_260px]">
        {/* Main Stage */}
        <div className="relative flex min-h-0 flex-col items-center justify-center border border-nexus/40 bg-surface p-6 text-center">
          <div className="max-w-md space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center border border-nexus/60 bg-nexus/15 text-nexus shadow-[0_0_20px_rgba(0,240,255,0.2)]">
              <VideoIcon className="h-7 w-7" />
            </div>

            <div>
              <Pill className="border-nexus/40 bg-nexus/10 text-nexus mb-2">
                WORKSPACE VIDEO CONFERENCING
              </Pill>
              <h3 className="text-sm font-bold text-ink">{event.title}</h3>
              <p className="mt-1 text-2xs text-dim leading-relaxed">
                Google Meet requires opening in a dedicated browser window to grant camera, microphone, and identity permissions securely.
              </p>
            </div>

            {/* Room Link Box */}
            <div className="flex items-center justify-between border border-line bg-void px-3 py-2 text-left">
              <span className="text-2xs font-bold text-nexus truncate max-w-[280px]">
                {meetUrl}
              </span>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex items-center gap-1 border border-line bg-surface2 px-2 py-1 text-3xs text-dim hover:text-nexus hover:border-nexus shrink-0"
              >
                {copied ? <CheckIcon className="h-3 w-3 text-nexus" /> : <CopyIcon className="h-3 w-3" />}
                <span>{copied ? 'COPIED' : 'COPY LINK'}</span>
              </button>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <a
                href={meetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-nexus bg-nexus px-4 py-3 text-xs font-bold text-void hover:bg-nexus/90 transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)]"
              >
                <ExternalLinkIcon className="h-4 w-4" />
                <span>JOIN GOOGLE MEET ROOM</span>
              </a>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-3xs text-dimmer pt-1">
              <ShieldCheckIcon className="h-3 w-3 text-nexus" />
              <span>Direct encrypted WebRTC audio/video session</span>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="flex flex-col gap-2 min-h-0">
          {/* Participants */}
          <div className="border border-line bg-surface p-3">
            <div className="flex items-center gap-1.5 text-3xs font-bold text-dimmer uppercase mb-2">
              <UsersIcon className="h-3 w-3 text-nexus" />
              <span>PARTICIPANTS</span>
            </div>
            <ul className="space-y-1 term-scroll max-h-40 overflow-y-auto">
              {[{ email: 'you@zenith.os' }, ...(event.guests || [])].map((g, idx) => (
                <li
                  key={`${g.email}-${idx}`}
                  className="flex items-center gap-2 border border-line bg-void px-2 py-1 text-2xs text-ink"
                >
                  <VideoIcon className="h-3 w-3 text-nexus shrink-0" />
                  <span className="truncate">{g.email}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Session Details */}
          <div className="border border-line bg-surface p-3 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-3xs font-bold text-dimmer uppercase mb-2">
                <CalendarIcon className="h-3 w-3 text-caution" />
                <span>DIRECTIVES</span>
              </div>
              <p className="text-3xs text-dim leading-relaxed">
                {event.description || 'Live operator interview & candidate screening session.'}
              </p>
            </div>

            <div className="border-t border-line pt-2 text-3xs text-dimmer flex items-center gap-1">
              <SparklesIcon className="h-3 w-3 text-nexus" />
              <span>Zenith Workspace Bridge</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
