import { getCachedAccessToken, setCachedAccessToken, signInWithGooglePopup, WORKSPACE_SCOPES } from '../utils/authStore'
import type { CalendarEvent, GmailFullMessage, GmailMessageSummary, OperatorRecord } from '../types/zenith'

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string | number
  modifiedTime?: string
  webViewLink?: string
  webContentLink?: string
  iconLink?: string
  thumbnailLink?: string
  trashed?: boolean
  parents?: string[]
  owners?: { displayName: string; emailAddress: string; photoLink?: string }[]
}

export interface GoogleSheetMetadata {
  spreadsheetId: string
  properties: {
    title: string
    locale?: string
    timeZone?: string
  }
  sheets: {
    properties: {
      sheetId: number
      title: string
      index: number
      gridProperties?: {
        rowCount: number
        columnCount: number
      }
    }
  }[]
  spreadsheetUrl: string
}

export interface SheetValuesResult {
  range: string
  majorDimension: 'ROWS' | 'COLUMNS'
  values?: (string | number | boolean | null)[][]
}

/**
 * Gets a valid OAuth access token for Workspace APIs.
 * If no token is cached, triggers a Google Sign-In with popup.
 */
export async function ensureWorkspaceAccessToken(): Promise<string> {
  const existing = getCachedAccessToken()
  if (existing) return existing

  const result = await signInWithGooglePopup(WORKSPACE_SCOPES)
  const token = getCachedAccessToken()
  if (!result.success || !token) {
    throw new Error(result.error || 'Authentication required to access Google Workspace.')
  }
  return token
}

/**
 * Helper to make authenticated requests to Google APIs.
 */
async function fetchGoogleApi<T>(
  url: string,
  options: RequestInit = {},
  retryOnAuth = true,
): Promise<T> {
  const token = await ensureWorkspaceAccessToken()
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, { ...options, headers })

  if (response.status === 401 && retryOnAuth) {
    // Token might be expired, clear cache and retry once
    setCachedAccessToken(null)
    return fetchGoogleApi<T>(url, options, false)
  }

  if (!response.ok) {
    let errorDetail = `Google API error: ${response.status} ${response.statusText}`
    try {
      const errJson = await response.json()
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message
      }
    } catch {
      // fallback to statusText
    }

    // If scopes are insufficient or forbidden, invalidate cached token
    if (
      response.status === 403 &&
      (errorDetail.toLowerCase().includes('insufficient') ||
        errorDetail.toLowerCase().includes('scope') ||
        errorDetail.toLowerCase().includes('permission'))
    ) {
      setCachedAccessToken(null)
    }

    throw new Error(errorDetail)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}

/* ==========================================================================
   GOOGLE DRIVE API (v3)
   ========================================================================== */

/**
 * Lists files from user's Google Drive.
 */
export async function listDriveFiles(params?: {
  folderId?: string
  query?: string
  pageSize?: number
  pageToken?: string
  mimeTypeFilter?: string
}): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
  const searchParams = new URLSearchParams()
  searchParams.set('pageSize', String(params?.pageSize || 40))
  searchParams.set(
    'fields',
    'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,trashed,parents,owners)',
  )
  searchParams.set('orderBy', 'folder,modifiedTime desc')

  const queryParts: string[] = ['trashed = false']

  if (params?.folderId) {
    queryParts.push(`'${params.folderId}' in parents`)
  }

  if (params?.query && params.query.trim()) {
    const escaped = params.query.replace(/'/g, "\\'")
    queryParts.push(`name contains '${escaped}'`)
  }

  if (params?.mimeTypeFilter) {
    queryParts.push(`mimeType = '${params.mimeTypeFilter}'`)
  }

  searchParams.set('q', queryParts.join(' and '))

  if (params?.pageToken) {
    searchParams.set('pageToken', params.pageToken)
  }

  return fetchGoogleApi<{ files: GoogleDriveFile[]; nextPageToken?: string }>(
    `https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`,
  )
}

/**
 * Creates a folder in Google Drive.
 */
export async function createDriveFolder(
  name: string,
  parentId?: string,
): Promise<GoogleDriveFile> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) {
    body.parents = [parentId]
  }

  return fetchGoogleApi<GoogleDriveFile>('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Uploads a file to Google Drive using multipart upload.
 */
export async function uploadDriveFile(
  file: File,
  parentId?: string,
): Promise<GoogleDriveFile> {
  const token = await ensureWorkspaceAccessToken()

  const metadata: Record<string, unknown> = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  }
  if (parentId) {
    metadata.parents = [parentId]
  }

  const boundary = '-------314159265358979323846'
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const reader = new FileReader()
  const fileDataPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })

  const fileData = await fileDataPromise

  const metadataBlob = new Blob([
    delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
  ])

  const closeBlob = new Blob([closeDelimiter])
  const multipartBody = new Blob([metadataBlob, fileData, closeBlob], {
    type: `multipart/related; boundary=${boundary}`,
  })

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to upload file: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Moves a Google Drive file to trash.
 */
export async function trashDriveFile(fileId: string): Promise<GoogleDriveFile> {
  return fetchGoogleApi<GoogleDriveFile>(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    },
  )
}

/**
 * Permanently deletes a Google Drive file.
 */
export async function deleteDriveFilePermanently(fileId: string): Promise<void> {
  await fetchGoogleApi<void>(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
  })
}

/* ==========================================================================
   GOOGLE SHEETS API (v4)
   ========================================================================== */

/**
 * Lists all Google Sheets spreadsheets in user's Drive.
 */
export async function listSpreadsheets(
  query?: string,
): Promise<GoogleDriveFile[]> {
  const result = await listDriveFiles({
    query,
    mimeTypeFilter: 'application/vnd.google-apps.spreadsheet',
    pageSize: 50,
  })
  return result.files
}

/**
 * Gets metadata for a spreadsheet including sheet tabs.
 */
export async function getSpreadsheetMetadata(
  spreadsheetId: string,
): Promise<GoogleSheetMetadata> {
  return fetchGoogleApi<GoogleSheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
  )
}

/**
 * Reads values from a specified range in a spreadsheet.
 */
export async function getSpreadsheetValues(
  spreadsheetId: string,
  range: string,
): Promise<SheetValuesResult> {
  return fetchGoogleApi<SheetValuesResult>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}`,
  )
}

/**
 * Creates a brand new Google Spreadsheet.
 */
export async function createSpreadsheet(
  title: string,
  initialSheetTitle = 'Leads & Pipeline',
  initialHeaders?: string[],
): Promise<GoogleSheetMetadata> {
  const body: Record<string, unknown> = {
    properties: {
      title,
    },
    sheets: [
      {
        properties: {
          title: initialSheetTitle,
        },
      },
    ],
  }

  const created = await fetchGoogleApi<GoogleSheetMetadata>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )

  if (initialHeaders && initialHeaders.length > 0) {
    await updateSpreadsheetValues(
      created.spreadsheetId,
      `${initialSheetTitle}!A1:${String.fromCharCode(64 + initialHeaders.length)}1`,
      [initialHeaders],
    )
  }

  return created
}

/**
 * Updates a range of values in a Google Spreadsheet.
 */
export async function updateSpreadsheetValues(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][],
): Promise<{ updatedCells: number; updatedRows: number; updatedColumns: number }> {
  return fetchGoogleApi<{ updatedCells: number; updatedRows: number; updatedColumns: number }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values,
      }),
    },
  )
}

/**
 * Appends rows to a Google Spreadsheet.
 */
export async function appendSpreadsheetValues(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][],
): Promise<{ updates: { updatedCells: number; updatedRows: number } }> {
  return fetchGoogleApi<{ updates: { updatedCells: number; updatedRows: number } }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values,
      }),
    },
  )
}

/**
 * Syncs the current Zenith Operator / Pipeline records to a Google Sheet.
 */
export async function syncPipelineToGoogleSheet(
  spreadsheetId: string,
  sheetTitle: string,
  records: OperatorRecord[],
): Promise<{ rowCount: number }> {
  const headers = [
    'ID',
    'CODENAME',
    'OPERATOR_NAME',
    'CLIENT_ORG',
    'DEPOT_LOCATION',
    'STAGE',
    'STATUS',
    'PHONE',
    'SLA_PCT',
    'QC_CODE',
    'STATION',
    'NOTES',
    'LAST_MODIFIED',
  ]

  const rows = records.map((r) => [
    r.id,
    r.codename || '',
    r.operator || '',
    r.client || '',
    r.depot || r.address || '',
    r.stage || '',
    r.status || '',
    r.phone || '',
    `${r.sla || 0}%`,
    r.qc || '',
    r.station || '',
    r.notes || '',
    r.updatedAt || '',
  ])

  const matrix = [headers, ...rows]

  // Update whole range
  await updateSpreadsheetValues(
    spreadsheetId,
    `${sheetTitle}!A1:${String.fromCharCode(64 + headers.length)}${matrix.length}`,
    matrix,
  )

  return { rowCount: rows.length }
}

// ==========================================
// GOOGLE CALENDAR API INTEGRATIONS
// ==========================================

export interface GoogleCalendarItem {
  id: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { email: string; displayName?: string; responseStatus?: string }[]
  conferenceData?: {
    entryPoints?: { entryPointType: string; uri: string; label?: string }[]
  }
}

export interface GoogleCalendarListResponse {
  items?: GoogleCalendarItem[]
  nextPageToken?: string
}

/**
 * Fetches real events from the user's primary Google Calendar.
 */
export async function listGoogleCalendarEvents(
  calendarId: string = 'primary',
  timeMin?: string,
): Promise<CalendarEvent[]> {
  const minTime = timeMin || new Date(Date.now() - 30 * 86400000).toISOString()
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events?singleEvents=true&orderBy=startTime&maxResults=100&timeMin=${encodeURIComponent(
    minTime,
  )}`

  const data = await fetchGoogleApi<GoogleCalendarListResponse>(url, {
    method: 'GET',
  })

  const items = data.items || []
  return items.map((item) => {
    const rawDate = item.start?.dateTime
      ? item.start.dateTime.slice(0, 10)
      : item.start?.date || new Date().toISOString().slice(0, 10)

    const rawStart = item.start?.dateTime
      ? item.start.dateTime.slice(11, 16)
      : '09:00'

    const rawEnd = item.end?.dateTime
      ? item.end.dateTime.slice(11, 16)
      : '10:00'

    const guests = (item.attendees || []).map((a) => {
      let rsvp: 'YES' | 'NO' | 'MAYBE' | 'PENDING' = 'PENDING'
      if (a.responseStatus === 'accepted') rsvp = 'YES'
      else if (a.responseStatus === 'declined') rsvp = 'NO'
      else if (a.responseStatus === 'tentative') rsvp = 'MAYBE'
      return { email: a.email, rsvp }
    })

    const hasMeet = Boolean(
      item.hangoutLink ||
        item.conferenceData?.entryPoints?.some((ep) => ep.entryPointType === 'video'),
    )

    return {
      id: item.id,
      title: item.summary || '(Untitled Event)',
      date: rawDate,
      start: rawStart,
      end: rawEnd,
      location: item.location || '',
      description: item.description || '',
      guests,
      meet: hasMeet,
    }
  })
}

/**
 * Creates an event in the user's primary Google Calendar.
 */
export async function createGoogleCalendarEvent(
  event: Omit<CalendarEvent, 'id'>,
  calendarId: string = 'primary',
): Promise<CalendarEvent> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const startDateTime = `${event.date}T${event.start || '09:00'}:00`
  const endDateTime = `${event.date}T${event.end || '10:00'}:00`

  const payload: Record<string, any> = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: new Date(startDateTime).toISOString(), timeZone },
    end: { dateTime: new Date(endDateTime).toISOString(), timeZone },
    attendees: event.guests?.map((g) => ({ email: g.email })),
  }

  if (event.meet) {
    payload.conferenceData = {
      createRequest: {
        requestId: `meet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events?conferenceDataVersion=1`

  const created = await fetchGoogleApi<GoogleCalendarItem>(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return {
    id: created.id,
    title: created.summary || event.title,
    date: event.date,
    start: event.start,
    end: event.end,
    location: created.location || event.location,
    description: created.description || event.description,
    guests: event.guests,
    meet: event.meet,
  }
}

/**
 * Updates an event in Google Calendar.
 */
export async function updateGoogleCalendarEvent(
  eventId: string,
  event: Partial<CalendarEvent>,
  calendarId: string = 'primary',
): Promise<void> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const payload: Record<string, any> = {}

  if (event.title !== undefined) payload.summary = event.title
  if (event.description !== undefined) payload.description = event.description
  if (event.location !== undefined) payload.location = event.location
  if (event.guests !== undefined) {
    payload.attendees = event.guests.map((g) => ({ email: g.email }))
  }

  if (event.date && event.start) {
    payload.start = {
      dateTime: new Date(`${event.date}T${event.start}:00`).toISOString(),
      timeZone,
    }
  }
  if (event.date && event.end) {
    payload.end = {
      dateTime: new Date(`${event.date}T${event.end}:00`).toISOString(),
      timeZone,
    }
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events/${encodeURIComponent(eventId)}`

  await fetchGoogleApi(url, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * Deletes an event from Google Calendar.
 */
export async function deleteGoogleCalendarEvent(
  eventId: string,
  calendarId: string = 'primary',
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events/${encodeURIComponent(eventId)}`

  await fetchGoogleApi(url, {
    method: 'DELETE',
  })
}

/* ==========================================================================
   GOOGLE MEET API (v2) INTEGRATION
   ========================================================================== */

export interface GoogleMeetSpaceResponse {
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

/**
 * Creates a new Google Meet space using Google Meet API v2.
 */
export async function createGoogleMeetSpace(options?: {
  accessType?: 'OPEN' | 'TRUSTED' | 'RESTRICTED'
  entryPointAccess?: 'ALL' | 'CREATOR_APP_ONLY'
}): Promise<GoogleMeetSpaceResponse> {
  const url = 'https://meet.googleapis.com/v2/spaces'
  const payload: Record<string, any> = {
    config: {
      accessType: options?.accessType || 'OPEN',
      entryPointAccess: options?.entryPointAccess || 'ALL',
    },
  }

  const space = await fetchGoogleApi<GoogleMeetSpaceResponse>(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return space
}

/**
 * Retrieves details for a specific Google Meet space.
 */
export async function getGoogleMeetSpace(spaceNameOrCode: string): Promise<GoogleMeetSpaceResponse> {
  const name = spaceNameOrCode.startsWith('spaces/') ? spaceNameOrCode : `spaces/${spaceNameOrCode}`
  const url = `https://meet.googleapis.com/v2/${encodeURIComponent(name)}`
  return fetchGoogleApi<GoogleMeetSpaceResponse>(url)
}

/**
 * Updates config for a Google Meet space.
 */
export async function updateGoogleMeetSpace(
  spaceName: string,
  config: { accessType?: 'OPEN' | 'TRUSTED' | 'RESTRICTED' },
): Promise<GoogleMeetSpaceResponse> {
  const name = spaceName.startsWith('spaces/') ? spaceName : `spaces/${spaceName}`
  const url = `https://meet.googleapis.com/v2/${encodeURIComponent(name)}?updateMask=config.accessType`
  return fetchGoogleApi<GoogleMeetSpaceResponse>(url, {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  })
}

/* ==========================================================================
   GOOGLE GMAIL API INTEGRATION
   ========================================================================== */

/**
 * Decodes a URL-safe Base64 string from Gmail API.
 */
function decodeBase64Url(input: string): string {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
  } catch {
    try {
      return atob(input.replace(/-/g, '+').replace(/_/g, '/'))
    } catch {
      return ''
    }
  }
}

/**
 * Extracts plain text and HTML bodies from a Gmail message payload.
 */
function extractBodyFromPayload(payload: any): { text: string; html: string } {
  let text = ''
  let html = ''

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data)
    if (payload.mimeType?.includes('html')) {
      html = decoded
    } else {
      text = decoded
    }
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    const walk = (parts: any[]) => {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data && !text) {
          text = decodeBase64Url(part.body.data)
        } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
          html = decodeBase64Url(part.body.data)
        }
        if (part.parts) {
          walk(part.parts)
        }
      }
    }
    walk(payload.parts)
  }

  return { text, html }
}

/**
 * Creates an RFC 2822 base64url encoded email string for sending.
 */
function createRawEmail({
  to,
  subject,
  body,
  cc,
}: {
  to: string
  subject: string
  body: string
  cc?: string
}): string {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`
  const lines = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    body,
  ]
  const email = lines.join('\r\n')
  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export interface GmailProfile {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
  historyId: string
}

/**
 * Retrieves the current user's Gmail profile (email, message counts).
 */
export async function getGmailProfile(): Promise<GmailProfile> {
  return fetchGoogleApi<GmailProfile>('https://gmail.googleapis.com/gmail/v1/users/me/profile')
}

/**
 * Lists Gmail messages matching a query with summary metadata.
 */
export async function listGmailMessages(options?: {
  query?: string
  maxResults?: number
  pageToken?: string
}): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string; totalEstimate?: number }> {
  const max = options?.maxResults || 20
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}`
  if (options?.query) {
    url += `&q=${encodeURIComponent(options.query)}`
  }
  if (options?.pageToken) {
    url += `&pageToken=${encodeURIComponent(options.pageToken)}`
  }

  const listRes = await fetchGoogleApi<{
    messages?: { id: string; threadId: string }[]
    nextPageToken?: string
    resultSizeEstimate?: number
  }>(url)

  if (!listRes.messages || listRes.messages.length === 0) {
    return { messages: [], nextPageToken: listRes.nextPageToken, totalEstimate: listRes.resultSizeEstimate }
  }

  // Fetch metadata details for each message in parallel
  const summaries = await Promise.all(
    listRes.messages.slice(0, 15).map(async (msg) => {
      try {
        const detail = await fetchGoogleApi<any>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        )
        const headers: { name: string; value: string }[] = detail.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        const fromRaw = getHeader('From')
        const nameMatch = fromRaw.match(/^"?([^"<]+)"?\s*<?([^>]*)>?$/)
        const fromName = nameMatch ? nameMatch[1].trim() : fromRaw
        const fromEmail = nameMatch && nameMatch[2] ? nameMatch[2].trim() : fromRaw

        const labels: string[] = detail.labelIds || []
        const isUnread = labels.includes('UNREAD')
        const isStarred = labels.includes('STARRED')

        const summary: GmailMessageSummary = {
          id: detail.id,
          threadId: detail.threadId,
          snippet: detail.snippet || '',
          date: getHeader('Date') || new Date(Number(detail.internalDate)).toISOString(),
          from: fromEmail,
          fromName: fromName || fromEmail,
          to: getHeader('To'),
          subject: getHeader('Subject') || '(No Subject)',
          isUnread,
          isStarred,
          labels,
        }
        return summary
      } catch (e) {
        return null
      }
    }),
  )

  const validSummaries = summaries.filter((s): s is GmailMessageSummary => s !== null)

  return {
    messages: validSummaries,
    nextPageToken: listRes.nextPageToken,
    totalEstimate: listRes.resultSizeEstimate,
  }
}

/**
 * Retrieves the full payload and decoded body for a single message.
 */
export async function getGmailMessageDetails(messageId: string): Promise<GmailFullMessage> {
  const detail = await fetchGoogleApi<any>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  )

  const headers: { name: string; value: string }[] = detail.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  const fromRaw = getHeader('From')
  const nameMatch = fromRaw.match(/^"?([^"<]+)"?\s*<?([^>]*)>?$/)
  const fromName = nameMatch ? nameMatch[1].trim() : fromRaw
  const fromEmail = nameMatch && nameMatch[2] ? nameMatch[2].trim() : fromRaw

  const labels: string[] = detail.labelIds || []
  const isUnread = labels.includes('UNREAD')
  const isStarred = labels.includes('STARRED')

  const { text, html } = extractBodyFromPayload(detail.payload || {})

  return {
    id: detail.id,
    threadId: detail.threadId,
    snippet: detail.snippet || '',
    date: getHeader('Date') || new Date(Number(detail.internalDate)).toISOString(),
    from: fromEmail,
    fromName: fromName || fromEmail,
    to: getHeader('To'),
    subject: getHeader('Subject') || '(No Subject)',
    isUnread,
    isStarred,
    labels,
    bodyText: text || detail.snippet || '',
    bodyHtml: html,
  }
}

/**
 * Modifies labels on a Gmail message (e.g. mark read/unread, star).
 */
export async function modifyGmailMessage(
  messageId: string,
  options: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  await fetchGoogleApi<void>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: 'POST',
      body: JSON.stringify({
        addLabelIds: options.addLabelIds || [],
        removeLabelIds: options.removeLabelIds || [],
      }),
    },
  )
}

/**
 * Sends a message to trash in Gmail.
 */
export async function trashGmailMessage(messageId: string): Promise<void> {
  await fetchGoogleApi<void>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`,
    {
      method: 'POST',
    },
  )
}

/**
 * Sends a brand new email via Gmail API.
 */
export async function sendGmailMessage(options: {
  to: string
  subject: string
  body: string
  cc?: string
}): Promise<{ id: string; threadId: string }> {
  const raw = createRawEmail(options)
  return fetchGoogleApi<{ id: string; threadId: string }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({ raw }),
    },
  )
}

