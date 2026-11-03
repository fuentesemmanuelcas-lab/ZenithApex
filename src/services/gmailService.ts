import { ensureWorkspaceAccessToken } from './googleWorkspace'
import type { GmailAttachmentMeta, GmailMessageDetail, GmailMessageSummary } from '../types/zenith'

const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Helper to decode Base64Url string to UTF-8 text */
export function decodeBase64Url(base64UrlStr: string): string {
  try {
    const base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (m) => m.charCodeAt(0))
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(bytes)
  } catch (err) {
    try {
      return atob(base64UrlStr.replace(/-/g, '+').replace(/_/g, '/'))
    } catch {
      return ''
    }
  }
}

/** Helper to encode UTF-8 text to Base64Url */
export function encodeBase64Url(str: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Parse 'From' header into display name and email address */
export function parseSender(fromHeader = ''): { name: string; email: string } {
  if (!fromHeader) return { name: 'Unknown', email: '' }
  const match = fromHeader.match(/^(.*?)\s*<([^>]+)>$/)
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, '').trim()
    const email = match[2].trim()
    return { name: name || email, email }
  }
  return { name: fromHeader.trim(), email: fromHeader.trim() }
}

export interface ListMessagesOptions {
  q?: string
  labelIds?: string[]
  maxResults?: number
  pageToken?: string
}

export interface ListMessagesResponse {
  messages: GmailMessageSummary[]
  nextPageToken?: string
  resultSizeEstimate?: number
}

/**
 * Fetch Gmail user profile info (email address, total messages, etc.)
 */
export async function getGmailProfile(): Promise<{
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
}> {
  const token = await ensureWorkspaceAccessToken()
  const res = await fetch(`${GMAIL_BASE_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to fetch Gmail profile (${res.status})`)
  }
  return res.json()
}

/**
 * Get count of unread messages in the user's INBOX
 */
export async function getInboxUnreadCount(): Promise<number> {
  try {
    const token = await ensureWorkspaceAccessToken()
    const res = await fetch(`${GMAIL_BASE_URL}/labels/INBOX`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 0
    const data = await res.json()
    return typeof data.messagesUnread === 'number' ? data.messagesUnread : 0
  } catch {
    return 0
  }
}

/**
 * List messages from Gmail with metadata preview (sender, subject, snippet, date, flags)
 */
export async function listGmailMessages(
  options: ListMessagesOptions = {},
): Promise<ListMessagesResponse> {
  const token = await ensureWorkspaceAccessToken()
  const params = new URLSearchParams()
  if (options.q) params.set('q', options.q)
  if (options.maxResults) params.set('maxResults', String(options.maxResults))
  if (options.pageToken) params.set('pageToken', options.pageToken)
  if (options.labelIds && options.labelIds.length > 0) {
    options.labelIds.forEach((l) => params.append('labelIds', l))
  }

  const url = `${GMAIL_BASE_URL}/messages?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to list messages from Gmail (${res.status})`)
  }

  const listData: {
    messages?: { id: string; threadId: string }[]
    nextPageToken?: string
    resultSizeEstimate?: number
  } = await res.json()

  if (!listData.messages || listData.messages.length === 0) {
    return { messages: [], nextPageToken: undefined, resultSizeEstimate: 0 }
  }

  // Fetch metadata details for each message in parallel
  const detailPromises = listData.messages.map(async (msgStub) => {
    try {
      const msgRes = await fetch(
        `${GMAIL_BASE_URL}/messages/${msgStub.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!msgRes.ok) return null
      const rawMsg = await msgRes.json()

      const headers = rawMsg.payload?.headers || []
      const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)'
      const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || ''
      const toHeader = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value || ''
      const dateHeader = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || ''

      const { name: fromName, email: fromEmail } = parseSender(fromHeader)
      const labelIds: string[] = rawMsg.labelIds || []
      const isUnread = labelIds.includes('UNREAD')
      const isStarred = labelIds.includes('STARRED')
      const timestamp = Number(rawMsg.internalDate) || Date.now()

      const summary: GmailMessageSummary = {
        id: rawMsg.id,
        threadId: rawMsg.threadId,
        snippet: rawMsg.snippet || '',
        subject: subjectHeader,
        from: fromHeader,
        fromName,
        fromEmail,
        to: toHeader,
        date: dateHeader || new Date(timestamp).toLocaleString(),
        timestamp,
        isUnread,
        isStarred,
        hasAttachments: Boolean(rawMsg.payload?.parts?.some((p: any) => p.filename && p.body?.attachmentId)),
        labelIds,
      }
      return summary
    } catch {
      return null
    }
  })

  const results = await Promise.all(detailPromises)
  const messages = results.filter((m): m is GmailMessageSummary => m !== null)

  return {
    messages,
    nextPageToken: listData.nextPageToken,
    resultSizeEstimate: listData.resultSizeEstimate,
  }
}

/** Recursively extract plain text and HTML body parts from Gmail payload */
function extractBodyParts(payload: any): { text: string; html: string; attachments: GmailAttachmentMeta[] } {
  let text = ''
  let html = ''
  const attachments: GmailAttachmentMeta[] = []

  function walk(part: any) {
    if (!part) return

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      })
    }

    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data) + '\n'
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html += decodeBase64Url(part.body.data) + '\n'
    }

    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(walk)
    }
  }

  walk(payload)

  // Direct body if no parts
  if (!text && !html && payload.body?.data) {
    if (payload.mimeType === 'text/html') {
      html = decodeBase64Url(payload.body.data)
    } else {
      text = decodeBase64Url(payload.body.data)
    }
  }

  return { text: text.trim(), html: html.trim(), attachments }
}

/**
 * Fetch full message details including plain text/HTML body and attachments
 */
export async function getGmailMessage(messageId: string): Promise<GmailMessageDetail> {
  const token = await ensureWorkspaceAccessToken()
  const res = await fetch(`${GMAIL_BASE_URL}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to fetch message ${messageId} (${res.status})`)
  }

  const rawMsg = await res.json()
  const headers = rawMsg.payload?.headers || []
  const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)'
  const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || ''
  const toHeader = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value || ''
  const dateHeader = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || ''

  const { name: fromName, email: fromEmail } = parseSender(fromHeader)
  const labelIds: string[] = rawMsg.labelIds || []
  const isUnread = labelIds.includes('UNREAD')
  const isStarred = labelIds.includes('STARRED')
  const timestamp = Number(rawMsg.internalDate) || Date.now()

  const { text, html, attachments } = extractBodyParts(rawMsg.payload)

  return {
    id: rawMsg.id,
    threadId: rawMsg.threadId,
    snippet: rawMsg.snippet || '',
    subject: subjectHeader,
    from: fromHeader,
    fromName,
    fromEmail,
    to: toHeader,
    date: dateHeader || new Date(timestamp).toLocaleString(),
    timestamp,
    isUnread,
    isStarred,
    hasAttachments: attachments.length > 0,
    labelIds,
    bodyText: text || rawMsg.snippet || '',
    bodyHtml: html || undefined,
    attachments,
  }
}

/**
 * Modify message labels (e.g. mark read/unread, star/unstar, remove from inbox)
 */
export async function modifyGmailMessage(
  messageId: string,
  modifications: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<{ id: string; labelIds: string[] }> {
  const token = await ensureWorkspaceAccessToken()
  const res = await fetch(`${GMAIL_BASE_URL}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addLabelIds: modifications.addLabelIds || [],
      removeLabelIds: modifications.removeLabelIds || [],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to modify message ${messageId}`)
  }

  return res.json()
}

/**
 * Move message to Trash
 */
export async function trashGmailMessage(messageId: string): Promise<{ id: string }> {
  const token = await ensureWorkspaceAccessToken()
  const res = await fetch(`${GMAIL_BASE_URL}/messages/${messageId}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to move message ${messageId} to trash`)
  }

  return res.json()
}

/**
 * Send an email message via Gmail API
 * Note: Mutation requires user confirmation in UI before executing.
 */
export async function sendGmailMessage(params: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
}): Promise<{ id: string; threadId: string }> {
  const token = await ensureWorkspaceAccessToken()

  const lines = [
    `To: ${params.to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ]

  if (params.cc) lines.push(`Cc: ${params.cc}`)
  if (params.bcc) lines.push(`Bcc: ${params.bcc}`)

  lines.push('', params.body)
  const rawEmail = lines.join('\r\n')
  const encoded = encodeBase64Url(rawEmail)

  const res = await fetch(`${GMAIL_BASE_URL}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Failed to send email (${res.status})`)
  }

  return res.json()
}
