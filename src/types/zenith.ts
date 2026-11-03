export type Stage = 'N/A' | 'BLANK' | 'INTERVIEW' | 'TRAINING' | 'RIDE_ALONG' | 'NURSERY' | 'ONBOARDED'

export const STAGES: Stage[] = ['INTERVIEW', 'TRAINING', 'RIDE_ALONG', 'NURSERY', 'ONBOARDED']

export const STAGE_SLA_MAP: Record<Stage, number> = {
  'N/A': 0,
  BLANK: 0,
  INTERVIEW: 20,
  TRAINING: 40,
  RIDE_ALONG: 60,
  NURSERY: 80,
  ONBOARDED: 100,
}

export function stageLabel(stage: Stage | string): string {
  if (stage === 'N/A' || stage === 'NA' || stage === 'BLANK' || stage === 'Blank') return 'N/A'
  if (stage === 'RIDE_ALONG' || stage === 'RIDE-ALONG' || stage === 'Ride along') return 'RIDE-ALONG'
  if (stage === 'INTERVIEW') return 'INTERVIEW'
  if (stage === 'TRAINING') return 'TRAINING'
  if (stage === 'NURSERY') return 'NURSERY'
  if (stage === 'ONBOARDED') return 'ONBOARDED'
  return stage
}

export type RecordStatus =
  | 'ACTIVE'
  | 'PAUSE'
  | 'REVOKE'
  | 'PAUSED'
  | 'REVOKED'
  | 'FILTERED'
  | 'ON_HOLD'
  | 'ONBOARDED'
  | 'REJECTED'
  | 'WITHDRAWN'

export interface OperatorRecord {
  id: string
  codename: string
  operator: string
  client: string
  depot: string
  stage: Stage
  status: RecordStatus
  phone: string
  notes: string
  qc: string
  station: string
  startRow: string
  endRow: string
  sla: number
  createdAt?: string
  updatedAt: string
  lastAction?: 'NEW' | 'UPDATED'
  statusChangedAt?: string
  notesChangedAt?: string
  recordType?: 'CLIENT' | 'LEAD'
  address?: string
}

export interface GoogleMeetSpace {
  name: string
  meetingUri: string
  meetingCode: string
  config?: {
    accessType?: 'ACCESS_TYPE_UNSPECIFIED' | 'OPEN' | 'TRUSTED' | 'RESTRICTED'
    entryPointAccess?: 'ENTRY_POINT_ACCESS_UNSPECIFIED' | 'ALL' | 'CREATOR_APP_ONLY'
  }
  activeConference?: {
    conferenceRecord: string
  }
}

export interface LogLine {
  id: string
  ts: string
  operator: string
  action: string
  tone?: 'nexus' | 'hazard' | 'caution' | 'dim'
}

export type Rsvp = 'YES' | 'NO' | 'MAYBE' | 'PENDING'

export interface Guest {
  email: string
  rsvp: Rsvp
}

export interface CalendarEvent {
  id: string
  title: string
  date: string
  start: string
  end: string
  location: string
  description: string
  guests: Guest[]
  meet: boolean
}

export interface NexusFile {
  id: string
  name: string
  kind: 'DOC' | 'SHEET' | 'LOG' | 'MAP'
  size: string
  modified: string
  embedUrl?: string
  preview: string[]
}

export interface NexusDir {
  id: string
  name: string
  files: NexusFile[]
}

export interface NexusDrive {
  id: string
  name: string
  dirs: NexusDir[]
}

export interface UserFile {
  id: string
  name: string
  storagePath: string
  downloadURL: string
  size: number | string
  type: string
  folderId?: string | null
  createdAt?: any
  extractedText?: string
  summary?: string
  contentSnippet?: string
  content?: string
  isNote?: boolean
}

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailAttachmentMeta {
  filename: string
  mimeType: string
  size: number
  attachmentId?: string
}

export interface GmailMessageSummary {
  id: string
  threadId: string
  snippet: string
  date: string
  timestamp?: number
  from: string
  fromName: string
  fromEmail?: string
  to: string
  subject: string
  isUnread: boolean
  isStarred: boolean
  hasAttachments?: boolean
  labels?: string[]
  labelIds?: string[]
}

export interface GmailMessageDetail extends GmailMessageSummary {
  bodyText: string
  bodyHtml?: string
  attachments?: GmailAttachmentMeta[]
}

export interface GmailFullMessage extends GmailMessageSummary {
  bodyText: string
  bodyHtml: string
}

export interface AppNotification {
  id: string
  source: 'GMAIL' | 'MEET' | 'SYSTEM'
  title: string
  description: string
  timestamp: string
  unread: boolean
  actionUrl?: string
  targetTab?: ViewKey
  metadata?: Record<string, any>
}

export type ViewKey =
  | 'PIPELINE'
  | 'REGISTRY'
  | 'HISTORY'
  | 'DRIVE'
  | 'GMAIL'
  | 'NOTIFICATIONS'
  | 'MEET'
  | 'FILES'
  | 'MAP'
  | 'DASH'
export type DeviceMode = 'D' | 'T'
export type DashTab =
  | 'SUMMARY'
  | 'GOOGLE_DRIVE'
  | 'GMAIL'
  | 'NOTIFICATIONS'
  | 'GOOGLE_MEET'
  | 'MY_FILES'
  | 'HISTORY'
  | 'CALENDAR'

