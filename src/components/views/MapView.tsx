import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  Building2Icon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  CompassIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilterIcon,
  LayersIcon,
  LocateFixedIcon,
  MapPinIcon,
  NavigationIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshCwIcon,
  RouteIcon,
  SearchIcon,
  SparklesIcon,
  TrainIcon,
  UsersIcon,
} from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { TermButton, Pill } from '../ui/Primitives'
import { ZenithMap } from '../maps/ZenithMap'
import {
  buildExternalMapsUrl,
  buildMapEmbed,
  cleanLocationString,
  executeMapDirections,
  fetchRouteMetrics,
  fetchOptimizedRoute,
  calculateLocalRouteMetrics,
  geocodeAddress,
  extractPostalCode,
  isUkAddress,
  type RouteMetrics,
  type TravelMode,
} from '../../utils/maps'
import { loadNavRouteState, saveNavRouteState } from '../../utils/navStore'
import type { OperatorRecord } from '../../types/zenith'
import { isClientPausedOrRevoked } from '../../utils/format'

type Mode = 'SEARCH' | 'ROUTE' | 'OPTIMIZE'
type NavTab = 'CLIENTS' | 'HUBS'
type ScopeFilter = 'ALL' | 'IN_ROUTE' | 'UK_HUBS'
type SidebarWidth = 'COMPACT' | 'WIDE'

export interface NavigableEntity {
  entityId: string // Unique primary identifier e.g. 'CL-001', 'CL-002'
  name: string
  type: 'CLIENT'
  address: string
  normalizedAddress: string
  status: string
  phone?: string
  operatorContact?: string
}

export interface AddressCluster {
  clusterKey: string
  displayAddress: string
  entities: NavigableEntity[]
  entityCount: number
  clientCount: number
}

export function MapView({ isVisible = true }: { isVisible?: boolean }) {
  const { records, device, pushLog, pushToast } = useZenith()

  // Load persistent navigation and route state so switching views never resets input
  const savedState = useMemo(() => loadNavRouteState(), [])

  const [mode, setMode] = useState<Mode>(() => savedState?.mode || 'SEARCH')
  const [navTab, setNavTab] = useState<NavTab>(() => savedState?.navTab || 'CLIENTS')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(() => savedState?.scopeFilter || 'ALL')
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => savedState?.isSidebarOpen ?? true)
  const [sidebarWidth, setSidebarWidth] = useState<SidebarWidth>(() => savedState?.sidebarWidth || 'COMPACT')
  const [copiedEntityId, setCopiedEntityId] = useState<string | null>(null)

  const [query, setQuery] = useState(() => savedState?.query || 'London, United Kingdom')
  const [origin, setOrigin] = useState(() => savedState?.origin || 'London, United Kingdom')
  const [destination, setDestination] = useState(() => savedState?.destination || '')
  const [travelMode, setTravelMode] = useState<TravelMode>(() => savedState?.travelMode || 'driving')
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(() => savedState?.routeMetrics || null)
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [src, setSrc] = useState(() => savedState?.src || buildMapEmbed('London, United Kingdom'))
  const [label, setLabel] = useState(() => savedState?.label || 'LONDON, UNITED KINGDOM')
  const [searchTerm, setSearchTerm] = useState(() => savedState?.searchTerm || '')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(() => savedState?.selectedEntityId || null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [mapEngine, setMapEngine] = useState<'INTERACTIVE' | 'GOOGLE_EMBED'>(() => savedState?.mapEngine || 'INTERACTIVE')
  const [singleLocationCoords, setSingleLocationCoords] = useState<{ lat: number; lng: number } | null>(
    () => savedState?.singleLocationCoords ?? { lat: 37.7958, lng: -122.2788 },
  )
  const [optimizeStops, setOptimizeStops] = useState<Array<{ id: string; address: string; name?: string }>>(() => [
    {
      id: 'STOP-1',
      address: 'Unit 2, Baytree Park, Houghton Regis, Dunstable LU5 6JH, United Kingdom',
      name: 'Baytree Logistics Park',
    },
  ])
  const [roundTrip, setRoundTrip] = useState(false)
  const [showStopsConfig, setShowStopsConfig] = useState(false)
  const [newStopInput, setNewStopInput] = useState('')
  const tablet = device === 'T'

  // Continuously persist navigation state so user input and routes are never lost
  useEffect(() => {
    saveNavRouteState({
      mode,
      navTab,
      scopeFilter,
      isSidebarOpen,
      sidebarWidth,
      query,
      origin,
      destination,
      travelMode,
      routeMetrics,
      src,
      label,
      searchTerm,
      selectedEntityId,
      mapEngine,
      singleLocationCoords,
    })
  }, [
    mode,
    navTab,
    scopeFilter,
    isSidebarOpen,
    sidebarWidth,
    query,
    origin,
    destination,
    travelMode,
    routeMetrics,
    src,
    label,
    searchTerm,
    selectedEntityId,
    mapEngine,
    singleLocationCoords,
  ])

  // Extract all active Client records exclusively for the Navigation Engine
  const { allEntities, addressClusters, clientEntities } = useMemo(() => {
    const entities: NavigableEntity[] = []

    // 1. Index all paused/revoked clients across records
    const pausedOrRevokedNames = new Set<string>()
    records.forEach((r: OperatorRecord) => {
      const isClientRecord =
        r.recordType === 'CLIENT' ||
        (r.id && (r.id.startsWith('CL-') || r.id.startsWith('CLIENT-')))
      if (isClientRecord && isClientPausedOrRevoked(r.status)) {
        if (r.client?.trim()) pausedOrRevokedNames.add(r.client.trim().toUpperCase())
        if (r.operator?.trim()) pausedOrRevokedNames.add(r.operator.trim().toUpperCase())
        if (r.id) pausedOrRevokedNames.add(r.id.trim().toUpperCase())
      }
    })

    records.forEach((r: OperatorRecord) => {
      const isClientRecord =
        r.recordType === 'CLIENT' ||
        (r.id && (r.id.startsWith('CL-') || r.id.startsWith('CLIENT-')))
      if (!isClientRecord) return

      // Strictly exclude paused or revoked clients
      if (isClientPausedOrRevoked(r.status)) return
      if (r.client && pausedOrRevokedNames.has(r.client.trim().toUpperCase())) return
      if (r.operator && pausedOrRevokedNames.has(r.operator.trim().toUpperCase())) return
      if (r.id && pausedOrRevokedNames.has(r.id.trim().toUpperCase())) return

      const rawAddress = (r.depot || r.address || '').trim() || 'Port of Oakland, CA'
      const normalizedAddress = cleanLocationString(rawAddress)
      const clientName = r.client || r.operator || 'CLIENT'

      entities.push({
        entityId: r.id,
        name: clientName,
        type: 'CLIENT',
        address: rawAddress,
        normalizedAddress,
        status: r.status || 'ACTIVE',
        phone: r.phone,
        operatorContact: r.operator !== clientName ? r.operator : undefined,
      })
    })

    // Group client entities into Canonical Address Clusters to disambiguate shared addresses
    const clusterMap = new Map<string, AddressCluster>()

    entities.forEach((entity) => {
      const key = entity.normalizedAddress.toLowerCase().trim()
      const existing = clusterMap.get(key)
      if (existing) {
        // Prevent duplicate client IDs within same cluster
        if (!existing.entities.some((e) => e.entityId === entity.entityId)) {
          existing.entities.push(entity)
          existing.entityCount += 1
          existing.clientCount += 1
        }
      } else {
        clusterMap.set(key, {
          clusterKey: key,
          displayAddress: entity.normalizedAddress,
          entities: [entity],
          entityCount: 1,
          clientCount: 1,
        })
      }
    })

    const clusters = Array.from(clusterMap.values()).sort(
      (a, b) => b.entityCount - a.entityCount || a.displayAddress.localeCompare(b.displayAddress),
    )

    return {
      allEntities: entities,
      addressClusters: clusters,
      clientEntities: entities,
    }
  }, [records])

  // Helper to determine if a client is the active ORIGIN in the current route
  const isClientActiveOrigin = (client: NavigableEntity): boolean => {
    if (mode !== 'ROUTE') return false
    const cleanOrig = cleanLocationString(origin).toLowerCase().trim()
    const clientAddr = client.normalizedAddress.toLowerCase().trim()
    const clientRaw = (client.address || '').toLowerCase().trim()
    const clientName = client.name.toLowerCase().trim()
    const postCode = extractPostalCode(client.address)?.toLowerCase()

    if (cleanOrig === clientAddr || cleanOrig.includes(clientAddr) || clientAddr.includes(cleanOrig)) return true
    if (clientRaw && (cleanOrig === clientRaw || cleanOrig.includes(clientRaw) || clientRaw.includes(cleanOrig))) return true
    if (cleanOrig.includes(clientName)) return true
    if (postCode && cleanOrig.includes(postCode)) return true
    if (client.entityId && cleanOrig.includes(client.entityId.toLowerCase())) return true
    return false
  }

  // Helper to determine if a client is the active DESTINATION in the current route
  const isClientActiveDestination = (client: NavigableEntity): boolean => {
    const cleanDest = cleanLocationString(destination).toLowerCase().trim()
    const clientAddr = client.normalizedAddress.toLowerCase().trim()
    const clientRaw = (client.address || '').toLowerCase().trim()
    const clientName = client.name.toLowerCase().trim()
    const postCode = extractPostalCode(client.address)?.toLowerCase()

    if (cleanDest === clientAddr || cleanDest.includes(clientAddr) || clientAddr.includes(cleanDest)) return true
    if (clientRaw && (cleanDest === clientRaw || cleanDest.includes(clientRaw) || clientRaw.includes(cleanDest))) return true
    if (cleanDest.includes(clientName)) return true
    if (postCode && cleanDest.includes(postCode)) return true
    if (client.entityId && cleanDest.includes(client.entityId.toLowerCase())) return true
    return false
  }

  // Copy canonical address and postal code with feedback
  const handleCopyClientAddress = async (address: string, entityId: string, clientName: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedEntityId(entityId)
      pushToast({
        title: 'ADDRESS_COPIED',
        body: `${clientName} canonical address & postal code copied to clipboard.`,
        tone: 'nexus',
      })
      pushLog('NAV', `clipboard copy: ${clientName} [${address}]`, 'nexus')
      setTimeout(() => {
        setCopiedEntityId((curr) => (curr === entityId ? null : curr))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy address', err)
    }
  }

  // Dynamic scope counts for filter pills
  const scopeCounts = useMemo(() => {
    const inRouteClients = clientEntities.filter(
      (c) => isClientActiveOrigin(c) || isClientActiveDestination(c),
    ).length
    const ukClients = clientEntities.filter(
      (c) => isUkAddress(c.normalizedAddress) || isUkAddress(c.address),
    ).length

    const inRouteHubs = addressClusters.filter((hub) =>
      hub.entities.some((c) => isClientActiveOrigin(c) || isClientActiveDestination(c)),
    ).length
    const ukHubs = addressClusters.filter((hub) => isUkAddress(hub.displayAddress)).length

    return {
      allClients: clientEntities.length,
      inRouteClients,
      ukClients,
      allHubs: addressClusters.length,
      inRouteHubs,
      ukHubs,
    }
  }, [clientEntities, addressClusters, origin, destination, mode])

  // Filtered lists based on scope pills and search term
  const filteredClusters = useMemo(() => {
    return addressClusters.filter((cluster) => {
      // Scope filtering
      if (scopeFilter === 'IN_ROUTE') {
        const hasInRoute = cluster.entities.some(
          (c) => isClientActiveOrigin(c) || isClientActiveDestination(c),
        )
        if (!hasInRoute) return false
      } else if (scopeFilter === 'UK_HUBS') {
        if (!isUkAddress(cluster.displayAddress)) return false
      }

      // Search filtering
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase().trim()
      const postCode = extractPostalCode(cluster.displayAddress)?.toLowerCase() || ''
      const matchesAddress =
        cluster.displayAddress.toLowerCase().includes(q) || postCode.includes(q)
      const matchesEntity = cluster.entities.some(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.entityId.toLowerCase().includes(q) ||
          (e.operatorContact && e.operatorContact.toLowerCase().includes(q)),
      )
      return matchesAddress || matchesEntity
    })
  }, [addressClusters, scopeFilter, searchTerm, origin, destination, mode])

  const filteredClients = useMemo(() => {
    return clientEntities.filter((client) => {
      // Scope filtering
      if (scopeFilter === 'IN_ROUTE') {
        const inRoute = isClientActiveOrigin(client) || isClientActiveDestination(client)
        if (!inRoute) return false
      } else if (scopeFilter === 'UK_HUBS') {
        const isUk = isUkAddress(client.normalizedAddress) || isUkAddress(client.address)
        if (!isUk) return false
      }

      // Search filtering
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase().trim()
      const postCode = extractPostalCode(client.address)?.toLowerCase() || ''
      return (
        client.name.toLowerCase().includes(q) ||
        client.entityId.toLowerCase().includes(q) ||
        client.normalizedAddress.toLowerCase().includes(q) ||
        client.address.toLowerCase().includes(q) ||
        postCode.includes(q) ||
        (client.operatorContact && client.operatorContact.toLowerCase().includes(q))
      )
    })
  }, [clientEntities, scopeFilter, searchTerm, origin, destination, mode])

  // Active selected entity info
  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null
    return allEntities.find((e) => e.entityId === selectedEntityId) || null
  }, [allEntities, selectedEntityId])

  // Comprehensive route computation engine - Single Click Invocation
  const executeRouteCalculation = async (
    targetOrigin: string,
    targetDest: string,
    modeOverride?: TravelMode,
    originCoordsOverride?: { lat: number; lng: number },
    destCoordsOverride?: { lat: number; lng: number },
  ) => {
    const activeTravelMode = modeOverride || travelMode
    const cleanOrig = cleanLocationString(targetOrigin)
    const cleanDest = cleanLocationString(targetDest)

    if (!cleanOrig || !cleanDest) return

    setIsCalculatingRoute(true)
    setMode('ROUTE')
    setOrigin(cleanOrig)
    setDestination(cleanDest)
    // Clear existing geometry so previous mode or stale line does not linger during calculation
    setRouteMetrics((prev) => (prev ? { ...prev, routeGeometry: undefined } : null))

    // Set map projection source safely
    setSrc(executeMapDirections(cleanOrig, cleanDest, activeTravelMode))
    setLabel(`${cleanOrig.toUpperCase()} → ${cleanDest.toUpperCase()}`)

    try {
      // Async fetch high-fidelity road telemetry & turn-by-turn maneuvers (OSRM / API)
      const metrics = await fetchRouteMetrics(
        cleanOrig,
        cleanDest,
        activeTravelMode,
        originCoordsOverride,
        destCoordsOverride,
      )

      // Replace map polyline directly with road-snapped coordinates & populate turn-by-turn panel
      setRouteMetrics(metrics)

      if (metrics.isTranscontinental) {
        setSrc(buildMapEmbed(cleanDest))
      } else {
        setSrc(executeMapDirections(cleanOrig, cleanDest, activeTravelMode))
      }

      saveNavRouteState({
        mode: 'ROUTE',
        query,
        origin: cleanOrig,
        destination: cleanDest,
        travelMode: activeTravelMode,
        routeMetrics: metrics,
        src: executeMapDirections(cleanOrig, cleanDest, activeTravelMode),
        label: `${cleanOrig.toUpperCase()} → ${cleanDest.toUpperCase()}`,
        searchTerm,
        selectedEntityId,
      })

      pushLog(
        'NAV',
        `road-snapped route: ${metrics.durationText} · ${metrics.distanceText} [${metrics.steps?.length || 0} maneuvers]`,
        'nexus',
      )
    } catch (err) {
      console.warn('Failed to calculate route telemetry:', err)
      const fallbackMetrics = calculateLocalRouteMetrics(cleanOrig, cleanDest, activeTravelMode)
      setRouteMetrics(fallbackMetrics)
    } finally {
      setIsCalculatingRoute(false)
    }
  }

  // Multi-stop Route Optimization engine using real-time road & transit routing APIs
  const executeOptimizeRouteCalculation = async (
    targetOrigin?: string,
    targetStops?: Array<{ id: string; address: string; name?: string }>,
    modeOverride?: TravelMode,
    isRound?: boolean,
  ) => {
    const activeTravelMode = modeOverride || travelMode
    const cleanOrig = cleanLocationString(targetOrigin || origin || 'Luton, LU2 7DR')
    const stopsToOptimize = targetStops || optimizeStops
    const round = isRound ?? roundTrip

    if (!cleanOrig || stopsToOptimize.length === 0) return

    setIsCalculatingRoute(true)
    setMode('OPTIMIZE')
    setOrigin(cleanOrig)
    setRouteMetrics((prev) => (prev ? { ...prev, routeGeometry: undefined } : null))
    setLabel(`OPTIMIZE: ${cleanOrig.toUpperCase()} (${stopsToOptimize.length} STOPS)`)

    try {
      const optimized = await fetchOptimizedRoute(cleanOrig, stopsToOptimize, activeTravelMode, round)
      setRouteMetrics(optimized)
      setSrc(executeMapDirections(cleanOrig, optimized.destination, activeTravelMode))
      pushLog(
        'NAV',
        `optimized ${stopsToOptimize.length}-stop ${activeTravelMode} dispatch: ${optimized.durationText} · ${optimized.distanceText} [${optimized.timeSavedMinutes || 0}m saved]`,
        'nexus',
      )
    } catch (err) {
      console.warn('Failed to calculate optimized route:', err)
      const fallbackMetrics = calculateLocalRouteMetrics(cleanOrig, stopsToOptimize[0]?.address || cleanOrig, activeTravelMode)
      setRouteMetrics(fallbackMetrics)
    } finally {
      setIsCalculatingRoute(false)
    }
  }

  // Handle travel mode change (Driving, Transit)
  const handleChangeTravelMode = (newMode: TravelMode) => {
    setTravelMode(newMode)
    if (mode === 'ROUTE') {
      // Clear previous polyline immediately so it never flashes or draws an old/linear line
      setRouteMetrics((prev) => (prev ? { ...prev, routeGeometry: undefined } : null))
      void executeRouteCalculation(origin, destination, newMode)
    } else if (mode === 'OPTIMIZE') {
      setRouteMetrics((prev) => (prev ? { ...prev, routeGeometry: undefined } : null))
      void executeOptimizeRouteCalculation(origin, optimizeStops, newMode, roundTrip)
    }
  }

  // Browser Geolocation integration
  const handleUseGpsLocation = () => {
    if (!navigator.geolocation) {
      pushToast({
        title: 'GPS_UNAVAILABLE',
        body: 'Geolocation is not supported by your browser.',
        tone: 'hazard',
      })
      return
    }

    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false)
        const coordsStr = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        setOrigin(coordsStr)
        pushToast({
          title: 'GPS_ACQUIRED',
          body: `Route origin locked to physical coordinates (${coordsStr}).`,
          tone: 'nexus',
        })
        pushLog('NAV', `GPS coordinates acquired: ${coordsStr}`, 'nexus')
        if (mode === 'ROUTE') {
          void executeRouteCalculation(coordsStr, destination)
        }
      },
      (err) => {
        setGpsLoading(false)
        pushToast({
          title: 'GPS_ACCESS_DENIED',
          body: `Unable to retrieve device location (${err.message}). Defaulting to current waypoint.`,
          tone: 'hazard',
        })
      },
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true },
    )
  }

  // Form submission handler
  const project = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'SEARCH') {
      const cleanQ = cleanLocationString(query)
      setSrc(buildMapEmbed(cleanQ))
      setLabel(cleanQ.toUpperCase())
      const local = calculateLocalRouteMetrics(cleanQ, cleanQ)
      if (local.destinationCoords) {
        setSingleLocationCoords(local.destinationCoords)
      }
      void geocodeAddress(cleanQ).then((liveCoords) => {
        if (liveCoords) {
          setSingleLocationCoords(liveCoords)
        }
      })
      pushLog('NAV', `projection pinpoint → ${cleanQ}`, 'nexus')
    } else if (mode === 'OPTIMIZE') {
      void executeOptimizeRouteCalculation()
    } else {
      void executeRouteCalculation(origin, destination)
    }
  }

  // Navigation dispatch actions when clicking client
  const handleRouteToAddress = (targetAddress: string, entityLabel?: string, entityId?: string) => {
    const cleanDest = cleanLocationString(targetAddress)
    setMode('ROUTE')
    setDestination(cleanDest)
    if (entityId) setSelectedEntityId(entityId)

    let activeOrig = cleanLocationString(origin)

    // If origin is unset or matches destination, initialize to regional default hub
    if (!activeOrig || activeOrig === cleanDest) {
      const isDestUk = isUkAddress(cleanDest)
      activeOrig = isDestUk
        ? 'London, United Kingdom'
        : 'Oakland, CA'
      setOrigin(activeOrig)
    }

    void executeRouteCalculation(activeOrig, cleanDest)

    pushToast({
      title: 'ROUTE_COMPUTED',
      body: `Navigating to ${entityLabel || cleanDest}`,
      tone: 'nexus',
    })
    pushLog(
      'NAV',
      `route destination set: ${entityLabel ? `${entityLabel} [${entityId}]` : cleanDest}`,
      'nexus',
    )
  }

  const handleSetOrigin = (targetAddress: string, entityLabel?: string) => {
    const cleanOrig = cleanLocationString(targetAddress)
    setOrigin(cleanOrig)
    pushToast({
      title: 'ORIGIN_UPDATED',
      body: `Route starting origin set to ${entityLabel || cleanOrig}`,
      tone: 'nexus',
    })
    pushLog('NAV', `origin point set: ${cleanOrig}`, 'dim')
    if (mode === 'ROUTE') {
      void executeRouteCalculation(cleanOrig, destination)
    }
  }

  // Quick switch origin to destination's local city hub (useful if client is in London, NY, Tokyo, etc.)
  const handleSetOriginToDestinationRegion = (regionName: string) => {
    setOrigin(regionName)
    void executeRouteCalculation(regionName, destination)
    pushToast({
      title: 'LOCAL_ORIGIN_SET',
      body: `Origin relocated to local hub: ${regionName}`,
      tone: 'nexus',
    })
  }

  const handlePinpointAddress = (targetAddress: string, entityLabel?: string, entityId?: string) => {
    const cleanQ = cleanLocationString(targetAddress)
    setMode('SEARCH')
    setQuery(cleanQ)
    setSrc(buildMapEmbed(cleanQ))
    setLabel((entityLabel || cleanQ).toUpperCase())
    if (entityId) setSelectedEntityId(entityId)
    const local = calculateLocalRouteMetrics(cleanQ, cleanQ)
    if (local.destinationCoords) {
      setSingleLocationCoords(local.destinationCoords)
    }
    void geocodeAddress(cleanQ).then((liveCoords) => {
      if (liveCoords) {
        setSingleLocationCoords(liveCoords)
      }
    })
    pushLog(
      'NAV',
      `pinpoint search: ${entityLabel ? `${entityLabel} (${cleanQ})` : cleanQ}`,
      'nexus',
    )
  }

  const handleSwapRoute = () => {
    const oldOrig = origin
    const oldDest = destination
    setOrigin(oldDest)
    setDestination(oldOrig)
    void executeRouteCalculation(oldDest, oldOrig)
    pushLog('NAV', `route inverted: ${oldDest} → ${oldOrig}`, 'nexus')
  }

  const handleCopyLink = async () => {
    const url =
      mode === 'ROUTE'
        ? buildExternalMapsUrl(origin, destination, travelMode)
        : buildExternalMapsUrl(query)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      pushToast({
        title: 'MAP_LINK_COPIED',
        body: 'Direct Google Maps navigational link copied to clipboard.',
        tone: 'nexus',
      })
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // ignore
    }
  }

  const isPostalOrZip = useMemo(() => {
    const q = query.trim()
    if (!q) return false
    const ukPostcode = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*([0-9][A-Z]{2})?$/i.test(q) || extractPostalCode(q)
    const usZip = /^\d{5}(-\d{4})?$/.test(q)
    return Boolean(ukPostcode || usZip)
  }, [query])

  const handleSwitchToRouteFromSearch = (targetDest?: string) => {
    const rawDest = targetDest || query
    const cleanDest = cleanLocationString(rawDest).trim()
    if (!cleanDest) return

    setMode('ROUTE')
    setDestination(cleanDest)

    let activeOrig = cleanLocationString(origin).trim()
    if (!activeOrig || activeOrig.toLowerCase() === cleanDest.toLowerCase()) {
      const isUk = isUkAddress(cleanDest) || /^[A-Z]{1,2}[0-9]/i.test(cleanDest) || Boolean(extractPostalCode(cleanDest))
      activeOrig = isUk ? 'London, United Kingdom' : 'Oakland, CA'
      setOrigin(activeOrig)
    }

    pushToast({
      title: 'SWITCHING_TO_ROUTING',
      body: `Routing initialized for ${cleanDest}`,
      tone: 'nexus',
    })
    pushLog('NAV', `search → route: [${cleanDest}]`, 'nexus')

    void executeRouteCalculation(activeOrig, cleanDest)
  }

  const inputBase =
    'bg-transparent py-1 font-mono text-xs text-white outline-none placeholder:text-slate-400 font-semibold'

  return (
    <div className="isolate flex min-h-0 flex-1 flex-col font-mono overflow-hidden">
      {/* Navigation Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-nexus shadow-[0_0_8px_#00f3ff]" />
            <h1 className="text-xs font-bold tracking-[0.2em] text-nexus text-glow-nexus">
              NAVIGATION_ENGINE
            </h1>
          </div>
          <div className="flex items-center gap-1 border border-line2 bg-void/90 p-0.5 shadow-inner">
            {(['SEARCH', 'ROUTE', 'OPTIMIZE'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m)
                  if (m === 'ROUTE' && destination) {
                    void executeRouteCalculation(origin, destination)
                  } else if (m === 'OPTIMIZE') {
                    void executeOptimizeRouteCalculation()
                  }
                }}
                className={`px-3 py-1 text-3xs font-bold tracking-widest transition-all ${
                  mode === m
                    ? 'border border-nexus bg-nexus/25 text-nexus shadow-[0_0_10px_rgba(0,243,255,0.25)] ring-1 ring-nexus/40'
                    : 'border border-transparent text-slate-300 hover:text-white hover:bg-surface2 hover:border-line'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Input / Route Submission Bar */}
        <form onSubmit={project} className="flex flex-wrap items-center gap-2">
          {mode === 'SEARCH' ? (
            <div className="flex flex-1 sm:flex-initial items-center gap-2 border border-line2 bg-void/90 px-2.5 py-1 shadow-inner focus-within:border-nexus focus-within:ring-1 focus-within:ring-nexus/40">
              <SearchIcon className="h-3.5 w-3.5 text-nexus shrink-0" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Map query"
                placeholder="search address, postcode (e.g. Bromley, ME20), or depot…"
                className={`${inputBase} ${tablet ? 'w-48 sm:w-64 md:w-80 flex-1' : 'w-72'}`}
              />
              {isPostalOrZip && (
                <span className="shrink-0 bg-nexus/20 border border-nexus/40 px-1.5 py-0.2 text-4xs font-bold text-nexus">
                  POSTCODE / ZIP
                </span>
              )}
            </div>
          ) : mode === 'OPTIMIZE' ? (
            <div className="flex flex-wrap items-center gap-1.5 flex-1 sm:flex-initial">
              <div className="flex items-center gap-1.5 border border-line2 bg-void/90 px-2.5 py-1 shadow-inner focus-within:border-nexus focus-within:ring-1 focus-within:ring-nexus/40">
                <span className="text-3xs text-nexus font-bold bg-nexus/15 border border-nexus/40 px-1 py-0.2">
                  DEPOT
                </span>
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  aria-label="Optimization depot origin"
                  placeholder="depot / origin address…"
                  className={`${inputBase} ${tablet ? 'w-36 sm:w-48 flex-1' : 'w-48'}`}
                />
                <button
                  type="button"
                  onClick={handleUseGpsLocation}
                  disabled={gpsLoading}
                  className="text-slate-300 hover:text-nexus p-1 transition-colors min-h-[30px] min-w-[30px] flex items-center justify-center"
                  title="Use My Location (GPS)"
                >
                  <LocateFixedIcon className={`h-3.5 w-3.5 ${gpsLoading ? 'animate-spin text-nexus' : ''}`} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowStopsConfig((prev) => !prev)}
                className={`flex min-h-[36px] items-center gap-1.5 border px-2.5 py-1 text-3xs font-bold transition-colors ${
                  showStopsConfig
                    ? 'border-nexus bg-nexus/25 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.2)]'
                    : 'border-line2 bg-surface text-slate-300 hover:text-white hover:border-nexus/50'
                }`}
                title="Configure Stops Pool"
              >
                <LayersIcon className="h-3.5 w-3.5" />
                <span>STOPS ({optimizeStops.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setRoundTrip((prev) => !prev)}
                className={`flex min-h-[36px] items-center px-2.5 py-1 text-3xs font-bold border transition-colors ${
                  roundTrip
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                    : 'border-line2 bg-void text-slate-400 hover:text-slate-200 hover:border-line'
                }`}
                title="Toggle return to origin hub"
              >
                ROUNDTRIP: {roundTrip ? 'YES' : 'NO'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 flex-1 sm:flex-initial">
              <div className="flex items-center gap-1.5 border border-line2 bg-void/90 px-2.5 py-1 shadow-inner focus-within:border-nexus focus-within:ring-1 focus-within:ring-nexus/40">
                <span className="text-3xs text-nexus font-bold bg-nexus/15 border border-nexus/40 px-1 py-0.2">
                  FROM
                </span>
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  aria-label="Route origin"
                  placeholder="origin address…"
                  className={`${inputBase} ${tablet ? 'w-36 sm:w-48 flex-1' : 'w-48'}`}
                />
                <button
                  type="button"
                  onClick={handleUseGpsLocation}
                  disabled={gpsLoading}
                  className="text-slate-300 hover:text-nexus p-1 transition-colors min-h-[30px] min-w-[30px] flex items-center justify-center"
                  title="Use My Location (GPS)"
                >
                  <LocateFixedIcon className={`h-3.5 w-3.5 ${gpsLoading ? 'animate-spin text-nexus' : ''}`} />
                </button>
              </div>

              <button
                type="button"
                onClick={handleSwapRoute}
                className="flex h-8 w-8 items-center justify-center border border-line2 bg-surface text-slate-200 hover:text-nexus hover:border-nexus transition-colors shadow-sm active:scale-95 shrink-0"
                title="Swap Origin and Destination"
              >
                <ArrowLeftRightIcon className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-1.5 border border-line2 bg-void/90 px-2.5 py-1 shadow-inner focus-within:border-nexus focus-within:ring-1 focus-within:ring-nexus/40">
                <span className="text-3xs text-hazard font-bold bg-hazard/15 border border-hazard/40 px-1 py-0.2">
                  TO
                </span>
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  aria-label="Route destination"
                  placeholder="destination address…"
                  className={`${inputBase} ${tablet ? 'w-36 sm:w-48 flex-1' : 'w-48'}`}
                />
              </div>
            </div>
          )}

          {mode === 'SEARCH' ? (
            <div className="flex items-center gap-1.5">
              <TermButton
                type="submit"
                disabled={isCalculatingRoute}
                className="flex min-h-[36px] items-center gap-1.5 font-bold border-line2 bg-surface text-slate-200 hover:border-nexus hover:text-white active:scale-95 transition-all"
                title="Pinpoint searched location on map"
              >
                <NavigationIcon className="h-3 w-3 text-nexus" aria-hidden />
                <span>[ GO ] PINPOINT</span>
              </TermButton>

              <TermButton
                type="button"
                onClick={() => handleSwitchToRouteFromSearch(query)}
                disabled={isCalculatingRoute || !query.trim()}
                className="flex min-h-[36px] items-center gap-1.5 font-bold shadow-[0_0_12px_rgba(0,243,255,0.3)] border-nexus bg-nexus/25 text-nexus hover:bg-nexus hover:text-void active:scale-95 transition-all"
                title="Switch to Route with this postal code / address as destination"
              >
                <RouteIcon className="h-3.5 w-3.5 text-nexus" aria-hidden />
                <span>[ GO ] ROUTE</span>
              </TermButton>
            </div>
          ) : mode === 'OPTIMIZE' ? (
            <TermButton
              type="submit"
              disabled={isCalculatingRoute}
              className="flex min-h-[36px] items-center gap-1.5 font-bold shadow-[0_0_12px_rgba(0,243,255,0.25)] border-nexus bg-nexus/20 text-nexus hover:bg-nexus hover:text-void active:scale-95"
            >
              {isCalculatingRoute ? (
                <>
                  <RefreshCwIcon className="h-3 w-3 animate-spin text-nexus" aria-hidden />
                  <span>OPTIMIZING TRANSIT / ROAD ROUTE…</span>
                </>
              ) : (
                <>
                  <RouteIcon className="h-3 w-3 text-nexus" aria-hidden />
                  <span>[ GO ] OPTIMIZE ROUTE</span>
                </>
              )}
            </TermButton>
          ) : (
            <TermButton
              type="submit"
              disabled={isCalculatingRoute}
              className="flex min-h-[36px] items-center gap-1.5 font-bold shadow-[0_0_12px_rgba(0,243,255,0.25)] border-nexus bg-nexus/20 text-nexus hover:bg-nexus hover:text-void active:scale-95"
            >
              {isCalculatingRoute ? (
                <>
                  <RefreshCwIcon className="h-3 w-3 animate-spin text-nexus" aria-hidden />
                  <span>ACQUIRING ROAD VECTORS & MANEUVERS…</span>
                </>
              ) : (
                <>
                  <RouteIcon className="h-3 w-3 text-nexus" aria-hidden />
                  <span>[ GO ] COMPUTE ROUTE</span>
                </>
              )}
            </TermButton>
          )}
        </form>
      </header>

      {/* Connected Search & Route Banner for Postal / Zipcode */}
      {mode === 'SEARCH' && isPostalOrZip && (
        <div className="border-b border-cyan-500/40 bg-cyan-500/[0.12] px-3 py-1.5 text-3xs flex flex-wrap items-center justify-between gap-2 backdrop-blur-sm shadow-inner animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <RouteIcon className="h-3.5 w-3.5 text-cyan-400" />
              POSTAL / ZIP CODE DETECTED:
            </span>
            <span className="font-bold text-white bg-void px-2 py-0.5 border border-cyan-400/60 uppercase shadow-sm">
              {query.trim()}
            </span>
            <span className="text-slate-300 hidden md:inline text-3xs">
              Search & Route connected — click [GO] ROUTE to switch to the routing feature
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSwitchToRouteFromSearch(query)}
            className="flex items-center gap-1.5 border border-cyan-400 bg-cyan-500/25 px-2.5 py-1 text-3xs font-bold text-cyan-200 hover:bg-cyan-500 hover:text-void shadow-[0_0_8px_rgba(0,243,255,0.3)] transition-all"
          >
            <RouteIcon className="h-3 w-3" />
            <span>[ GO ] ROUTE TO THIS CODE</span>
          </button>
        </div>
      )}

      {/* Multi-Stop Dispatch Configuration Drawer (When in OPTIMIZE mode) */}
      {mode === 'OPTIMIZE' && showStopsConfig && (
        <div className="border-b border-nexus/30 bg-surface/95 px-3 py-2 text-3xs backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-nexus">DISPATCH STOPS POOL ({optimizeStops.length})</span>
              <span className="text-dimmer text-4xs">Route optimizer orders stops to minimize real travel duration</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const candidate = clientEntities.find(
                    (c) => !optimizeStops.some((s) => s.address.toLowerCase() === c.normalizedAddress.toLowerCase()),
                  )
                  if (candidate) {
                    setOptimizeStops((prev) => [
                      ...prev,
                      {
                        id: `STOP-${prev.length + 1}`,
                        address: candidate.normalizedAddress,
                        name: candidate.name,
                      },
                    ])
                  }
                }}
                className="border border-nexus/50 bg-nexus/15 px-2 py-0.5 text-4xs font-bold text-nexus hover:bg-nexus hover:text-void transition-colors"
              >
                + ADD NEXT ACTIVE CLIENT
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <div className="flex items-center gap-1 border border-line bg-void px-2 py-0.5 flex-1 min-w-[240px]">
              <input
                value={newStopInput}
                onChange={(e) => setNewStopInput(e.target.value)}
                placeholder="type address or postcode to add stop…"
                className={`${inputBase} w-full`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newStopInput.trim()) {
                    e.preventDefault()
                    setOptimizeStops((prev) => [
                      ...prev,
                      {
                        id: `STOP-${prev.length + 1}`,
                        address: newStopInput.trim(),
                        name: newStopInput.split(',')[0].trim(),
                      },
                    ])
                    setNewStopInput('')
                  }
                }}
              />
            </div>
            <button
              type="button"
              disabled={!newStopInput.trim()}
              onClick={() => {
                if (!newStopInput.trim()) return
                setOptimizeStops((prev) => [
                  ...prev,
                  {
                    id: `STOP-${prev.length + 1}`,
                    address: newStopInput.trim(),
                    name: newStopInput.split(',')[0].trim(),
                  },
                ])
                setNewStopInput('')
              }}
              className="border border-line bg-surface px-2.5 py-1 text-4xs font-bold text-ink hover:border-nexus hover:text-nexus disabled:opacity-40 transition-colors"
            >
              ADD STOP
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto term-scroll">
            {optimizeStops.map((stop, sIdx) => (
              <div
                key={stop.id || sIdx}
                className="flex items-center gap-1.5 border border-line/60 bg-void/90 px-2 py-1 text-4xs"
              >
                <span className="font-bold text-nexus font-mono">#{sIdx + 1}</span>
                <span className="text-ink font-semibold max-w-xs truncate">{stop.name || stop.address}</span>
                <button
                  type="button"
                  onClick={() => {
                    setOptimizeStops((prev) => prev.filter((_, i) => i !== sIdx))
                  }}
                  className="text-dimmer hover:text-hazard ml-1"
                  title="Remove stop"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Stage: Map Frame + Collapsible Entity Navigation Sidebar */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Map Display Stage */}
        <div className="relative flex flex-col min-h-0 flex-1 bg-void overflow-hidden">
          {/* Top Route Metrics Telemetry Bar (Prominent in ROUTE & OPTIMIZE modes) */}
          {(mode === 'ROUTE' || mode === 'OPTIMIZE') && (
            <div className="border-b border-nexus/40 bg-surface/95 px-3 py-2 text-3xs backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Metric 1: Travel Duration */}
                <div className="flex items-center gap-2.5 border-r border-line2 pr-3.5">
                  <div className="flex h-9 w-9 items-center justify-center border border-nexus/60 bg-nexus/20 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]">
                    <ClockIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-3xs text-slate-300 uppercase font-bold tracking-wider">
                        Est. Duration
                      </span>
                      {routeMetrics?.timeSavedMinutes !== undefined && routeMetrics.timeSavedMinutes > 0 ? (
                        <span className="font-mono text-4xs font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/50 px-1.5 py-0.2 animate-pulse">
                          SAVED {routeMetrics.timeSavedMinutes} MINS ({routeMetrics.percentageSaved}% GAIN)
                        </span>
                      ) : (
                        <span className="font-mono text-4xs font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/50 px-1.5 py-0.2">
                          {travelMode === 'transit' ? 'REAL-TIME TRANSIT' : 'FASTEST ROUTE'}
                        </span>
                      )}
                    </div>
                    <div className="text-base font-bold text-nexus tracking-wide">
                      {isCalculatingRoute ? (
                        <span className="animate-pulse">CALCULATING…</span>
                      ) : (
                        routeMetrics?.durationText || '—'
                      )}
                    </div>
                  </div>
                </div>

                {/* Metric 2: Road Distance */}
                <div className="flex items-center gap-2.5 border-r border-line2 pr-3.5">
                  <div className="flex h-9 w-9 items-center justify-center border border-line2 bg-void text-white shadow-inner">
                    <CompassIcon className="h-4 w-4 text-hazard" />
                  </div>
                  <div>
                    <div className="text-3xs text-slate-300 uppercase font-bold tracking-wider">
                      {mode === 'OPTIMIZE' ? `Path (${optimizeStops.length} Stops)` : 'Path Distance'}
                    </div>
                    <div className="text-base font-bold text-white tracking-wide">
                      {isCalculatingRoute ? (
                        <span className="animate-pulse">MEASURING…</span>
                      ) : (
                        routeMetrics?.distanceText || '—'
                      )}
                    </div>
                  </div>
                </div>

                {/* Metric 3: Travel Mode Switcher */}
                <div className="flex items-center gap-1.5">
                  <span className="text-3xs text-slate-300 font-bold hidden sm:inline">MODE:</span>
                  <div className="flex items-center border border-line2 bg-void/90 p-0.5 shadow-inner">
                    <button
                      type="button"
                      onClick={() => handleChangeTravelMode('driving')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-3xs font-bold transition-all ${
                        travelMode === 'driving'
                          ? 'bg-nexus text-void shadow-[0_0_8px_rgba(0,243,255,0.3)]'
                          : 'text-slate-300 hover:text-white hover:bg-surface2'
                      }`}
                      title="Driving route"
                    >
                      <CarIcon className="h-3.5 w-3.5" />
                      <span>DRIVE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeTravelMode('transit')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-3xs font-bold transition-all ${
                        travelMode === 'transit'
                          ? 'bg-nexus text-void shadow-[0_0_8px_rgba(0,243,255,0.3)]'
                          : 'text-slate-300 hover:text-white hover:bg-surface2'
                      }`}
                      title="Public Transit Network"
                    >
                      <TrainIcon className="h-3.5 w-3.5" />
                      <span>TRANSIT</span>
                    </button>
                  </div>
                </div>

                {/* Metric 4: GPS & Routing Helpers */}
                <div className="flex items-center gap-1.5 ml-auto">
                  {mode === 'OPTIMIZE' && (
                    <button
                      type="button"
                      onClick={() => setShowStopsConfig((prev) => !prev)}
                      className="flex items-center gap-1 border border-nexus bg-nexus/20 px-2.5 py-1 text-nexus hover:bg-nexus hover:text-void font-bold transition-colors shadow-[0_0_8px_rgba(0,243,255,0.2)]"
                      title="Toggle Stops Manager"
                    >
                      <LayersIcon className="h-3.5 w-3.5" />
                      <span>MANAGE STOPS ({optimizeStops.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleUseGpsLocation}
                    disabled={gpsLoading}
                    className="flex items-center gap-1 border border-line2 bg-surface px-2.5 py-1 text-slate-200 hover:text-nexus hover:border-nexus transition-colors shadow-sm"
                    title="Lock route origin to current GPS location"
                  >
                    <LocateFixedIcon className={`h-3.5 w-3.5 ${gpsLoading ? 'animate-spin text-nexus' : ''}`} />
                    <span className="hidden md:inline font-bold">MY GPS</span>
                  </button>

                  <a
                    href={buildExternalMapsUrl(origin, destination, travelMode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 border border-nexus bg-nexus/25 px-3 py-1 font-bold text-nexus hover:bg-nexus hover:text-void transition-colors shadow-[0_0_10px_rgba(0,243,255,0.25)]"
                    title="Open live Google Maps fastest route with real-time traffic"
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    <span>GOOGLE MAPS (LIVE)</span>
                  </a>
                </div>
              </div>

              {/* Transcontinental / Cross-Ocean Regional Notice Banner */}
              {routeMetrics?.isTranscontinental && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-hazard/40 bg-hazard/10 p-2 text-hazard">
                  <div className="flex items-center gap-2">
                    <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                    <span>
                      <strong>TRANSCONTINENTAL DESTINATION:</strong> Direct road navigation cannot cross oceans between{' '}
                      <em>{routeMetrics.cleanOrigin}</em> and <em>{routeMetrics.cleanDestination}</em>. Pinpointing destination on map.
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {routeMetrics.cleanDestination.toLowerCase().includes('london') && (
                      <button
                        type="button"
                        onClick={() => handleSetOriginToDestinationRegion('London, UK')}
                        className="border border-hazard/60 bg-hazard/20 px-2 py-0.5 text-3xs font-bold hover:bg-hazard hover:text-void transition-colors"
                      >
                        SET ORIGIN TO LONDON HUB
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleUseGpsLocation}
                      className="border border-hazard/60 bg-hazard/20 px-2 py-0.5 text-3xs font-bold hover:bg-hazard hover:text-void transition-colors"
                    >
                      USE MY GPS
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Map Display Stage (Interactive Vector vs Google Embed) */}
          <div className="relative flex-1 min-h-0 bg-void">
            {mapEngine === 'INTERACTIVE' ? (
              <ZenithMap
                mode={mode}
                originLabel={origin}
                destinationLabel={destination}
                routeMetrics={routeMetrics}
                singleLocationCoords={singleLocationCoords}
                singleLocationLabel={label}
                travelMode={travelMode}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                clientCount={clientEntities.length}
                isVisible={isVisible}
                googleMapsUrl={
                  mode === 'ROUTE' || mode === 'OPTIMIZE'
                    ? buildExternalMapsUrl(origin, destination, travelMode)
                    : buildExternalMapsUrl(query)
                }
                isCalculatingRoute={isCalculatingRoute}
                className="h-full w-full"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className="absolute right-3 top-3 z-[1001] flex items-center gap-1.5 border border-nexus/80 bg-void/90 px-2.5 py-1.5 text-3xs font-bold text-nexus shadow-[0_0_15px_rgba(0,242,255,0.3)] backdrop-blur-md hover:bg-nexus hover:text-void transition-all"
                  title="Toggle Client Navigation Sidebar"
                >
                  {isSidebarOpen ? (
                    <PanelRightCloseIcon className="h-3.5 w-3.5" />
                  ) : (
                    <PanelRightOpenIcon className="h-3.5 w-3.5" />
                  )}
                  <span>CLIENT NAV ({clientEntities.length})</span>
                </button>
                <iframe
                  key={src}
                  title={`Map projection — ${label}`}
                  src={src}
                  className="h-full w-full"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </>
            )}
          </div>

          {/* Active Navigation HUD Box at bottom */}
          {/* Active Navigation HUD Box at bottom */}
          <div className="border-t border-nexus/40 bg-surface/95 px-3 py-2 backdrop-blur-md text-3xs flex flex-wrap items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2.5 truncate">
              <span className="font-bold text-nexus shrink-0 tracking-wider text-xs text-glow-nexus">
                {mode === 'ROUTE' ? 'ACTIVE ROUTE //' : mode === 'OPTIMIZE' ? 'OPTIMIZED DISPATCH //' : 'PINPOINT //'}
              </span>
              <span className="text-white font-bold truncate text-xs">{label}</span>
              {(mode === 'ROUTE' || mode === 'OPTIMIZE') && routeMetrics && (
                <div className="hidden sm:flex items-center gap-2">
                  <Pill className="border-nexus bg-nexus/20 text-nexus font-bold shadow-[0_0_8px_rgba(0,243,255,0.25)]">
                    {routeMetrics.durationText} · {routeMetrics.distanceText}
                  </Pill>
                  {routeMetrics.etaText && (
                    <Pill className="border-amber-500/60 bg-amber-500/20 text-amber-300 font-bold">
                      ETA {routeMetrics.etaText}
                    </Pill>
                  )}
                  {routeMetrics.pathCorridor && (
                    <Pill className="border-line2 bg-void text-slate-200 hidden lg:inline-flex truncate max-w-xs font-semibold">
                      {routeMetrics.pathCorridor}
                    </Pill>
                  )}
                </div>
              )}
              {selectedEntity && (
                <Pill className="border-hazard/70 bg-hazard/20 text-hazard text-glow-hazard hidden md:inline-flex font-bold shadow-[0_0_10px_rgba(255,49,49,0.4)]">
                  CLIENT: {selectedEntity.name} [{selectedEntity.entityId}]
                </Pill>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMapEngine((prev) => (prev === 'INTERACTIVE' ? 'GOOGLE_EMBED' : 'INTERACTIVE'))}
                className={`flex items-center gap-1.5 border px-2.5 py-1 text-3xs font-bold transition-all ${
                  mapEngine === 'INTERACTIVE'
                    ? 'border-nexus bg-nexus/25 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                    : 'border-line2 bg-surface text-slate-300 hover:text-white hover:border-line'
                }`}
                title="Toggle between Zenith Tactical Map and Google Embed"
              >
                <LayersIcon className="h-3.5 w-3.5" />
                <span>{mapEngine === 'INTERACTIVE' ? 'TACTICAL ENGINE' : 'GOOGLE EMBED'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="flex items-center gap-1.5 border border-line2 bg-surface px-2.5 py-1 text-slate-200 hover:text-nexus hover:border-nexus transition-colors shadow-sm font-semibold"
                title="Copy Google Maps Navigation Link"
              >
                {copiedLink ? <CheckIcon className="h-3.5 w-3.5 text-nexus" /> : <CopyIcon className="h-3.5 w-3.5" />}
                <span>{copiedLink ? 'COPIED' : 'SHARE LINK'}</span>
              </button>

              <a
                href={
                  mode === 'ROUTE'
                    ? buildExternalMapsUrl(origin, destination, travelMode)
                    : buildExternalMapsUrl(query)
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 border border-nexus bg-nexus/20 px-3 py-1 font-bold text-nexus hover:bg-nexus hover:text-void transition-colors shadow-[0_0_8px_rgba(0,243,255,0.2)]"
                title="Open native Google Maps in external window"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" />
                <span>NATIVE GOOGLE MAPS</span>
              </a>
            </div>
          </div>
        </div>

        {/* Collapsed Sidebar Rail: Sleek interactive vertical strip */}
        {!isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setIsSidebarOpen(true)
            }}
            className="relative z-10 flex w-9 shrink-0 flex-col items-center justify-between border-l border-line bg-surface/95 py-2.5 transition-colors hover:bg-surface2 hover:border-nexus/60 cursor-pointer select-none group"
            title="Expand Client Navigation Sidebar (Click or press Enter)"
          >
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsSidebarOpen(true)
                }}
                className="flex h-7 w-7 items-center justify-center border border-line bg-void text-nexus hover:border-nexus hover:bg-nexus/20 transition-all shadow-[0_0_8px_rgba(0,242,255,0.2)]"
                title="Expand Client Navigation"
              >
                <PanelRightOpenIcon className="h-3.5 w-3.5" />
              </button>
              <span className="text-4xs font-bold text-nexus bg-nexus/15 border border-nexus/40 px-1 py-0.5">
                {clientEntities.length}
              </span>
            </div>

            {/* Vertical rotated label */}
            <div className="flex-1 flex items-center justify-center py-4">
              <span className="font-mono text-3xs font-bold tracking-[0.2em] text-dimmer group-hover:text-nexus transition-colors [writing-mode:vertical-rl] rotate-180 uppercase whitespace-nowrap flex items-center gap-2">
                <LayersIcon className="h-3 w-3 inline rotate-90 text-nexus" />
                CLIENT_NAVIGATION
              </span>
            </div>

            {/* Corridor pulse if in route mode */}
            {mode === 'ROUTE' ? (
              <div className="flex flex-col items-center gap-1" title="Active Route In Progress">
                <span className="h-2 w-2 rounded-full bg-nexus animate-pulse shadow-[0_0_6px_#00f2ff]" />
                <span className="text-4xs text-nexus font-mono font-bold uppercase">RT</span>
              </div>
            ) : (
              <span className="text-4xs text-dimmer font-mono uppercase">OS</span>
            )}
          </div>
        )}

        {/* Right Sidebar: Client Navigation & Address Hub */}
        {isSidebarOpen && (
          <div
            className={`relative z-10 flex flex-col min-h-0 shrink-0 border-l border-line bg-surface transition-all duration-200 ${
              tablet
                ? 'w-full max-w-[380px] absolute right-0 inset-y-0 z-30 shadow-2xl bg-surface'
                : sidebarWidth === 'WIDE'
                  ? 'w-[420px]'
                  : 'w-[360px]'
            }`}
          >
            {/* Sidebar Controls & Header */}
            <div className="border-b border-line2 p-2.5 space-y-2 bg-surface2/80">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wide">
                  <LayersIcon className="h-4 w-4 text-nexus shrink-0" />
                  <span>CLIENT_NAVIGATION</span>
                  <span className="text-nexus px-1.5 py-0.5 bg-nexus/20 border border-nexus/50 font-bold text-3xs shadow-[0_0_8px_rgba(0,243,255,0.2)]">
                    {clientEntities.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Wide (420px) / Compact (360px) width toggle */}
                  <button
                    type="button"
                    onClick={() => setSidebarWidth((prev) => (prev === 'WIDE' ? 'COMPACT' : 'WIDE'))}
                    className={`border px-2 py-0.5 text-3xs font-bold transition-all shadow-sm ${
                      sidebarWidth === 'WIDE'
                        ? 'border-nexus bg-nexus/25 text-nexus'
                        : 'border-line2 bg-surface text-slate-200 hover:text-white hover:border-line'
                    }`}
                    title="Toggle Wide (420px) / Compact (360px) width for viewing detailed address records without truncation"
                  >
                    {sidebarWidth === 'WIDE' ? 'WIDE 420px' : 'COMPACT 360px'}
                  </button>

                  {/* Collapse Sidebar toggle */}
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className="border border-line2 bg-surface p-1 text-slate-300 hover:text-nexus hover:border-nexus transition-colors shadow-sm"
                    title="Collapse Client Navigation Sidebar"
                  >
                    <PanelRightCloseIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Active Dispatch Corridor Summary Card */}
              {mode === 'ROUTE' && (
                <div className="border border-nexus/60 bg-surface/90 p-2.5 space-y-2 shadow-[0_0_14px_rgba(0,243,255,0.12)]">
                  <div className="flex items-center justify-between text-3xs font-bold">
                    <div className="flex items-center gap-1.5 text-nexus">
                      <span className="h-2 w-2 rounded-full bg-nexus animate-pulse shadow-[0_0_8px_#00f3ff]" />
                      <span className="text-xs tracking-wider">ACTIVE DISPATCH CORRIDOR</span>
                    </div>
                    <span className="text-3xs px-2 py-0.5 bg-nexus/20 border border-nexus/40 text-nexus font-bold uppercase shadow-[0_0_6px_rgba(0,243,255,0.2)]">
                      [{travelMode.toUpperCase()}]
                    </span>
                  </div>

                  {/* Origin & Destination rows with direct swap control */}
                  <div className="space-y-1.5 pl-1">
                    {/* Origin */}
                    <div className="flex items-start gap-2 text-3xs">
                      <div className="mt-1 h-2 w-2 rounded-full bg-nexus shadow-[0_0_6px_#00f3ff] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-nexus font-bold text-3xs tracking-wider">ORIGIN:</span>
                          {extractPostalCode(origin) && (
                            <span className="font-mono text-3xs text-amber-300 font-bold bg-amber-500/20 border border-amber-500/50 px-1">
                              #{extractPostalCode(origin)}
                            </span>
                          )}
                        </div>
                        <div className="text-white font-bold text-xs truncate mt-0.5" title={origin}>
                          {origin}
                        </div>
                      </div>
                    </div>

                    {/* Swap Corridor Vector Button */}
                    <div className="flex items-center justify-between border-y border-line2/80 py-1 px-2 bg-void/60">
                      <span className="text-4xs text-slate-300 font-mono font-bold uppercase tracking-wider">
                        DISPATCH VECTOR
                      </span>
                      <button
                        type="button"
                        onClick={handleSwapRoute}
                        className="flex items-center gap-1 border border-line2 bg-surface px-2 py-0.5 text-3xs font-bold text-slate-200 hover:text-nexus hover:border-nexus transition-colors shadow-sm"
                        title="Swap Origin and Destination Waypoints"
                      >
                        <ArrowLeftRightIcon className="h-3 w-3 text-nexus" />
                        <span>SWAP CORRIDOR</span>
                      </button>
                    </div>

                    {/* Destination */}
                    <div className="flex items-start gap-2 text-3xs">
                      <div className="mt-1 h-2 w-2 rounded-full bg-hazard shadow-[0_0_6px_#ff3344] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-hazard font-bold text-3xs tracking-wider">DESTINATION:</span>
                          {extractPostalCode(destination) && (
                            <span className="font-mono text-3xs text-amber-300 font-bold bg-amber-500/20 border border-amber-500/50 px-1">
                              #{extractPostalCode(destination)}
                            </span>
                          )}
                        </div>
                        <div className="text-hazard text-glow-hazard font-bold text-xs truncate mt-0.5 drop-shadow-[0_0_8px_rgba(255,49,49,0.7)]" title={destination}>
                          {destination}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Telemetry metrics strip */}
                  <div className="space-y-1.5 border-t border-line2/80 pt-2 text-3xs">
                    <div className="flex items-center justify-between text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <ClockIcon className="h-3.5 w-3.5 text-nexus" />
                        <span className="text-nexus font-bold text-xs">{routeMetrics?.durationText || 'CALCULATING…'}</span>
                        {routeMetrics?.etaText && (
                          <span className="text-3xs text-amber-300 font-bold bg-amber-500/20 px-1.5 py-0.2 border border-amber-500/40">
                            ETA {routeMetrics.etaText}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <NavigationIcon className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-white font-bold text-xs">{routeMetrics?.distanceText || '—'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void executeRouteCalculation(origin, destination)}
                        className="text-slate-300 hover:text-nexus text-3xs font-bold uppercase transition-colors"
                        title="Recalculate route metrics"
                      >
                        REFRESH
                      </button>
                    </div>
                    {routeMetrics?.pathCorridor && (
                      <div className="flex items-center justify-between text-3xs text-slate-300 font-mono">
                        <span className="truncate max-w-[220px] text-slate-200 font-semibold">{routeMetrics.pathCorridor}</span>
                        <span className="text-emerald-300 font-bold bg-emerald-500/20 border border-emerald-500/40 px-1.5">
                          GOOGLE MATCH
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-tabs: CLIENTS vs HUBS */}
              <div className="grid grid-cols-2 gap-1 border border-line2 bg-void/90 p-0.5 text-3xs font-bold shadow-inner">
                <button
                  type="button"
                  onClick={() => setNavTab('CLIENTS')}
                  className={`py-1 text-center transition-all ${
                    navTab === 'CLIENTS'
                      ? 'bg-nexus/25 text-nexus border border-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                      : 'border border-transparent text-slate-300 hover:text-white hover:bg-surface2'
                  }`}
                >
                  CLIENTS ({clientEntities.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNavTab('HUBS')}
                  className={`py-1 text-center transition-all ${
                    navTab === 'HUBS'
                      ? 'bg-nexus/25 text-nexus border border-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                      : 'border border-transparent text-slate-300 hover:text-white hover:bg-surface2'
                  }`}
                >
                  HUBS ({addressClusters.length})
                </button>
              </div>

              {/* Scope Filtering Pills */}
              <div className="grid grid-cols-3 gap-1 text-3xs font-bold">
                <button
                  type="button"
                  onClick={() => setScopeFilter('ALL')}
                  className={`py-1 px-1 text-center truncate border transition-all ${
                    scopeFilter === 'ALL'
                      ? 'border-nexus bg-nexus/25 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                      : 'border-line2 bg-surface text-slate-300 hover:text-white hover:border-line'
                  }`}
                  title="Show all registered clients"
                >
                  ALL ({navTab === 'CLIENTS' ? scopeCounts.allClients : scopeCounts.allHubs})
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('IN_ROUTE')}
                  className={`py-1 px-1 text-center truncate border transition-all ${
                    scopeFilter === 'IN_ROUTE'
                      ? 'border-nexus bg-nexus/25 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                      : 'border-line2 bg-surface text-slate-300 hover:text-white hover:border-line'
                  }`}
                  title="Show entities actively participating in current route"
                >
                  IN ROUTE ({navTab === 'CLIENTS' ? scopeCounts.inRouteClients : scopeCounts.inRouteHubs})
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('UK_HUBS')}
                  className={`py-1 px-1 text-center truncate border transition-all ${
                    scopeFilter === 'UK_HUBS'
                      ? 'border-nexus bg-nexus/25 text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                      : 'border-line2 bg-surface text-slate-300 hover:text-white hover:border-line'
                  }`}
                  title="Filter to UK logistics hubs with postal code verification"
                >
                  UK HUBS ({navTab === 'CLIENTS' ? scopeCounts.ukClients : scopeCounts.ukHubs})
                </button>
              </div>

              {/* Freeform Instant Search bar */}
              <div className="flex items-center gap-2 border border-line2 bg-void/90 px-2.5 py-1.5 focus-within:border-nexus focus-within:ring-1 focus-within:ring-nexus/40 shadow-inner">
                <FilterIcon className="h-3.5 w-3.5 text-nexus shrink-0" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="filter name, address, postal code (e.g. ME20, LU5, CL-101)…"
                  className="w-full bg-transparent text-xs text-white placeholder:text-slate-400 outline-none font-semibold"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-xs text-slate-300 hover:text-hazard font-bold px-1"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* List Body */}
            <div className="term-scroll flex-1 overflow-y-auto p-2 space-y-2">
              {/* 1. CLIENTS TAB: Disambiguated Unique Clients */}
              {navTab === 'CLIENTS' && (
                <div className="space-y-2">
                  {filteredClients.map((client) => {
                    const isOrig = isClientActiveOrigin(client)
                    const isDest = isClientActiveDestination(client)
                    const postCode = extractPostalCode(client.address || client.normalizedAddress)

                    return (
                      <div
                        key={client.entityId}
                        className={`border p-2.5 space-y-2 transition-all relative ${
                          isDest
                            ? 'border-hazard bg-hazard/15 shadow-[0_0_14px_rgba(255,51,68,0.25)] border-l-4 border-l-hazard'
                            : isOrig
                              ? 'border-nexus bg-nexus/15 shadow-[0_0_14px_rgba(0,243,255,0.25)] border-l-4 border-l-nexus'
                              : selectedEntityId === client.entityId
                                ? 'border-hazard/80 bg-hazard/10 shadow-[0_0_12px_rgba(255,49,49,0.2)] ring-1 ring-hazard/40'
                                : 'border-line2 bg-surface/90 hover:border-hazard/60 hover:bg-surface'
                        }`}
                      >
                        {/* Top row: Client identity + route status badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <Building2Icon className="h-3.5 w-3.5 text-hazard shrink-0 drop-shadow-[0_0_6px_rgba(255,49,49,0.7)]" />
                              <span className="text-nexus text-xs font-bold bg-nexus/15 border border-nexus/40 px-1 py-0.2">
                                [{client.entityId}]
                              </span>
                              <span className="truncate text-hazard text-glow-hazard font-bold tracking-wide drop-shadow-[0_0_8px_rgba(255,49,49,0.85)]">
                                {client.name}
                              </span>
                            </div>
                            {client.operatorContact && (
                              <div className="text-3xs text-slate-300 font-medium mt-1">
                                Contact: <span className="text-white font-semibold">{client.operatorContact}</span>
                              </div>
                            )}
                            {client.phone && (
                              <div className="text-3xs font-mono font-bold text-nexus mt-1 flex items-center gap-1">
                                <span className="text-slate-400">TEL:</span>
                                <span className="text-nexus">{client.phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Dynamic Route State Badge */}
                          <div className="flex items-center gap-1 shrink-0">
                            {isDest && (
                              <span className="px-2 py-0.5 text-4xs font-bold bg-hazard/20 border border-hazard text-hazard tracking-wider animate-pulse shadow-[0_0_6px_rgba(255,51,68,0.3)]">
                                DESTINATION
                              </span>
                            )}
                            {isOrig && (
                              <span className="px-2 py-0.5 text-4xs font-bold bg-nexus/20 border border-nexus text-nexus tracking-wider animate-pulse shadow-[0_0_6px_rgba(0,243,255,0.3)]">
                                ORIGIN
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Address row with postal code badge */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-200 truncate flex-1 min-w-0 font-medium">
                            <MapPinIcon className="h-3.5 w-3.5 text-nexus shrink-0" />
                            <span className="truncate text-slate-200" title={client.normalizedAddress}>
                              {client.normalizedAddress}
                            </span>
                          </div>
                          {postCode && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-3xs font-bold bg-amber-500/20 border border-amber-500/70 text-amber-300 tracking-wider shadow-[0_0_8px_rgba(245,158,11,0.25)] shrink-0"
                              title={`Postal Code: ${postCode}`}
                            >
                              <span className="text-4xs text-amber-400/80">#</span>
                              {postCode}
                            </span>
                          )}
                        </div>

                        {/* 4-Button Client Action Suite */}
                        <div className="grid grid-cols-4 gap-1.5 border-t border-line2/80 pt-2 text-3xs font-bold">
                          {/* 1. TO DEST / [ GO ] ROUTE */}
                          <button
                            type="button"
                            onClick={() =>
                              handleRouteToAddress(
                                client.normalizedAddress,
                                client.name,
                                client.entityId,
                              )
                            }
                            className={`flex items-center justify-center gap-1 border py-1 px-1 transition-all shadow-sm ${
                              isDest
                                ? 'border-hazard bg-hazard/30 text-hazard font-bold'
                                : 'border-nexus bg-nexus/20 text-nexus hover:bg-nexus hover:text-void shadow-[0_0_6px_rgba(0,243,255,0.2)]'
                            }`}
                            title={`Single-click: Set ${client.name} as destination, snap road polyline, and show turn-by-turn directions`}
                          >
                            <RouteIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">[ GO ] ROUTE</span>
                          </button>

                          {/* 2. FROM */}
                          <button
                            type="button"
                            onClick={() => handleSetOrigin(client.normalizedAddress, client.name)}
                            className={`flex items-center justify-center gap-1 border py-1 px-1 transition-colors shadow-sm ${
                              isOrig
                                ? 'border-nexus bg-nexus/30 text-nexus font-bold'
                                : 'border-line2 bg-surface text-slate-200 hover:text-nexus hover:border-nexus'
                            }`}
                            title={`Set ${client.name} as route origin waypoint`}
                          >
                            <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-nexus" />
                            <span className="truncate">FROM</span>
                          </button>

                          {/* 3. PIN */}
                          <button
                            type="button"
                            onClick={() =>
                              handlePinpointAddress(
                                client.normalizedAddress,
                                client.name,
                                client.entityId,
                              )
                            }
                            className="flex items-center justify-center gap-1 border border-line2 bg-surface py-1 px-1 text-slate-200 hover:text-nexus hover:border-nexus transition-colors shadow-sm"
                            title={`Pinpoint and focus ${client.name} on the tactical vector map`}
                          >
                            <LocateFixedIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">PIN</span>
                          </button>

                          {/* 4. COPY */}
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyClientAddress(
                                client.normalizedAddress,
                                client.entityId,
                                client.name,
                              )
                            }
                            className={`flex items-center justify-center gap-1 border py-1 px-1 transition-colors shadow-sm ${
                              copiedEntityId === client.entityId
                                ? 'border-nexus bg-nexus/30 text-nexus font-bold'
                                : 'border-line2 bg-surface text-slate-300 hover:text-white hover:border-line'
                            }`}
                            title="Copy canonical street and postal code address to clipboard"
                          >
                            {copiedEntityId === client.entityId ? (
                              <>
                                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-nexus" />
                                <span className="truncate text-nexus">COPIED</span>
                              </>
                            ) : (
                              <>
                                <CopyIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">COPY</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {filteredClients.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-300 font-semibold border border-dashed border-line2 bg-void/50">
                      NO ACTIVE CLIENTS MATCH FILTER OR ROUTE SCOPE
                    </div>
                  )}
                </div>
              )}

              {/* 2. HUBS TAB: Canonical Address Clusters with multiple associated clients */}
              {navTab === 'HUBS' && (
                <div className="space-y-2">
                  {filteredClusters.map((cluster) => {
                    const isMultiple = cluster.entities.length > 1
                    const postCode = extractPostalCode(cluster.displayAddress)
                    const isHubInRoute = cluster.entities.some(
                      (c) => isClientActiveOrigin(c) || isClientActiveDestination(c),
                    )

                    return (
                      <div
                        key={cluster.clusterKey}
                        className={`border p-2.5 transition-all space-y-2 shadow-sm ${
                          isHubInRoute
                            ? 'border-nexus bg-nexus/15 shadow-[0_0_12px_rgba(0,243,255,0.2)] border-l-4 border-l-nexus'
                            : 'border-line2 bg-surface/90 hover:border-nexus/60 hover:bg-surface'
                        }`}
                      >
                        {/* Address Cluster Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                              <MapPinIcon className="h-3.5 w-3.5 text-nexus shrink-0" />
                              <span className="truncate" title={cluster.displayAddress}>
                                {cluster.displayAddress}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 text-3xs font-semibold text-slate-300">
                              <span className="bg-void/80 px-1.5 py-0.2 border border-line2">
                                {cluster.clientCount} CLIENT{cluster.clientCount !== 1 ? 'S' : ''}
                              </span>
                              {postCode && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 font-mono text-3xs font-bold bg-amber-500/20 border border-amber-500/60 text-amber-300">
                                  #{postCode}
                                </span>
                              )}
                              {isHubInRoute && (
                                <span className="text-nexus font-bold text-3xs px-1.5 py-0.2 bg-nexus/20 border border-nexus/40">
                                  IN ROUTE
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Route & Pin buttons for entire hub */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                handleRouteToAddress(cluster.displayAddress, cluster.displayAddress)
                              }
                              className="border border-nexus bg-nexus/20 px-2.5 py-1 text-3xs font-bold text-nexus hover:bg-nexus hover:text-void transition-colors shadow-[0_0_6px_rgba(0,243,255,0.2)]"
                              title="Single-click: Compute road-snapped route & turn-by-turn directions to this hub"
                            >
                              [ GO ] ROUTE
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handlePinpointAddress(
                                  cluster.displayAddress,
                                  cluster.displayAddress,
                                )
                              }
                              className="border border-line2 bg-surface px-2 py-1 text-3xs font-bold text-slate-200 hover:text-nexus hover:border-nexus transition-colors shadow-sm"
                              title="Pinpoint hub coordinates on map"
                            >
                              PIN
                            </button>
                          </div>
                        </div>

                        {/* Disambiguated Entity List for this Address */}
                        <div className="border-t border-line2 pt-2 space-y-1.5">
                          {isMultiple && (
                            <div className="flex items-center gap-1.5 text-2xs text-slate-300 uppercase font-bold tracking-wider">
                              <UsersIcon className="h-3 w-3 text-nexus" />
                              <span>DISAMBIGUATED CLIENTS ({cluster.entities.length})</span>
                            </div>
                          )}

                          {cluster.entities.map((ent) => {
                            const isEntOrig = isClientActiveOrigin(ent)
                            const isEntDest = isClientActiveDestination(ent)

                            return (
                              <div
                                key={ent.entityId}
                                className={`border px-2.5 py-2 text-xs transition-colors space-y-1.5 rounded-none ${
                                  isEntDest
                                    ? 'border-hazard bg-hazard/15 text-hazard font-bold shadow-[0_0_8px_rgba(255,59,48,0.2)]'
                                    : isEntOrig
                                      ? 'border-nexus bg-nexus/15 text-nexus font-bold shadow-[0_0_8px_rgba(0,243,255,0.2)]'
                                      : selectedEntityId === ent.entityId
                                        ? 'border-nexus bg-nexus/10 text-white'
                                        : 'border-line2 bg-surface text-slate-200 hover:border-slate-500 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="px-1.5 py-0.2 text-3xs font-mono font-bold bg-nexus/20 border border-nexus/40 text-nexus shrink-0">
                                      {ent.entityId}
                                    </span>
                                    <span className="truncate font-bold tracking-wide text-hazard text-glow-hazard drop-shadow-[0_0_8px_rgba(255,49,49,0.85)]">
                                      {ent.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isEntDest && (
                                      <span className="text-3xs px-1.5 py-0.2 font-bold bg-hazard/20 border border-hazard text-hazard">
                                        DEST
                                      </span>
                                    )}
                                    {isEntOrig && (
                                      <span className="text-3xs px-1.5 py-0.2 font-bold bg-nexus/20 border border-nexus text-nexus">
                                        ORIG
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Action buttons inside hub row */}
                                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-line2/60">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRouteToAddress(
                                        ent.normalizedAddress,
                                        ent.name,
                                        ent.entityId,
                                      )
                                    }
                                    className="border border-nexus bg-nexus/20 px-2 py-0.5 text-3xs font-bold text-nexus hover:bg-nexus hover:text-void transition-colors"
                                    title={`Route to ${ent.name}`}
                                  >
                                    TO DEST
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetOrigin(ent.normalizedAddress, ent.name)}
                                    className="border border-line2 bg-void px-2 py-0.5 text-3xs font-semibold text-slate-300 hover:text-nexus hover:border-nexus transition-colors"
                                    title="Set as Origin"
                                  >
                                    FROM
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePinpointAddress(
                                        ent.normalizedAddress,
                                        ent.name,
                                        ent.entityId,
                                      )
                                    }
                                    className="border border-line2 bg-void px-2 py-0.5 text-3xs font-semibold text-slate-300 hover:text-nexus hover:border-nexus transition-colors"
                                    title="Pinpoint on map"
                                  >
                                    PIN
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyClientAddress(
                                        ent.normalizedAddress,
                                        ent.entityId,
                                        ent.name,
                                      )
                                    }
                                    className="border border-line2 bg-void px-2 py-0.5 text-3xs font-semibold text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
                                    title="Copy address"
                                  >
                                    {copiedEntityId === ent.entityId ? 'COPIED' : 'COPY'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {filteredClusters.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-300 font-semibold border border-dashed border-line2 bg-void/50">
                      NO ADDRESS HUBS MATCH FILTER OR ROUTE SCOPE
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Status Directive */}
            <div className="border-t border-line2 bg-surface2 px-3 py-2.5 text-2xs text-slate-300 flex items-center justify-between font-medium">
              <span className="flex items-center gap-1.5 text-white">
                <SparklesIcon className="h-3.5 w-3.5 text-nexus" />
                Live Telemetry Engine
              </span>
              <span className="font-mono text-nexus/90 text-3xs font-semibold uppercase tracking-wider">
                Valhalla / Road Network
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
