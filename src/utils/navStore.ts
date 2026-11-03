/**
 * Persistent Navigation Store
 * Ensures route state, inputs, coordinates, and metrics survive view switches and page refreshes.
 */
import type { RouteMetrics, TravelMode } from './maps'

export type NavMode = 'SEARCH' | 'ROUTE' | 'OPTIMIZE'
export type NavTab = 'CLIENTS' | 'HUBS'
export type ScopeFilter = 'ALL' | 'IN_ROUTE' | 'UK_HUBS'
export type SidebarWidth = 'COMPACT' | 'WIDE'

export interface NavRouteState {
  mode: NavMode
  navTab: NavTab
  scopeFilter: ScopeFilter
  isSidebarOpen: boolean
  sidebarWidth: SidebarWidth
  query: string
  origin: string
  destination: string
  travelMode: TravelMode
  routeMetrics: RouteMetrics | null
  src: string
  label: string
  searchTerm: string
  selectedEntityId: string | null
  mapEngine: 'INTERACTIVE' | 'GOOGLE_EMBED'
  singleLocationCoords: { lat: number; lng: number } | null
}

const STORAGE_KEY = 'zenith_apex_nav_route_state_v2'

// In-memory singleton cache to guarantee zero-latency cross-view state preservation
let inMemoryNavState: Partial<NavRouteState> | null = null

export function loadNavRouteState(): Partial<NavRouteState> | null {
  if (inMemoryNavState) {
    return inMemoryNavState
  }
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NavRouteState>
      inMemoryNavState = parsed
      return parsed
    }
  } catch (err) {
    console.warn('Could not read nav route state from storage:', err)
  }
  return null
}

export function saveNavRouteState(updates: Partial<NavRouteState>): void {
  inMemoryNavState = { ...inMemoryNavState, ...updates }
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryNavState))
    }
  } catch (err) {
    console.warn('Could not persist nav route state to storage:', err)
  }
}

export function clearNavRouteState(): void {
  inMemoryNavState = null
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (err) {
    console.warn('Could not clear nav route state:', err)
  }
}
