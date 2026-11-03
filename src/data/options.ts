import type { RecordStatus, Stage } from '../types/zenith'

export const CLIENTS: string[] = []

export const DEPOTS: string[] = []

export const QC_CODES = ['QC-A1', 'QC-A2', 'QC-A3', 'QC-B1', 'QC-B4', 'QC-C1', 'QC-C2', 'QC-D9', 'QC-E0']

export const STAGE_OPTIONS: { key: Stage; label: string; sla: number }[] = [
  { key: 'N/A', label: 'N/A (No Stage Progression)', sla: 0 },
  { key: 'INTERVIEW', label: 'Interview (20% SLA)', sla: 20 },
  { key: 'TRAINING', label: 'Training (40% SLA)', sla: 40 },
  { key: 'RIDE_ALONG', label: 'Ride along (60% SLA)', sla: 60 },
  { key: 'NURSERY', label: 'Nursery (80% SLA)', sla: 80 },
  { key: 'ONBOARDED', label: 'Onboarded (100% SLA)', sla: 100 },
]

/** Client status dropdown options specifically for Registry. */
export const REGISTRY_STATUS_OPTIONS: RecordStatus[] = ['ACTIVE', 'PAUSE', 'REVOKE']
export const CLIENT_STATUS_OPTIONS: RecordStatus[] = REGISTRY_STATUS_OPTIONS

/** Pipeline (Lead) status options - strict separation from Registry. */
export const PIPELINE_STATUS_OPTIONS: RecordStatus[] = [
  'ACTIVE',
  'ON_HOLD',
  'FILTERED',
  'ONBOARDED',
  'WITHDRAWN',
  'REJECTED',
]

/** Sub-options for records still moving through the pipeline. */
export const LIVE_STATUSES: RecordStatus[] = ['ACTIVE', 'FILTERED', 'ON_HOLD']

/** Statuses that close a record out of the pipeline into history. */
export const ARCHIVE_STATUSES: RecordStatus[] = ['ONBOARDED', 'REJECTED', 'WITHDRAWN']

/** All recognized system statuses. */
export const STATUSES: RecordStatus[] = [
  ...REGISTRY_STATUS_OPTIONS,
  ...PIPELINE_STATUS_OPTIONS.filter((s) => !REGISTRY_STATUS_OPTIONS.includes(s)),
]
