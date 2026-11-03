import type { OperatorRecord, RecordStatus, Stage } from '../types/zenith'

export interface StatusMeta {
  label: string
  text: string
  border: string
  bg: string
  left: string
  bar: string
  dot: string
}

export const defaultStatusMeta: StatusMeta = {
  label: 'ACTIVE',
  text: 'text-nexus',
  border: 'border-nexus/50',
  bg: 'bg-nexus/10',
  left: 'border-l-nexus',
  bar: 'bg-nexus',
  dot: 'status-dot status-dot-active',
}

export const statusMeta: Record<string, StatusMeta> = {
  ACTIVE: {
    label: 'ACTIVE',
    text: 'text-nexus',
    border: 'border-nexus/50',
    bg: 'bg-nexus/10',
    left: 'border-l-nexus',
    bar: 'bg-nexus',
    dot: 'status-dot status-dot-active',
  },
  // Legacy / fallback alias so any cached records format seamlessly as active
  PROCESSING: {
    label: 'ACTIVE',
    text: 'text-nexus',
    border: 'border-nexus/50',
    bg: 'bg-nexus/10',
    left: 'border-l-nexus',
    bar: 'bg-nexus',
    dot: 'status-dot status-dot-active',
  },
  FILTERED: {
    label: 'FILTERED',
    text: 'text-dim',
    border: 'border-line2',
    bg: 'bg-surface2',
    left: 'border-l-dim',
    bar: 'bg-dim',
    dot: 'status-dot status-dot-filtered',
  },
  'N/A': {
    label: 'N/A',
    text: 'text-dimmer',
    border: 'border-line/80',
    bg: 'bg-surface2/40',
    left: 'border-l-dimmer',
    bar: 'bg-dimmer/30',
    dot: 'status-dot status-dot-filtered',
  },
  NA: {
    label: 'N/A',
    text: 'text-dimmer',
    border: 'border-line/80',
    bg: 'bg-surface2/40',
    left: 'border-l-dimmer',
    bar: 'bg-dimmer/30',
    dot: 'status-dot status-dot-filtered',
  },
  ON_HOLD: {
    label: 'ON HOLD',
    text: 'text-caution',
    border: 'border-caution/60',
    bg: 'bg-caution/10',
    left: 'border-l-caution',
    bar: 'bg-caution',
    dot: 'status-dot status-dot-hold',
  },
  ONBOARDED: {
    label: 'ONBOARDED',
    text: 'text-onboard',
    border: 'border-onboard/50',
    bg: 'bg-onboard/10',
    left: 'border-l-onboard',
    bar: 'bg-onboard',
    dot: 'status-dot status-dot-onboarded',
  },
  REJECTED: {
    label: 'REJECTED',
    text: 'text-hazard',
    border: 'border-hazard/60',
    bg: 'bg-hazard/10',
    left: 'border-l-hazard',
    bar: 'bg-hazard',
    dot: 'status-dot status-dot-rejected',
  },
  WITHDRAWN: {
    label: 'WITHDRAWN',
    text: 'text-hazard',
    border: 'border-hazard/40',
    bg: 'bg-hazard/[0.06]',
    left: 'border-l-hazard',
    bar: 'bg-hazard/40',
    dot: 'status-dot status-dot-withdrawn',
  },
  PAUSE: {
    label: 'PAUSE',
    text: 'text-caution',
    border: 'border-caution/60',
    bg: 'bg-caution/10',
    left: 'border-l-caution',
    bar: 'bg-caution',
    dot: 'status-dot status-dot-hold',
  },
  PAUSED: {
    label: 'PAUSED',
    text: 'text-caution',
    border: 'border-caution/60',
    bg: 'bg-caution/10',
    left: 'border-l-caution',
    bar: 'bg-caution',
    dot: 'status-dot status-dot-hold',
  },
  REVOKE: {
    label: 'REVOKE',
    text: 'text-hazard',
    border: 'border-hazard/60',
    bg: 'bg-hazard/10',
    left: 'border-l-hazard',
    bar: 'bg-hazard',
    dot: 'status-dot status-dot-rejected',
  },
  REVOKED: {
    label: 'REVOKED',
    text: 'text-hazard',
    border: 'border-hazard/60',
    bg: 'bg-hazard/10',
    left: 'border-l-hazard',
    bar: 'bg-hazard',
    dot: 'status-dot status-dot-rejected',
  },
}

/** Safely returns metadata for any status string with robust fallback. */
export function getStatusMeta(status?: string | RecordStatus | null): StatusMeta {
  if (!status) return defaultStatusMeta
  return statusMeta[status] ?? {
    ...defaultStatusMeta,
    label: String(status).replace(/_/g, ' ').toUpperCase(),
  }
}

/** Statuses that need operator attention or block forward motion. */
export const isNegative = (status: RecordStatus): boolean =>
  status === 'REJECTED' ||
  status === 'REVOKE' ||
  status === 'REVOKED' ||
  status === 'WITHDRAWN' ||
  status === 'ON_HOLD' ||
  status === 'PAUSE' ||
  status === 'PAUSED' ||
  status === 'FILTERED'

/** Helper to determine if a client status is paused, revoked, or inactive */
export const isClientPausedOrRevoked = (status?: string | RecordStatus | null): boolean => {
  if (!status) return false
  const s = String(status).toUpperCase().trim()
  if (s === 'ACTIVE') return false
  return (
    s === 'PAUSE' ||
    s === 'PAUSED' ||
    s === 'REVOKE' ||
    s === 'REVOKED' ||
    s === 'ON_HOLD' ||
    s === 'HOLD' ||
    s === 'REJECTED' ||
    s === 'WITHDRAWN' ||
    s === 'INACTIVE' ||
    s === 'SUSPENDED' ||
    s === 'DISABLED' ||
    s.includes('PAUS') ||
    s.includes('REVOK')
  )
}

/**
 * Helper to extract all active clients from records, strictly filtering out any
 * clients that are paused or revoked.
 */
export const getActiveAvailableClients = (records: OperatorRecord[]): string[] => {
  const pausedOrRevoked = new Set<string>()
  const registeredActive = new Set<string>()
  const candidateClients = new Set<string>()

  for (const r of records) {
    const isClientRecord =
      r.recordType === 'CLIENT' ||
      (r.id && (r.id.startsWith('CL-') || r.id.startsWith('CLIENT-')))

    const clientName = (r.client || (isClientRecord ? r.operator : '') || '').trim()
    if (!clientName) continue

    const nameKey = clientName.toUpperCase()

    if (isClientRecord) {
      if (isClientPausedOrRevoked(r.status)) {
        pausedOrRevoked.add(nameKey)
      } else {
        registeredActive.add(clientName)
      }
    } else {
      // Candidate / lead record
      candidateClients.add(clientName)
    }
  }

  const result = new Set<string>()
  // Add registered active clients that are not paused/revoked
  for (const name of registeredActive) {
    if (!pausedOrRevoked.has(name.toUpperCase())) {
      result.add(name)
    }
  }

  // Add any candidate client names ONLY if there is no paused/revoked record for them
  for (const name of candidateClients) {
    if (!pausedOrRevoked.has(name.toUpperCase())) {
      result.add(name)
    }
  }

  return Array.from(result).sort((a, b) => a.localeCompare(b))
}

/** Statuses that are still moving forward under their own power. */
export const isProgressing = (status: RecordStatus): boolean =>
  status === 'ACTIVE' || status === 'ONBOARDED'

export const stageIndex = (stage: Stage, stages: Stage[]): number => stages.indexOf(stage)

export type Freshness = 'NEW' | 'UPDATED' | 'NO_UPDATE'

export function freshnessOf(recordOrIso: OperatorRecord | string): Freshness {
  let iso: string
  let lastAction: 'NEW' | 'UPDATED' | undefined

  if (typeof recordOrIso === 'string') {
    iso = recordOrIso
  } else {
    iso = recordOrIso.updatedAt || recordOrIso.createdAt || new Date().toISOString()
    lastAction = recordOrIso.lastAction
  }

  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours >= 48) return 'NO_UPDATE'

  if (lastAction === 'UPDATED') return 'UPDATED'
  if (lastAction === 'NEW') return 'NEW'

  if (hours >= 24) return 'UPDATED'
  return 'NEW'
}

export const freshnessColor: Record<Freshness, string> = {
  NEW: 'text-nexus',
  UPDATED: 'text-caution',
  NO_UPDATE: 'text-hazard',
}

export const freshnessLabel: Record<Freshness, string> = {
  NEW: 'NEW',
  UPDATED: 'UPDATED',
  NO_UPDATE: 'NO UPDATE',
}

export function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export const shortStamp = (iso: string): string =>
  new Date(iso).toISOString().slice(5, 16).replace('T', ' ')

export const nextRecordId = (ids: string[]): string => {
  const max = ids.reduce((acc, id) => {
    const n = Number(id.replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.max(acc, n) : acc
  }, 1000)
  return `ZX-${max + 1}`
}

export function formatBytes(bytes: number | string | undefined | null): string {
  if (typeof bytes === 'string' && isNaN(Number(bytes))) return bytes
  const num = Number(bytes)
  if (!num || isNaN(num) || num <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(num) / Math.log(k))
  return `${parseFloat((num / Math.pow(k, i)).toFixed(1))} ${sizes[i] || 'B'}`
}

export type CandidateHealth = 'NEW' | 'STATUS_UPDATED' | 'NO_UPDATE_STALE'

export interface CandidateHealthMeta {
  health: CandidateHealth
  label: string
  color: 'CYAN' | 'YELLOW' | 'RED'
  badgeText: string
  badgeBorder: string
  badgeBg: string
  dotClass: string
  cardBorderHover: string
}

/**
 * Computes candidate index & hygiene age-based status color per strict requirements:
 * - Cyan (🩵): BRAND NEW leads/candidates (< 24h old, unmodified intake).
 * - Yellow (💛): Existing candidate profiles where status/notes/directives are UPDATED, or touched within 24-48h.
 * - Red (❤️): Stale records NOT updated, touched, or interacted with for 24-48+ hours (> 48h).
 */
export function getCandidateHealth(
  record: OperatorRecord,
  lastUpdatedStamp?: string,
): CandidateHealthMeta {
  const stamp = lastUpdatedStamp || record.updatedAt || new Date().toISOString()
  const hoursSinceUpdate = (Date.now() - new Date(stamp).getTime()) / 3_600_000

  // 1. Red (❤️): Stale records not updated for > 48 hours
  if (hoursSinceUpdate >= 48) {
    const days = Math.floor(hoursSinceUpdate / 24)
    return {
      health: 'NO_UPDATE_STALE',
      label: `NO UPDATE (>${days}D)`,
      color: 'RED',
      badgeText: 'text-hazard',
      badgeBorder: 'border-hazard/60',
      badgeBg: 'bg-hazard/10',
      dotClass: 'bg-hazard shadow-[0_0_6px_rgba(255,59,48,0.8)]',
      cardBorderHover: 'hover:border-hazard/60',
    }
  }

  // 2. Yellow (💛): Status or notes were updated by operator, or touched within 24-to-48h window
  if (record.lastAction === 'UPDATED') {
    return {
      health: 'STATUS_UPDATED',
      label: 'UPDATED',
      color: 'YELLOW',
      badgeText: 'text-caution',
      badgeBorder: 'border-caution/60',
      badgeBg: 'bg-caution/10',
      dotClass: 'bg-caution shadow-[0_0_6px_rgba(255,230,0,0.8)]',
      cardBorderHover: 'hover:border-caution/60',
    }
  }

  // 3. Cyan (🩵): Brand new intake leads (<24h old and un-modified)
  if (record.lastAction === 'NEW' || hoursSinceUpdate < 24) {
    return {
      health: 'NEW',
      label: 'NEW (<24H)',
      color: 'CYAN',
      badgeText: 'text-nexus',
      badgeBorder: 'border-nexus/60',
      badgeBg: 'bg-nexus/10',
      dotClass: 'bg-nexus shadow-[0_0_6px_rgba(0,240,255,0.8)]',
      cardBorderHover: 'hover:border-nexus/60',
    }
  }

  // 4. Default: Yellow (Updated)
  return {
    health: 'STATUS_UPDATED',
    label: 'UPDATED (24-48H)',
    color: 'YELLOW',
    badgeText: 'text-caution',
    badgeBorder: 'border-caution/60',
    badgeBg: 'bg-caution/10',
    dotClass: 'bg-caution shadow-[0_0_6px_rgba(255,230,0,0.8)]',
    cardBorderHover: 'hover:border-caution/60',
  }
}

