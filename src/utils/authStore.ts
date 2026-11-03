import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

export type AuthProvider = 'LOCAL' | 'GOOGLE'

export interface Session {
  name: string
  email: string
  clearance: string
  provider: AuthProvider
  uid?: string
}

export interface AuthResult {
  success: boolean
  session?: Session
  error?: string
  verificationRequired?: boolean
  email?: string
}

export interface ResetRequestResult {
  success: boolean
  code?: string
  error?: string
}

const SESSION_KEY = 'ZENITH_SESSION'

export const DEMO_CREDENTIALS = { email: 'operator@zenith.corp', passphrase: 'password123' }

/** Google accounts offered by the Google account selector. */
export const GOOGLE_IDENTITIES = [
  { email: 'fuentes.emmanuel.cas@gmail.com', name: 'EMMANUEL FUENTES', hint: 'Developer Account (GCP Verified)' },
  { email: 'emmanuel.fuentes@serviceclub.com', name: 'EMMANUEL FUENTES', hint: 'Corporate Account (Requires Test User in GCP)' },
]

export const nameFromEmail = (email: string): string =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.toUpperCase())
    .join(' ')

export const userToSession = (user: User, provider: AuthProvider = 'LOCAL'): Session => ({
  name: user.displayName || nameFromEmail(user.email || '') || 'OPERATOR',
  email: user.email || '',
  clearance: 'LEVEL 4',
  provider,
  uid: user.uid,
})

/**
 * Sign in using Firebase Authentication with Email & Password.
 * If credentials are incorrect, returns: "Email or password is incorrect"
 */
export async function authenticate(email: string, pass: string): Promise<AuthResult> {
  const trimmedEmail = email.trim()
  if (!trimmedEmail || !pass) {
    return { success: false, error: 'Email or password is required' }
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, pass)
    const session = userToSession(userCredential.user, 'LOCAL')
    saveSession(session)
    return { success: true, session }
  } catch (err: unknown) {
    // If demo account credentials were used and user does not exist in Firebase yet, auto-provision
    if (
      trimmedEmail.toLowerCase() === DEMO_CREDENTIALS.email.toLowerCase() &&
      pass === DEMO_CREDENTIALS.passphrase
    ) {
      try {
        const created = await createUserWithEmailAndPassword(auth, trimmedEmail, pass)
        const session = userToSession(created.user, 'LOCAL')
        saveSession(session)
        return { success: true, session }
      } catch {
        // Fall through to error
      }
    }

    return {
      success: false,
      error: 'Email or password is incorrect',
    }
  }
}

/**
 * Sign up using Firebase Authentication with Email & Password.
 * Authenticates users only - does NOT save user profile data.
 * If the email already exists, shows: "User already exists. Please sign in"
 * On successful sign-up, returns session to redirect to dashboard.
 */
export async function register(email: string, pass: string): Promise<AuthResult> {
  const trimmedEmail = email.trim()
  if (!trimmedEmail || !pass) {
    return { success: false, error: 'Email or password is required' }
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, pass)
    const session = userToSession(userCredential.user, 'LOCAL')
    saveSession(session)
    return {
      success: true,
      session,
    }
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code
    if (errorCode === 'auth/email-already-in-use') {
      return {
        success: false,
        error: 'User already exists. Please sign in',
      }
    }
    if (errorCode === 'auth/weak-password') {
      return {
        success: false,
        error: 'Password should be at least 6 characters',
      }
    }
    if (errorCode === 'auth/invalid-email') {
      return {
        success: false,
        error: 'Please enter a valid email address',
      }
    }
    return {
      success: false,
      error: (err as Error)?.message || 'Email or password is incorrect',
    }
  }
}

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
]

// Persistent storage key for Workspace OAuth access token
const WORKSPACE_TOKEN_KEY = 'ZENITH_WORKSPACE_TOKEN'

// In-memory cached OAuth access token synced with localStorage
let cachedAccessToken: string | null = null

export function getCachedAccessToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken
  try {
    const stored = window.localStorage.getItem(WORKSPACE_TOKEN_KEY)
    if (stored) {
      cachedAccessToken = stored
      return stored
    }
  } catch {
    /* fallback to null */
  }
  return null
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token
  try {
    if (token) {
      window.localStorage.setItem(WORKSPACE_TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(WORKSPACE_TOKEN_KEY)
    }
  } catch {
    /* non-persistent fallback */
  }
}

export function getValidAccessToken(): string | null {
  return getCachedAccessToken()
}

export async function requestGoogleAccessToken(scopes: string[] = WORKSPACE_SCOPES): Promise<string | null> {
  const res = await signInWithGooglePopup(scopes)
  if (res.success) {
    return getCachedAccessToken()
  }
  return null
}

/**
 * Sign out the current user via Firebase Auth and clear all session and workspace tokens.
 */
export async function logout(): Promise<void> {
  try {
    await signOut(auth)
  } catch (e) {
    console.error('Sign out error:', e)
  }
  setCachedAccessToken(null)
  clearSession()
}

/**
 * Sign in with Firebase Google Provider popup.
 */
export async function signInWithGooglePopup(scopes: string[] = []): Promise<AuthResult> {
  try {
    const provider = new GoogleAuthProvider()
    if (scopes && scopes.length > 0) {
      scopes.forEach((scope) => {
        provider.addScope(scope)
      })
    }
    provider.setCustomParameters({ prompt: 'select_account' })
    const userCredential = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(userCredential)
    if (credential?.accessToken) {
      setCachedAccessToken(credential.accessToken)
    }
    const session = userToSession(userCredential.user, 'GOOGLE')
    saveSession(session)
    return { success: true, session }
  } catch (err: unknown) {
    console.warn('Firebase Google popup encounter:', err)
    const errorObj = err as { code?: string; message?: string }
    const errorCode = errorObj?.code || ''
    const errorMessage = errorObj?.message || ''

    if (errorCode === 'auth/popup-closed-by-user') {
      return {
        success: false,
        error: 'Google Sign-In popup closed by user.',
      }
    }

    if (errorMessage.includes('access_denied') || errorMessage.includes('403') || errorMessage.includes('verification process')) {
      return {
        success: false,
        error: 'Access blocked: The Google account is not an approved tester in Google Cloud Console. Please sign in with the developer account (fuentes.emmanuel.cas@gmail.com).',
      }
    }

    return {
      success: false,
      error: errorMessage || 'Firebase Google Sign-In was cancelled or failed.',
    }
  }
}

/** Google sign-in with chosen identity */
export async function signInWithGoogle(email: string, displayName?: string): Promise<AuthResult> {
  const address = email.trim().toLowerCase()
  const session: Session = {
    name: displayName || nameFromEmail(address) || 'OPERATOR',
    email: address,
    clearance: 'LEVEL 4',
    provider: 'GOOGLE',
  }
  saveSession(session)
  return { success: true, session }
}

/** Password reset email */
export async function requestReset(email: string): Promise<ResetRequestResult> {
  const trimmed = email.trim()
  if (!trimmed) return { success: false, error: 'Email is required' }
  try {
    await sendPasswordResetEmail(auth, trimmed)
    return { success: true, code: 'RESET_LINK_TRANSMITTED' }
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code
    if (errorCode === 'auth/user-not-found') {
      return { success: false, error: 'Operator record not found' }
    }
    return { success: false, error: (err as Error)?.message || 'Reset dispatch failed' }
  }
}

export async function resetPassphrase(
  email: string,
  _code: string,
  _passphrase: string,
): Promise<AuthResult> {
  return requestReset(email)
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* non-persistent session */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(WORKSPACE_TOKEN_KEY)
    cachedAccessToken = null
  } catch {
    /* no-op */
  }
}

/** Subscribe to Firebase Auth state changes */
export function subscribeToAuth(callback: (session: Session | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      const provider = user.providerData.some((p) => p.providerId === 'google.com') ? 'GOOGLE' : 'LOCAL'
      const s = userToSession(user, provider)
      saveSession(s)
      callback(s)
    } else {
      clearSession()
      callback(null)
    }
  })
}
