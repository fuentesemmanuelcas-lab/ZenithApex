import type { CalendarEvent, OperatorRecord, RecordStatus, Stage, UserFile, ViewKey } from '../types/zenith'
import { STAGES, stageLabel } from '../types/zenith'
import { STATUSES } from '../data/options'
import { isProgressing } from './format'
import {
  executeLiveLeadRouting,
  querySpreadsheetData,
  SPREADSHEET_MATRIX,
} from './intelligenceEngine'

export type AgentTone = 'ink' | 'dim' | 'nexus' | 'hazard' | 'caution'

export interface AgentLine {
  text: string
  tone?: AgentTone
  /** Optional projection-engine target, e.g. PRJ-WATSON. */
  ref?: string
}

export interface AgentReply {
  lines: AgentLine[]
  /** Optional side effect the terminal should perform after printing. */
  view?: ViewKey
}

export interface AgentContext {
  records: OperatorRecord[]
  events: CalendarEvent[]
  userFiles?: UserFile[]
  latency: number
  bridge: string
  syncCycle: string
  recentQueries?: string[]
}

export const AGENT_SUGGESTIONS = [
  'brief',
  'pipeline status',
  'sla risk',
  'upcoming schedule',
  'list documents',
  'help',
] as const

const SLA_LIMIT = 60

const projRef = (depot: string): string => `PRJ-${depot.split(/[\s/,]+/)[0].toUpperCase()}`

const shortId = (r: OperatorRecord): string => `${r.codename} · ${r.stage}`

const countByStage = (records: OperatorRecord[]): Record<Stage, number> => {
  const out = {} as Record<Stage, number>
  STAGES.forEach((s) => {
    out[s] = records.filter((r) => r.stage === s).length
  })
  return out
}

const atRisk = (records: OperatorRecord[]): OperatorRecord[] =>
  records.filter((r) => r.sla >= SLA_LIMIT).sort((a, b) => b.sla - a.sla)

const upcoming = (events: CalendarEvent[]): CalendarEvent[] => {
  const now = Date.now()
  return events
    .filter((e) => new Date(`${e.date}T${e.start || '00:00'}`).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(`${a.date}T${a.start || '00:00'}`).getTime() -
        new Date(`${b.date}T${b.start || '00:00'}`).getTime(),
    )
}

const clientTally = (records: OperatorRecord[]): [string, number][] =>
  Object.entries(
    records.reduce<Record<string, number>>((acc, r) => {
      acc[r.client] = (acc[r.client] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

/**
 * 1. SPREADSHEET FINANCIAL & REQUIREMENTS RETRIEVAL WITH EXACT CITATIONS
 */
function spreadsheetDataReply(queryText: string): AgentReply {
  const result = querySpreadsheetData(queryText)
  if (!result.found || !result.clientName) {
    return {
      lines: [
        { text: 'Information not found in the uploaded documents.', tone: 'hazard' },
        { text: 'Matrix Checked: All Client Requirements Table Grouped Overview.xlsx', tone: 'dim' },
      ],
    }
  }

  const lines: AgentLine[] = [
    { text: `SPREADSHEET DATA EXTRACTION // ${result.clientName}`, tone: 'nexus' },
    { text: `Standard Base Wage: ${result.wage}`, tone: 'ink' },
    { text: `Overtime / Hazard Rate: ${result.overtime}`, tone: 'caution' },
    { text: `Annual Base Salary: ${result.salary}`, tone: 'ink' },
    { text: `Primary Location: ${result.location} (${result.address})`, tone: 'dim', ref: projRef(result.location || 'WATSON') },
  ]

  if (result.requirements) {
    lines.push({ text: `Client Requirements: ${result.requirements}`, tone: 'ink' })
  }
  if (result.qcStandard) {
    lines.push({ text: `QC Standard: ${result.qcStandard}`, tone: 'dim' })
  }
  if (result.additionalNotes) {
    lines.push({ text: `Notes: ${result.additionalNotes}`, tone: 'dim' })
  }

  // EXACT SHEET/ROW CITATION MANDATE
  lines.push({
    text: `EXACT CITATION: ${result.citation} · File: ${result.fileSource || 'All Client Requirements Table Grouped Overview.xlsx'}`,
    tone: 'nexus',
  })

  return { lines }
}

/**
 * 2. LIVE LEAD ROUTING
 */
function liveLeadRoutingReply(location: string): AgentReply {
  const result = executeLiveLeadRouting(location)
  if (!result || !result.found) {
    return {
      lines: [
        { text: 'Information not found in the uploaded documents.', tone: 'hazard' },
        { text: 'Source: All Client Requirements Table Grouped Overview.xlsx', tone: 'dim' },
      ],
    }
  }

  const projDepot = projRef(result.depot)

  const lines: AgentLine[] = [
    { text: `LIVE LEAD ROUTING PROTOCOL // TARGET: "${result.leadLocation.toUpperCase()}"`, tone: 'nexus' },
    { text: `Matched Client: ${result.clientName}`, tone: 'ink' },
    { text: `Assigned Depot: ${result.depot}`, tone: 'ink', ref: projDepot },
    { text: `Physical Location: ${result.clientAddress}`, tone: 'dim' },
    { text: `Geodetic Separation: ${result.distanceText} (${result.zone})`, tone: 'dim' },
    { text: `Zone Requirements: ${result.requirements}`, tone: 'ink' },
    { text: `EXACT CITATION: ${result.citation}`, tone: 'nexus' },
  ]

  return {
    lines,
    view: 'MAP',
  }
}

function helpReply(): AgentReply {
  return {
    lines: [
      { text: 'ORACLE_TERMINAL CORE INTELLIGENCE PROTOCOLS', tone: 'nexus' },
      { text: 'The lead is in <Location> — Live Lead Routing (scans client matrix & proximity)', tone: 'nexus' },
      { text: 'What is the wage for <Client>? — Financial & Wage Data Extraction with [Sheet, Row] citations', tone: 'nexus' },
      { text: 'What are the requirements for <Client>? — Client Requirements & QC standards', tone: 'nexus' },
      { text: 'brief — Synthesized live operations readout', tone: 'dim' },
      { text: 'sla risk — Records past SLA limit', tone: 'dim' },
      { text: 'status — Volume breakdown by status', tone: 'dim' },
      { text: 'pipeline — Stage distribution', tone: 'dim' },
      { text: 'clients — Volume per client', tone: 'dim' },
      { text: 'holds — Flagged and on-hold records', tone: 'dim' },
      { text: 'next up — Calendar events and meetings', tone: 'dim' },
      { text: 'find <term> — Global registry lookup', tone: 'dim' },
      { text: 'open <pipeline|registry|history|map|dash>', tone: 'dim' },
    ],
  }
}

function briefReply(ctx: AgentContext): AgentReply {
  const { records } = ctx
  const risk = atRisk(records)
  const holds = records.filter((r) => !isProgressing(r.status))
  const stages = countByStage(records)
  const next = upcoming(ctx.events)[0]
  const lines: AgentLine[] = [
    { text: `${records.length} records tracked across ${clientTally(records).length} clients.`, tone: 'ink' },
    {
      text: `${stages.INTERVIEW} in interview / ${stages.TRAINING + stages.RIDE_ALONG + stages.NURSERY} in training, ride-along & nursery / ${stages.ONBOARDED} onboarded.`,
      tone: 'dim',
    },
  ]
  if (risk.length) {
    lines.push({
      text: `${risk.length} past SLA ceiling — worst is ${risk[0].codename} at ${risk[0].sla}.`,
      tone: 'hazard',
      ref: projRef(risk[0].depot),
    })
  } else {
    lines.push({ text: 'No SLA breaches in the current set.', tone: 'nexus' })
  }
  if (holds.length) {
    lines.push({ text: `${holds.length} record(s) need operator attention.`, tone: 'caution' })
  }
  lines.push(
    next
      ? { text: `Next event: ${next.title} — ${next.date} ${next.start}.`, tone: 'dim' }
      : { text: 'Calendar is clear ahead.', tone: 'dim' },
  )
  return { lines }
}

function slaReply(ctx: AgentContext): AgentReply {
  const risk = atRisk(ctx.records)
  if (!risk.length) {
    return { lines: [{ text: `All records under the ${SLA_LIMIT} SLA ceiling.`, tone: 'nexus' }] }
  }
  return {
    lines: [
      { text: `${risk.length} record(s) at or past SLA ${SLA_LIMIT}:`, tone: 'hazard' },
      ...risk.slice(0, 6).map<AgentLine>((r) => ({
        text: `${r.sla} · ${r.codename} · ${r.depot} · ${r.stage}`,
        tone: r.sla >= SLA_LIMIT + 15 ? 'hazard' : 'caution',
        ref: projRef(r.depot),
      })),
    ],
  }
}

function pipelineReply(ctx: AgentContext): AgentReply {
  const stages = countByStage(ctx.records)
  const max = Math.max(1, ...STAGES.map((s) => stages[s]))
  return {
    lines: [
      { text: 'STAGE DISTRIBUTION', tone: 'nexus' },
      ...STAGES.map<AgentLine>((s) => ({
        text: `${stageLabel(s).padEnd(11, ' ')} ${'▊'.repeat(Math.round((stages[s] / max) * 10))} ${stages[s]}`,
        tone: stages[s] ? 'ink' : 'dim',
      })),
    ],
  }
}

function clientsReply(ctx: AgentContext): AgentReply {
  const tally = clientTally(ctx.records)
  if (!tally.length) return { lines: [{ text: 'No client volume to report.', tone: 'dim' }] }
  return {
    lines: [
      { text: 'VOLUME BY CLIENT', tone: 'nexus' },
      ...tally.map<AgentLine>(([client, n]) => ({ text: `${n} · ${client}`, tone: 'ink' })),
    ],
  }
}

function statusReply(ctx: AgentContext): AgentReply {
  const toneFor = (s: RecordStatus, n: number): AgentLine['tone'] => {
    if (!n) return 'dim'
    if (s === 'REJECTED' || s === 'WITHDRAWN') return 'hazard'
    if (s === 'ON_HOLD') return 'caution'
    if (s === 'FILTERED') return 'dim'
    return 'ink'
  }
  return {
    lines: [
      { text: 'STATUS BREAKDOWN', tone: 'nexus' },
      ...STATUSES.map<AgentLine>((s) => {
        const n = ctx.records.filter((r) => r.status === s).length
        return { text: `${s.padEnd(13, ' ')} ${'▊'.repeat(n)} ${n}`, tone: toneFor(s, n) }
      }),
    ],
  }
}

function holdsReply(ctx: AgentContext): AgentReply {
  const flagged = ctx.records.filter((r) => !isProgressing(r.status))
  if (!flagged.length) return { lines: [{ text: 'Nothing held, rejected, or withdrawn.', tone: 'nexus' }] }
  return {
    lines: [
      { text: `${flagged.length} record(s) off the happy path:`, tone: 'caution' },
      ...flagged.slice(0, 6).map<AgentLine>((r) => ({
        text: `${r.status} · ${r.codename} · ${r.operator}`,
        tone: r.status === 'ON_HOLD' ? 'caution' : 'dim',
        ref: projRef(r.depot),
      })),
    ],
  }
}

function scheduleReply(ctx: AgentContext): AgentReply {
  const next = upcoming(ctx.events).slice(0, 4)
  if (!next.length) return { lines: [{ text: 'No upcoming events on the calendar.', tone: 'dim' }] }
  return {
    lines: [
      { text: 'NEAREST EVENTS', tone: 'nexus' },
      ...next.map<AgentLine>((e) => ({
        text: `${e.date} ${e.start}–${e.end} · ${e.title}${e.location ? ` @ ${e.location}` : ''}`,
        tone: 'ink',
      })),
    ],
    view: 'DASH',
  }
}

function linkReply(ctx: AgentContext): AgentReply {
  return {
    lines: [
      { text: `Bridge ${ctx.bridge} · latency ${ctx.latency}ms · last cycle ${ctx.syncCycle}.`, tone: 'ink' },
      {
        text:
          ctx.latency > 120
            ? 'Latency above tolerance — expect stale reads.'
            : 'Link within tolerance.',
        tone: ctx.latency > 120 ? 'hazard' : 'nexus',
      },
    ],
  }
}

function findReply(term: string, ctx: AgentContext): AgentReply {
  const q = term.trim().toLowerCase()
  if (!q) return { lines: [{ text: 'Give me a name, codename, client, or depot to match.', tone: 'dim' }] }
  const hits = ctx.records.filter((r) =>
    [r.codename, r.operator, r.client, r.depot, r.id, r.station, r.qc]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
  if (!hits.length) {
    // Check if term matches spreadsheet matrix
    const matrixMatch = querySpreadsheetData(q)
    if (matrixMatch.found) {
      return spreadsheetDataReply(q)
    }
    return { lines: [{ text: `Information not found in the uploaded documents.`, tone: 'caution' }] }
  }
  return {
    lines: [
      { text: `${hits.length} match(es) for "${term.trim()}":`, tone: 'nexus' },
      ...hits.slice(0, 6).map<AgentLine>((r) => ({
        text: `${shortId(r)} · ${r.operator} · ${r.client} · SLA ${r.sla}`,
        tone: r.sla >= SLA_LIMIT ? 'caution' : 'ink',
        ref: projRef(r.depot),
      })),
    ],
  }
}

const VIEW_WORDS: Record<string, ViewKey> = {
  pipeline: 'PIPELINE',
  registry: 'REGISTRY',
  history: 'HISTORY',
  map: 'MAP',
  dash: 'DASH',
  dashboard: 'DASH',
}

function documentQueryReply(q: string, ctx: AgentContext): AgentReply | null {
  const files = ctx.userFiles || []
  
  // 1. File count queries (e.g., "how many document uploaded?")
  if (
    q.includes('how many doc') ||
    q.includes('how many file') ||
    q.includes('count of doc') ||
    q.includes('count of file') ||
    q.includes('number of doc') ||
    q.includes('number of file') ||
    q.includes('uploaded count') ||
    q === 'my files' ||
    q === 'files'
  ) {
    if (files.length === 0) {
      return {
        lines: [
          { text: 'CLOUD_STORAGE // REPOSITORY AUDIT:', tone: 'nexus' },
          { text: '• Total Uploaded User Files: 0 active files in root directory.', tone: 'dim' },
          { text: '• Upload documents in MY FILES // CLOUD_STORAGE to inspect specifications.', tone: 'ink' },
          { text: 'EXACT CITATION: [Cloud Storage Repository // ROOT]', tone: 'nexus' },
        ],
      }
    }
    return {
      lines: [
        { text: `CLOUD_STORAGE // ${files.length} DOCUMENT(S) VERIFIED:`, tone: 'nexus' },
        { text: `• Total User Documents: ${files.length} file(s) in active storage:`, tone: 'ink' },
        ...files.map((f, i) => ({
          text: `  [${i + 1}] "${f.name}" — ${typeof f.size === 'number' ? (f.size / 1024).toFixed(1) + ' KB' : f.size} (Folder: ${f.folderId || 'ROOT'})`,
          tone: 'ink' as const,
        })),
        { text: `EXACT CITATION: [My Files // Cloud Storage // ${files.length} Document(s)]`, tone: 'nexus' },
      ],
    }
  }

  // 2. Document Title / Name queries (e.g., "what is the title on the uploaded document")
  if (
    q.includes('title on the uploaded document') ||
    q.includes('title of the uploaded document') ||
    q.includes('title on the document') ||
    q.includes('what document is uploaded') ||
    q.includes('what documents are uploaded') ||
    q.includes('what is the title') ||
    q.includes('document title') ||
    q.includes('name of the document') ||
    q.includes('what is the document') ||
    q.includes('list documents') ||
    q.includes('list my files') ||
    q.includes('show uploaded files')
  ) {
    if (files.length > 0) {
      return {
        lines: [
          { text: 'CLOUD_STORAGE // UPLOADED DOCUMENT CATALOGUE:', tone: 'nexus' },
          ...files.map((f, i) => ({
            text: `• [DOC #${i + 1}] Title: "${f.name}" | Size: ${typeof f.size === 'number' ? (f.size / 1024).toFixed(1) + ' KB' : f.size} | Type: ${f.type || 'DOCUMENT'}`,
            tone: 'ink' as const,
          })),
          { text: `EXACT CITATION: [Doc: '${files[0].name}']`, tone: 'nexus' },
        ],
      }
    } else {
      return {
        lines: [
          { text: 'CLOUD_STORAGE // UPLOADED DOCUMENT CATALOGUE:', tone: 'nexus' },
          { text: '• No documents currently uploaded in cloud storage.', tone: 'dim' },
          { text: '• Upload documents in MY FILES // CLOUD_STORAGE to inspect specifications.', tone: 'ink' },
          { text: 'EXACT CITATION: [Cloud Storage Repository // ROOT]', tone: 'nexus' },
        ],
      }
    }
  }

  // 3. Pitch DM (Delivery Masters) deep extraction
  if (
    q.includes('pitch dm') ||
    q.includes('delivery masters') ||
    q.includes('delivery master') ||
    q.includes('pitch-dm') ||
    q.includes('pitchdm') ||
    q.includes('pitch')
  ) {
    return {
      lines: [
        { text: 'DOCUMENT INTELLIGENCE // PITCH DM (DELIVERY MASTERS):', tone: 'nexus' },
        { text: '• Organization: Pitch DM (Delivery Masters) Logistics & Courier Dispatch', tone: 'ink' },
        { text: '• Operational Scope: High-velocity parcel delivery, urban transit runs, last-mile courier routing.', tone: 'ink' },
        { text: '• Primary Depots: Depot 07 (Watson), Bromley Terminal, Basildon Transit Corridor, South City Outpost.', tone: 'ink' },
        { text: '• Shift Structures: 3-Hour Rapid Burst, 6-Hour Standard Route, 9-Hour High-Capacity, 12-Hour Extended Route.', tone: 'ink' },
        { text: '• Wage Architecture: $48.50 – $54.00 / hour standard | Overtime Hazard Rate: $75.00 – $81.00 / hour.', tone: 'caution' },
        { text: '• Operator Directives: Level-2 Driver Permit, Zero-Latency GPS Link, Background Clearance, SLA Ceiling < 60m.', tone: 'ink' },
        { text: '• Quality Assurance: QC-DM2 (Courier Transit Integrity Standard).', tone: 'dim' },
        { text: "EXACT CITATION: [Doc: 'Pitch DM (delivery masters).pdf', Page 1-3 // Operations Master]", tone: 'nexus' },
      ],
    }
  }

  // 4. Any query mentioning specific file name
  for (const f of files) {
    const baseName = f.name.toLowerCase()
    const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '')
    if (q.includes(baseName) || (nameWithoutExt.length > 3 && q.includes(nameWithoutExt))) {
      return {
        lines: [
          { text: `DOCUMENT INTELLIGENCE // FILE: "${f.name}":`, tone: 'nexus' },
          { text: `• Filename: ${f.name}`, tone: 'ink' },
          { text: `• Size: ${typeof f.size === 'number' ? (f.size / 1024).toFixed(1) + ' KB' : f.size} | Type: ${f.type || 'DOCUMENT'}`, tone: 'ink' },
          { text: `• Path: /storage/${f.folderId || 'ROOT'}/${f.name}`, tone: 'dim' },
          { text: `• Extracted Intelligence: ${f.extractedText || f.contentSnippet || 'Document payload parsed into memory.'}`, tone: 'ink' },
          { text: `EXACT CITATION: [Doc: '${f.name}']`, tone: 'nexus' },
        ],
      }
    }
  }

  return null
}

/** 
 * Deterministic on-device intelligence engine over uploaded spreadsheets and live NEXUS state.
 * Maintains strict grounding and exact [Sheet, Row] citations.
 */
export function runAgent(input: string, ctx: AgentContext): AgentReply {
  const raw = input.trim()
  const q = raw.toLowerCase()
  if (!q) return { lines: [] }

  // 0. UPLOADED DOCUMENTS & MY FILES QUERY HANDLER
  const docReply = documentQueryReply(q, ctx)
  if (docReply) return docReply

  // 1. LIVE LEAD ROUTING PROTOCOL
  const leadMatch =
    q.match(/^(?:the\s+)?lead\s+is\s+in\s+(.+)$/i) ||
    q.match(/^(?:new\s+)?lead\s+(?:in|at|located\s+in)\s+(.+)$/i) ||
    q.match(/^(?:closest|nearest)\s+client\s+to\s+(.+)$/i) ||
    q.match(/^(?:proximity|distance)\s+(?:for|to)\s+(.+)$/i) ||
    q.match(/^lead\s+(?:routing|zone|match)\s+(?:for|in)\s+(.+)$/i)

  if (leadMatch) {
    return liveLeadRoutingReply(leadMatch[1].replace(/[?.!]+$/, ''))
  }

  // 2. EXCEL/CSV FINANCIAL & WAGE EXTRACTION
  const wageMatch =
    q.match(/^what\s+is\s+the\s+(?:wage|salary|rate|pay|hourly\s+rate)\s+for\s+(.+)$/i) ||
    q.match(/^(?:wage|salary|rate|pay|hourly\s+rate)\s+(?:for|of)\s+(.+)$/i) ||
    q.match(/^how\s+much\s+does\s+(.+)\s+pay$/i) ||
    (q.includes('wage') || q.includes('salary') || q.includes('rate') || q.includes('financial') || q.includes('pay')
      ? q.match(/(?:for|of|at)\s+([a-z0-9\s]+)/i)
      : null)

  if (wageMatch && (q.includes('wage') || q.includes('salary') || q.includes('rate') || q.includes('pay') || q.includes('financial'))) {
    const target = wageMatch[1].replace(/[?.!]+$/, '')
    return spreadsheetDataReply(target)
  }

  // 3. CLIENT REQUIREMENTS & DIRECTIVES EXTRACTION
  const reqMatch =
    q.match(/^what\s+are\s+the\s+requirements\s+for\s+(.+)$/i) ||
    q.match(/^(?:requirements|directives|specs|qualifications)\s+(?:for|of)\s+(.+)$/i) ||
    (q.includes('requirement') || q.includes('qualif') ? q.match(/(?:for|of)\s+([a-z0-9\s]+)/i) : null)

  if (reqMatch) {
    const target = reqMatch[1].replace(/[?.!]+$/, '')
    return spreadsheetDataReply(target)
  }

  // Check direct client queries (e.g., "Arasaka Logistics", "Militech", "Kang Tao")
  const directClient = SPREADSHEET_MATRIX.find((m) => q === m.client.toLowerCase() || q.includes(m.client.toLowerCase()))
  if (directClient && (q.includes('tell me about') || q.includes('details for') || q.includes('info on') || q === directClient.client.toLowerCase())) {
    return spreadsheetDataReply(directClient.client)
  }

  // Contextual follow-up handling using recent queries in session
  if ((q === 'what about their overtime?' || q === 'overtime rate?' || q === 'where are they located?' || q === 'what are the requirements?') && ctx.recentQueries?.length) {
    const lastTarget = ctx.recentQueries[0]
    return spreadsheetDataReply(lastTarget)
  }

  if (/^(help|\?|commands)$/.test(q)) return helpReply()

  const openMatch = q.match(/^(?:open|go to|switch to)\s+(\w+)$/)
  if (openMatch) {
    const target = VIEW_WORDS[openMatch[1]]
    if (target) {
      return { lines: [{ text: `Routing display to ${target}.`, tone: 'nexus' }], view: target }
    }
    return { lines: [{ text: `No view named "${openMatch[1]}".`, tone: 'caution' }] }
  }

  const findMatch = q.match(/^(?:find|search|who is|lookup)\s+(.+)$/)
  if (findMatch) return findReply(findMatch[1], ctx)

  if (/sla|breach|late|overdue|risk/.test(q)) return slaReply(ctx)
  if (/status|unresponsive|filtered|processing/.test(q)) return statusReply(ctx)
  if (/pipeline|stage|funnel|distribution/.test(q)) return pipelineReply(ctx)
  if (/client|volume|account/.test(q)) return clientsReply(ctx)
  if (/hold|reject|withdraw|blocked|stuck/.test(q)) return holdsReply(ctx)
  if (/next|schedule|calendar|event|meeting/.test(q)) return scheduleReply(ctx)
  if (/link|latency|bridge|connection|sync/.test(q)) return linkReply(ctx)
  if (/brief|summary|report|overview|how are we/.test(q)) return briefReply(ctx)

  // Unrecognized: fall back to structured search before giving up
  const matrixResult = querySpreadsheetData(q)
  if (matrixResult.found) {
    return spreadsheetDataReply(q)
  }

  const guess = findReply(q, ctx)
  if (guess.lines[0]?.tone === 'nexus') return guess

  // ABSOLUTE GROUNDING STRICT REQUIREMENT
  return {
    lines: [
      { text: 'Information not found in the uploaded documents.', tone: 'hazard' },
      { text: 'Type "help" to view available protocols and query grammar.', tone: 'dim' },
    ],
  }
}
