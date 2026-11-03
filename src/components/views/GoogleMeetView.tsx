import React, { useState, useEffect } from 'react'
import {
  VideoIcon,
  PlusIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  UserCheckIcon,
  ShieldCheckIcon,
  RadioIcon,
  Loader2Icon,
  SparklesIcon,
  CalendarIcon,
  UsersIcon,
  Link2Icon,
  HistoryIcon,
  Trash2Icon,
  LockIcon,
  UnlockIcon,
  GlobeIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import {
  createGoogleMeetSpace,
  getGoogleMeetSpace,
  ensureWorkspaceAccessToken,
  createGoogleCalendarEvent,
} from '../../services/googleWorkspace'
import type { GoogleMeetSpace, OperatorRecord } from '../../types/zenith'
import { PanelHead, Pill, TermButton, inputCls } from '../ui/Primitives'
import { MeetFrame } from '../calendar/MeetFrame'

interface StoredMeetSession {
  meetingCode: string
  meetingUri: string
  name: string
  accessType: 'OPEN' | 'TRUSTED' | 'RESTRICTED'
  createdAt: string
  candidateName?: string
  candidateId?: string
}

export function GoogleMeetView() {
  const { records, updateRecord, pushToast, pushLog, device } = useZenith()
  const [accessType, setAccessType] = useState<'OPEN' | 'TRUSTED' | 'RESTRICTED'>('OPEN')
  const [loading, setLoading] = useState(false)
  const [currentSpace, setCurrentSpace] = useState<GoogleMeetSpace | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [history, setHistory] = useState<StoredMeetSession[]>([])
  const [activeFrameEvent, setActiveFrameEvent] = useState<any | null>(null)
  const [customMeetingCode, setCustomMeetingCode] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)

  const tablet = device === 'T'

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zenith_meet_history')
      if (saved) {
        setHistory(JSON.parse(saved))
      }
    } catch {
      // fallback
    }
  }, [])

  const saveToHistory = (session: StoredMeetSession) => {
    const next = [session, ...history.filter((h) => h.meetingCode !== session.meetingCode)].slice(0, 15)
    setHistory(next)
    try {
      localStorage.setItem('zenith_meet_history', JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem('zenith_meet_history')
    } catch {
      // ignore
    }
    pushToast({
      title: 'MEET HISTORY CLEARED',
      body: 'All local Google Meet session records cleared',
      tone: 'hazard',
    })
  }

  // Active leads available for interview link
  const pipelineLeads = records.filter(
    (r) => r.recordType !== 'CLIENT' && !r.id.startsWith('CL-') && r.status !== 'REJECTED' && r.status !== 'WITHDRAWN',
  )

  const handleCreateSpace = async () => {
    setLoading(true)
    pushLog('SYS', `Provisioning Google Meet space (access=${accessType})…`, 'nexus')
    try {
      await ensureWorkspaceAccessToken()
      const space = await createGoogleMeetSpace({
        accessType,
        entryPointAccess: 'ALL',
      })

      const formattedSpace: GoogleMeetSpace = {
        name: space.name,
        meetingUri: space.meetingUri,
        meetingCode: space.meetingCode,
        config: space.config,
        activeConference: space.activeConference,
      }

      setCurrentSpace(formattedSpace)

      // Associate with selected candidate if chosen
      const lead = pipelineLeads.find((l) => l.id === selectedLeadId)

      const historyItem: StoredMeetSession = {
        meetingCode: space.meetingCode,
        meetingUri: space.meetingUri,
        name: space.name,
        accessType,
        createdAt: new Date().toISOString(),
        candidateName: lead?.operator,
        candidateId: lead?.id,
      }
      saveToHistory(historyItem)

      if (lead) {
        const updatedNotes = `${lead.notes ? `${lead.notes}\n` : ''}[GOOGLE MEET INTERVIEW]: ${space.meetingUri}`
        await updateRecord(lead.id, 'notes', updatedNotes)
        pushToast({
          title: 'GOOGLE MEET PROVISIONED',
          body: `Meeting room ${space.meetingCode} created and attached to ${lead.operator}`,
          tone: 'nexus',
        })
      } else {
        pushToast({
          title: 'GOOGLE MEET PROVISIONED',
          body: `Live room active: ${space.meetingCode}`,
          tone: 'nexus',
        })
      }
      pushLog('SYS', `Google Meet created: ${space.meetingUri}`, 'nexus')
    } catch (err: any) {
      console.error('Failed to create Google Meet space:', err)
      pushToast({
        title: 'MEET PROVISION FAILED',
        body: err?.message || 'Check OAuth credentials or network connectivity',
        tone: 'hazard',
      })
      pushLog('SYS', `Meet API failed: ${err?.message}`, 'hazard')
    } finally {
      setLoading(false)
    }
  }

  const handleLookupSpace = async () => {
    if (!customMeetingCode.trim()) return
    setLookupLoading(true)
    const code = customMeetingCode.trim()
    pushLog('SYS', `Looking up Meet space ${code}…`, 'dim')
    try {
      const space = await getGoogleMeetSpace(code)
      setCurrentSpace({
        name: space.name,
        meetingUri: space.meetingUri,
        meetingCode: space.meetingCode,
        config: space.config,
        activeConference: space.activeConference,
      })
      pushToast({
        title: 'MEET SPACE CONNECTED',
        body: `Retrieved space ${space.meetingCode}`,
        tone: 'nexus',
      })
    } catch (err: any) {
      // Fallback: create standard meet link
      const fallbackUri = code.startsWith('http') ? code : `https://meet.google.com/${code}`
      setCurrentSpace({
        name: `spaces/${code}`,
        meetingUri: fallbackUri,
        meetingCode: code.replace('https://meet.google.com/', ''),
        config: { accessType: 'OPEN' },
      })
      pushToast({
        title: 'DIRECT MEET LINK SET',
        body: `Ready to join ${fallbackUri}`,
        tone: 'caution',
      })
    } finally {
      setLookupLoading(false)
    }
  }

  const copyUri = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // ignore
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleLinkToLead = async (leadId: string) => {
    if (!currentSpace) return
    const lead = pipelineLeads.find((l) => l.id === leadId)
    if (!lead) return

    const updatedNotes = `${lead.notes ? `${lead.notes}\n` : ''}[GOOGLE MEET INTERVIEW]: ${currentSpace.meetingUri}`
    await updateRecord(lead.id, 'notes', updatedNotes)
    pushToast({
      title: 'LINKED TO LEAD',
      body: `Meet link attached to ${lead.operator} [${lead.id}] directives (Marked as Updated)`,
      tone: 'caution',
    })
  }

  return (
    <div id="googleMeetView" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-void p-3 font-mono">
      {/* Header bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center border border-nexus/50 bg-nexus/15 text-nexus">
            <VideoIcon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              GOOGLE_MEET // COMMAND_CENTER
            </h1>
            <p className="text-3xs text-dimmer">
              GOOGLE WORKSPACE MEET v2 API &bull; INSTANT SECURE VIDEO SESSIONS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill className="border-nexus/40 bg-nexus/10 text-nexus">
            <RadioIcon className="mr-1 h-2.5 w-2.5 animate-pulse text-nexus" />
            MEET_API_READY
          </Pill>
        </div>
      </header>

      {/* Main Grid */}
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left Column: Create Instant Video Space & Controls */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          {/* Create Video Room Card */}
          <div className="border border-line bg-surface p-4">
            <PanelHead
              label="PROVISION_NEW_MEETING_SPACE"
              tone="nexus"
              right={<SparklesIcon className="h-3.5 w-3.5 text-nexus" />}
            />

            <div className="mt-4 space-y-4">
              {/* Access Policy Selector */}
              <div>
                <label className="mb-1.5 block text-3xs font-bold tracking-widest text-dimmer">
                  SECURITY & ACCESS POLICY
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccessType('OPEN')}
                    className={`flex flex-col items-center justify-center gap-1 border p-2.5 text-center transition-all ${
                      accessType === 'OPEN'
                        ? 'border-nexus bg-nexus/15 text-nexus shadow-[0_0_10px_rgba(0,240,255,0.2)] font-bold'
                        : 'border-line bg-void text-dim hover:border-line2 hover:text-ink'
                    }`}
                  >
                    <GlobeIcon className="h-4 w-4" />
                    <span className="text-2xs">OPEN ACCESS</span>
                    <span className="text-3xs text-dimmer">Anyone with link</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccessType('TRUSTED')}
                    className={`flex flex-col items-center justify-center gap-1 border p-2.5 text-center transition-all ${
                      accessType === 'TRUSTED'
                        ? 'border-caution bg-caution/15 text-caution shadow-[0_0_10px_rgba(255,184,0,0.2)] font-bold'
                        : 'border-line bg-void text-dim hover:border-line2 hover:text-ink'
                    }`}
                  >
                    <UnlockIcon className="h-4 w-4" />
                    <span className="text-2xs">TRUSTED ORG</span>
                    <span className="text-3xs text-dimmer">Workspace org</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccessType('RESTRICTED')}
                    className={`flex flex-col items-center justify-center gap-1 border p-2.5 text-center transition-all ${
                      accessType === 'RESTRICTED'
                        ? 'border-hazard bg-hazard/15 text-hazard shadow-[0_0_10px_rgba(255,59,48,0.2)] font-bold'
                        : 'border-line bg-void text-dim hover:border-line2 hover:text-ink'
                    }`}
                  >
                    <LockIcon className="h-4 w-4" />
                    <span className="text-2xs">RESTRICTED</span>
                    <span className="text-3xs text-dimmer">Invited guests only</span>
                  </button>
                </div>
              </div>

              {/* Associate with Candidate / Lead */}
              <div>
                <label className="mb-1.5 block text-3xs font-bold tracking-widest text-dimmer">
                  LINK TO PIPELINE CANDIDATE (OPTIONAL)
                </label>
                <div className="flex items-center gap-2">
                  <UserCheckIcon className="h-4 w-4 text-dimmer" />
                  <select
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className={`${inputCls} flex-1`}
                  >
                    <option value="">-- No Candidate (Ad-Hoc Meeting) --</option>
                    {pipelineLeads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.operator} [{lead.id}] - {lead.stage} ({lead.client})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Button */}
              <TermButton
                tone="nexus"
                onClick={handleCreateSpace}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 font-bold tracking-widest text-xs shadow-[0_0_12px_rgba(0,240,255,0.25)]"
              >
                {loading ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin text-nexus" />
                    <span>CONNECTING TO GOOGLE MEET API…</span>
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-4 w-4" />
                    <span>CREATE INSTANT GOOGLE MEET ROOM</span>
                  </>
                )}
              </TermButton>
            </div>
          </div>

          {/* Active / Current Provisioned Space */}
          {currentSpace && (
            <div className="border border-nexus/60 bg-surface p-4 shadow-[0_0_16px_rgba(0,240,255,0.1)]">
              <div className="flex items-center justify-between border-b border-nexus/30 pb-2">
                <div className="flex items-center gap-2 text-nexus">
                  <span className="h-2 w-2 animate-pulse-dot rounded-full bg-nexus" />
                  <h3 className="text-xs font-bold tracking-wider">ACTIVE GOOGLE MEET ROOM</h3>
                </div>
                <Pill className="border-nexus/50 bg-nexus/15 text-nexus">
                  CODE: {currentSpace.meetingCode}
                </Pill>
              </div>

              <div className="mt-3 space-y-3">
                {/* Meeting Link Box */}
                <div className="flex items-center justify-between border border-line bg-void px-3 py-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Link2Icon className="h-4 w-4 text-nexus shrink-0" />
                    <span className="text-2xs text-ink truncate font-bold">{currentSpace.meetingUri}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => copyUri(currentSpace.meetingUri)}
                      className="flex items-center gap-1 border border-line bg-surface2 px-2 py-1 text-3xs text-dim hover:text-nexus hover:border-nexus"
                      title="Copy full meeting link"
                    >
                      {copiedLink ? <CheckIcon className="h-3 w-3 text-nexus" /> : <CopyIcon className="h-3 w-3" />}
                      <span>{copiedLink ? 'COPIED' : 'COPY'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCode(currentSpace.meetingCode)}
                      className="flex items-center gap-1 border border-line bg-surface2 px-2 py-1 text-3xs text-dim hover:text-caution hover:border-caution"
                      title="Copy meeting code only"
                    >
                      {copiedCode ? <CheckIcon className="h-3 w-3 text-caution" /> : <CopyIcon className="h-3 w-3" />}
                      <span>{copiedCode ? 'CODE COPIED' : 'CODE'}</span>
                    </button>
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={currentSpace.meetingUri}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 border border-nexus bg-nexus px-3 py-2 font-mono text-2xs font-bold text-void hover:bg-nexus/90 transition-colors text-center"
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    <span>LAUNCH GOOGLE MEET</span>
                  </a>

                  <TermButton
                    tone="caution"
                    onClick={() => {
                      setActiveFrameEvent({
                        id: currentSpace.meetingCode,
                        title: `Interview Room [${currentSpace.meetingCode}]`,
                        date: new Date().toISOString().slice(0, 10),
                        start: 'NOW',
                        end: '+45m',
                        location: 'Google Meet',
                        description: `Google Meet Session: ${currentSpace.meetingUri}`,
                        guests: [],
                        meet: true,
                      })
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 font-bold"
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                    <span>INTERVIEW CONSOLE</span>
                  </TermButton>
                </div>

                {/* Attach to another lead */}
                <div className="border-t border-line pt-2.5">
                  <label className="text-3xs text-dimmer block mb-1">
                    ATTACH THIS ROOM TO PIPELINE CANDIDATE:
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          void handleLinkToLead(e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className={`${inputCls} flex-1`}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        -- Select Candidate to append Meet Link to Notes --
                      </option>
                      {pipelineLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.operator} [{lead.id}] - {lead.stage}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Join / Lookup by Code */}
          <div className="border border-line bg-surface p-4">
            <PanelHead label="JOIN_OR_LOOKUP_EXISTING_ROOM" />
            <div className="mt-3 flex items-center gap-2">
              <input
                value={customMeetingCode}
                onChange={(e) => setCustomMeetingCode(e.target.value)}
                placeholder="enter code (e.g. abc-defg-hij) or meet.google.com link…"
                className={`${inputCls} flex-1`}
                onKeyDown={(e) => e.key === 'Enter' && handleLookupSpace()}
              />
              <TermButton
                onClick={handleLookupSpace}
                disabled={lookupLoading || !customMeetingCode.trim()}
                tone="ghost"
              >
                {lookupLoading ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'CONNECT'}
              </TermButton>
            </div>
          </div>
        </div>

        {/* Right Column: Active Pipeline Candidates & Session History */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          {/* Candidates in Interview Stage */}
          <div className="flex flex-col border border-line bg-surface p-4">
            <PanelHead
              label="INTERVIEW_STAGE_PIPELINE"
              tone="nexus"
              right={
                <Pill className="border-nexus/40 bg-nexus/10 text-nexus">
                  {pipelineLeads.filter((l) => l.stage === 'INTERVIEW').length} CANDIDATES
                </Pill>
              }
            />
            <p className="mt-1 text-3xs text-dimmer">
              Candidates queued for initial or technical interview assessment:
            </p>

            <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto term-scroll">
              {pipelineLeads
                .filter((l) => l.stage === 'INTERVIEW')
                .map((lead) => (
                  <li
                    key={lead.id}
                    className="flex items-center justify-between border border-line bg-void px-2.5 py-1.5 hover:border-nexus/50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xs font-bold text-ink">{lead.operator}</span>
                        <span className="text-3xs text-dimmer">[{lead.id}]</span>
                      </div>
                      <span className="text-3xs text-nexus">
                        {lead.client} &bull; {lead.depot}
                        {lead.phone && (
                          <span className="text-white font-semibold"> &bull; TEL: {lead.phone}</span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lead.id)
                        void handleCreateSpace()
                      }}
                      className="flex items-center gap-1 border border-nexus/50 bg-nexus/10 px-2 py-1 text-3xs font-bold text-nexus hover:bg-nexus hover:text-void transition-colors"
                      title="Generate Google Meet room specifically for this candidate"
                    >
                      <VideoIcon className="h-3 w-3" />
                      <span>START MEET</span>
                    </button>
                  </li>
                ))}
              {pipelineLeads.filter((l) => l.stage === 'INTERVIEW').length === 0 && (
                <li className="py-4 text-center text-3xs text-dimmer">
                  NO CANDIDATES CURRENTLY IN INTERVIEW STAGE
                </li>
              )}
            </ul>
          </div>

          {/* Session History */}
          <div className="flex flex-1 flex-col border border-line bg-surface p-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-1.5 text-3xs font-bold tracking-widest text-dim">
                <HistoryIcon className="h-3.5 w-3.5 text-nexus" />
                <span>RECENT MEET SESSIONS</span>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="flex items-center gap-1 text-3xs text-dimmer hover:text-hazard transition-colors"
                >
                  <Trash2Icon className="h-3 w-3" />
                  <span>CLEAR</span>
                </button>
              )}
            </div>

            <ul className="mt-2.5 flex-1 space-y-1.5 overflow-y-auto term-scroll max-h-72">
              {history.map((h, i) => (
                <li
                  key={`${h.meetingCode}-${i}`}
                  className="flex items-center justify-between border border-line bg-void px-2.5 py-1.5"
                >
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs font-bold text-nexus">{h.meetingCode}</span>
                      {h.candidateName && (
                        <span className="text-3xs text-ink truncate max-w-[120px]">
                          ({h.candidateName})
                        </span>
                      )}
                    </div>
                    <span className="text-3xs text-dimmer">
                      {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {h.accessType}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={h.meetingUri}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-line bg-surface px-1.5 py-1 text-3xs text-dim hover:text-nexus hover:border-nexus"
                      title="Launch meeting in new tab"
                    >
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              ))}
              {history.length === 0 && (
                <li className="py-6 text-center text-3xs text-dimmer">
                  NO RECENT GOOGLE MEET SESSIONS PROVISIONED
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Embedded Meet Console / Frame Modal */}
      {activeFrameEvent && (
        <MeetFrame
          event={activeFrameEvent}
          onClose={() => setActiveFrameEvent(null)}
        />
      )}
    </div>
  )
}
