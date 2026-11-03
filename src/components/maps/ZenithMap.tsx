import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CompassIcon,
  CornerUpLeftIcon,
  CornerUpRightIcon,
  ExternalLinkIcon,
  FlagIcon,
  FootprintsIcon,
  LayersIcon,
  Maximize2Icon,
  Minimize2Icon,
  Navigation2Icon,
  NavigationIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Route as RouteIcon,
  TrainIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import type { RouteMetrics, RouteStep, TravelMode } from '../../utils/maps'

export type MapTileTheme = 'STREET' | 'SATELLITE' | 'DARK'

interface ZenithMapProps {
  mode: 'SEARCH' | 'ROUTE' | 'OPTIMIZE'
  originLabel?: string
  destinationLabel?: string
  routeMetrics?: RouteMetrics | null
  singleLocationCoords?: { lat: number; lng: number } | null
  singleLocationLabel?: string
  travelMode?: TravelMode
  className?: string
  isSidebarOpen?: boolean
  onToggleSidebar?: () => void
  clientCount?: number
  isVisible?: boolean
  googleMapsUrl?: string
  isCalculatingRoute?: boolean
}

const CARTO_API_KEY = 'cb1_3tbe_1_b33b63e86b97f7da1ea86776'

interface TileProviderConfig {
  url: string
  labelsUrl?: string
  attribution: string
  maxZoom: number
  subdomains?: string
}

const TILE_PROVIDERS: Record<MapTileTheme, TileProviderConfig> = {
  STREET: {
    url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
  SATELLITE: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
    maxZoom: 18,
  },
  DARK: {
    url: `https://basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    labelsUrl: `https://basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
}

export function ZenithMap({
  mode,
  originLabel = 'ORIGIN',
  destinationLabel = 'DESTINATION',
  routeMetrics,
  singleLocationCoords,
  singleLocationLabel = 'LOCATION',
  travelMode = 'driving',
  className = '',
  isSidebarOpen = true,
  onToggleSidebar,
  clientCount,
  isVisible = true,
  googleMapsUrl,
  isCalculatingRoute = false,
}: ZenithMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const currentTileLayerRef = useRef<L.TileLayer | null>(null)
  const currentLabelsLayerRef = useRef<L.TileLayer | null>(null)
  const pendingTileLayerRef = useRef<L.TileLayer | null>(null)
  const pendingLabelsLayerRef = useRef<L.TileLayer | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const stepFocusLayerRef = useRef<L.LayerGroup | null>(null)
  const [showTurnByTurn, setShowTurnByTurn] = useState(false)
  const [isHudMinimized, setIsHudMinimized] = useState(false)
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null)
  const [activeTheme, setActiveTheme] = useState<MapTileTheme>(() => {
    try {
      const saved = localStorage.getItem('zenith_map_layer') as MapTileTheme | null
      if (saved && (saved === 'STREET' || saved === 'SATELLITE' || saved === 'DARK')) {
        return saved
      }
    } catch {
      // ignore
    }
    return 'DARK'
  })
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleSelectTheme = (theme: MapTileTheme) => {
    if (theme === activeTheme) return
    setActiveTheme(theme)
    try {
      localStorage.setItem('zenith_map_layer', theme)
    } catch {
      // ignore
    }
  }

  // Invalidate map size when tab visibility changes or container unhides
  useEffect(() => {
    if (isVisible && mapInstanceRef.current) {
      const timer = window.setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 60)
      return () => window.clearTimeout(timer)
    }
  }, [isVisible])

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return

    // Default center to London / UK corridor or Bay Area
    const initialLat = routeMetrics?.destinationCoords?.lat || 51.5074
    const initialLng = routeMetrics?.destinationCoords?.lng || -0.1278

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: 11,
      zoomControl: false, // We use custom Zenith UI controls
      attributionControl: false,
    })

    const markersLayer = L.layerGroup().addTo(map)
    const routeLayer = L.layerGroup().addTo(map)
    const stepFocusLayer = L.layerGroup().addTo(map)

    mapInstanceRef.current = map
    markersLayerRef.current = markersLayer
    routeLayerRef.current = routeLayer
    stepFocusLayerRef.current = stepFocusLayer

    // Sync theme class to map container
    containerRef.current.classList.add(`leaflet-theme-${activeTheme.toLowerCase()}`)

    // Invalidate size on container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapInstanceRef.current = null
      currentTileLayerRef.current = null
      currentLabelsLayerRef.current = null
      pendingTileLayerRef.current = null
      pendingLabelsLayerRef.current = null
      markersLayerRef.current = null
      routeLayerRef.current = null
      stepFocusLayerRef.current = null
    }
  }, [])

  // 2. Handle Basemap Theme Switch with Seamless Cross-Fade (No Intermittent Black Screen)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const cfg = TILE_PROVIDERS[activeTheme]
    const oldLayer = currentTileLayerRef.current
    const oldLabelsLayer = currentLabelsLayerRef.current

    // On initial mount when no layer exists yet
    if (!oldLayer) {
      const initialLayer = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
        subdomains: cfg.subdomains || 'abcd',
        opacity: 1,
        zIndex: 1,
      })
      initialLayer.addTo(map)
      currentTileLayerRef.current = initialLayer

      if (cfg.labelsUrl) {
        const initialLabelsLayer = L.tileLayer(cfg.labelsUrl, {
          maxZoom: cfg.maxZoom,
          subdomains: cfg.subdomains || 'abcd',
          opacity: 1,
          zIndex: 2,
          className: 'carto-dark-labels',
        })
        initialLabelsLayer.addTo(map)
        currentLabelsLayerRef.current = initialLabelsLayer
      } else {
        currentLabelsLayerRef.current = null
      }

      if (containerRef.current) {
        containerRef.current.classList.remove(
          'leaflet-theme-dark',
          'leaflet-theme-street',
          'leaflet-theme-satellite',
        )
        containerRef.current.classList.add(`leaflet-theme-${activeTheme.toLowerCase()}`)
      }
      return
    }

    // Force keep previous layer strictly at opacity 1 underneath
    oldLayer.setOpacity(1)
    oldLayer.setZIndex(1)
    const prevContainer = oldLayer.getContainer()
    if (prevContainer) {
      prevContainer.style.opacity = '1'
      prevContainer.style.visibility = 'visible'
    }

    if (oldLabelsLayer) {
      oldLabelsLayer.setOpacity(1)
      oldLabelsLayer.setZIndex(2)
      const prevLabelsContainer = oldLabelsLayer.getContainer()
      if (prevLabelsContainer) {
        prevLabelsContainer.style.opacity = '1'
        prevLabelsContainer.style.visibility = 'visible'
      }
    }

    // If a previous intermediate switch was still loading tiles, remove it cleanly
    if (pendingTileLayerRef.current && pendingTileLayerRef.current !== oldLayer) {
      if (map.hasLayer(pendingTileLayerRef.current)) {
        map.removeLayer(pendingTileLayerRef.current)
      }
    }
    if (pendingLabelsLayerRef.current && pendingLabelsLayerRef.current !== oldLabelsLayer) {
      if (map.hasLayer(pendingLabelsLayerRef.current)) {
        map.removeLayer(pendingLabelsLayerRef.current)
      }
    }

    // Create the new tile layer with full opacity and higher zIndex to render above the old layer
    const newTileLayer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains || 'abcd',
      opacity: 1,
      zIndex: 3,
    })

    pendingTileLayerRef.current = newTileLayer
    newTileLayer.addTo(map)

    let newLabelsLayer: L.TileLayer | null = null
    if (cfg.labelsUrl) {
      newLabelsLayer = L.tileLayer(cfg.labelsUrl, {
        maxZoom: cfg.maxZoom,
        subdomains: cfg.subdomains || 'abcd',
        opacity: 1,
        zIndex: 4,
        className: 'carto-dark-labels',
      })
      pendingLabelsLayerRef.current = newLabelsLayer
      newLabelsLayer.addTo(map)
    } else {
      pendingLabelsLayerRef.current = null
    }

    let isCleanedUp = false
    const handleFullyLoaded = () => {
      if (isCleanedUp) return
      isCleanedUp = true

      // Now that the new layer's tiles have fired the 'load' event, safely remove the old layer(s)
      if (map.hasLayer(oldLayer)) {
        map.removeLayer(oldLayer)
      }
      if (oldLabelsLayer && map.hasLayer(oldLabelsLayer)) {
        map.removeLayer(oldLabelsLayer)
      }

      newTileLayer.setZIndex(1)
      currentTileLayerRef.current = newTileLayer
      if (pendingTileLayerRef.current === newTileLayer) {
        pendingTileLayerRef.current = null
      }

      if (newLabelsLayer) {
        newLabelsLayer.setZIndex(2)
        currentLabelsLayerRef.current = newLabelsLayer
        if (pendingLabelsLayerRef.current === newLabelsLayer) {
          pendingLabelsLayerRef.current = null
        }
      } else {
        currentLabelsLayerRef.current = null
      }

      // Update container theme classes to match the new loaded layer
      if (containerRef.current) {
        containerRef.current.classList.remove(
          'leaflet-theme-dark',
          'leaflet-theme-street',
          'leaflet-theme-satellite',
        )
        containerRef.current.classList.add(`leaflet-theme-${activeTheme.toLowerCase()}`)
      }
    }

    // Force keep previous layer at opacity 1 until the 'load' event of the new layer tiles has fired
    newTileLayer.once('load', handleFullyLoaded)

    // Safety timeout fallback (5s) in case of an unreachable tile on slow networks
    const safetyTimer = setTimeout(handleFullyLoaded, 5000)

    return () => {
      clearTimeout(safetyTimer)
    }
  }, [activeTheme])

  // 3. Render Route or Pinpoint Markers & Geometry
  useEffect(() => {
    const map = mapInstanceRef.current
    const markersGroup = markersLayerRef.current
    const routeGroup = routeLayerRef.current
    if (!map || !markersGroup || !routeGroup) return

    markersGroup.clearLayers()
    routeGroup.clearLayers()

    // Mode A: ROUTE / OPTIMIZE
    if ((mode === 'ROUTE' || mode === 'OPTIMIZE') && routeMetrics) {
      const p1 = routeMetrics.originCoords
      const p2 = routeMetrics.destinationCoords

      if (!p1 || !p2) return

      // Origin Icon (Cyan Nexus)
      const originIcon = L.divIcon({
        className: 'zenith-map-origin-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(0, 242, 255, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 18px; height: 18px; border-radius: 50%; background: #00f2ff; border: 2.5px solid #050505; box-shadow: 0 0 12px #00f2ff; display: flex; align-items: center; justify-content: center;">
              <div style="width: 5px; height: 5px; border-radius: 50%; background: #050505;"></div>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })

      // Destination Icon (Hazard Red / Amber) with pulsating animation
      const destIcon = L.divIcon({
        className: 'zenith-map-dest-marker cursor-pointer',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(255, 49, 49, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite; pointer-events: none;"></div>
            <div style="position: relative; width: 20px; height: 20px; border-radius: 50%; background: #ff3131; border: 2.5px solid #050505; box-shadow: 0 0 14px #ff3131; display: flex; align-items: center; justify-content: center;">
              <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      const originMarker = L.marker([p1.lat, p1.lng], { icon: originIcon }).addTo(markersGroup)
      originMarker.bindTooltip(
        `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; padding: 6px 10px; background: #090d16; border: 1px solid rgba(56, 189, 248, 0.6); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85); border-radius: 4px; color: #f8fafc; min-width: 170px; max-width: 240px;">
          <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #38bdf8; display: inline-block;"></span>
            <span style="color: #38bdf8; font-weight: 700; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;">Origin / Facility</span>
          </div>
          <div style="font-weight: 600; color: #ffffff; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${originLabel}</div>
        </div>`,
        { permanent: false, direction: 'top', offset: [0, -12] },
      )

      // In standard point-to-point route, render the single destination marker
      if (!routeMetrics.optimizedStops || routeMetrics.optimizedStops.length <= 1) {
        const destMarker = L.marker([p2.lat, p2.lng], { icon: destIcon }).addTo(markersGroup)
        destMarker.bindTooltip(
          `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; padding: 8px 12px; background: #090d16; border: 1px solid rgba(239, 68, 68, 0.75); box-shadow: 0 10px 30px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06); border-radius: 4px; color: #f8fafc; min-width: 210px; max-width: 280px; pointer-events: none;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
                <span style="color: #f87171; font-weight: 700; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;">Destination</span>
              </div>
              <span style="color: #38bdf8; font-size: 9px; font-weight: 600; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 2px; padding: 1px 4px;">VERIFIED ROUTE</span>
            </div>
            <div style="font-weight: 700; color: #ff3131; text-shadow: 0 0 10px rgba(255, 49, 49, 0.85); font-size: 13px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.02em;">${destinationLabel}</div>
            <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 5px;">
              <span style="color: #38bdf8; font-weight: 700; font-size: 13px; font-family: monospace;">${routeMetrics.durationText}</span>
              <span style="color: #94a3b8; font-size: 11px;">(${routeMetrics.distanceText})</span>
            </div>
            ${routeMetrics.etaText || routeMetrics.pathCorridor || routeMetrics.summary ? `
            <div style="color: #cbd5e1; font-size: 10px; margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${routeMetrics.etaText ? `<span style="color: #fbbf24; font-weight: 600;">ETA ${routeMetrics.etaText}</span>` : ''}
              ${routeMetrics.pathCorridor || routeMetrics.summary ? `<span style="color: #64748b;">·</span><span style="color: #94a3b8; overflow: hidden; text-overflow: ellipsis;">${routeMetrics.pathCorridor || routeMetrics.summary}</span>` : ''}
            </div>` : ''}
          </div>`,
          { permanent: false, direction: 'top', offset: [0, -14], opacity: 1 },
        )
        destMarker.on('click', () => {
          destMarker.toggleTooltip()
        })
      }

      // Render numbered stop markers for multi-stop optimized dispatch
      if (routeMetrics.optimizedStops && routeMetrics.optimizedStops.length > 0) {
        routeMetrics.optimizedStops.forEach((stop, sIdx) => {
          const isFinal = sIdx === routeMetrics.optimizedStops!.length - 1
          const stopIcon = L.divIcon({
            className: 'zenith-map-stop-marker',
            html: `
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: ${isFinal ? 'rgba(255, 49, 49, 0.35)' : 'rgba(0, 242, 255, 0.3)'}; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                <div style="position: relative; width: 24px; height: 24px; border-radius: 50%; background: ${isFinal ? '#ff3131' : '#00f2ff'}; border: 2.5px solid #050505; box-shadow: 0 0 12px ${isFinal ? '#ff3131' : '#00f2ff'}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: #050505; font-family: monospace;">
                  ${stop.stopNumber}
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          })

          const stopMarker = L.marker([stop.coords.lat, stop.coords.lng], { icon: stopIcon }).addTo(markersGroup)
          stopMarker.bindTooltip(
            `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; padding: 7px 11px; background: #090d16; border: 1px solid ${isFinal ? 'rgba(239, 68, 68, 0.75)' : 'rgba(56, 189, 248, 0.7)'}; box-shadow: 0 8px 24px rgba(0,0,0,0.85); border-radius: 4px; color: #f8fafc; min-width: 190px; max-width: 260px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: ${isFinal ? '#ef4444' : '#38bdf8'}; display: inline-block;"></span>
                  <span style="color: ${isFinal ? '#f87171' : '#38bdf8'}; font-weight: 700; font-size: 9px; letter-spacing: 0.05em; text-transform: uppercase;">Stop ${stop.stopNumber}</span>
                </div>
                ${stop.estimatedArrival ? `<span style="color: #fbbf24; font-weight: 600; font-size: 9px;">ETA ${stop.estimatedArrival}</span>` : ''}
              </div>
              <div style="font-weight: 600; color: #ffffff; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; margin-top: 2px;">${stop.name}</div>
              <div style="color: #94a3b8; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">${stop.address}</div>
              <div style="color: #38bdf8; font-weight: 700; font-size: 11px; margin-top: 3px; font-family: monospace;">
                +${stop.distanceText} · ${stop.durationText}
              </div>
              <div style="color: #64748b; font-size: 9px; margin-top: 3px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 3px;">
                ${stop.legSummary}
              </div>
            </div>`,
            { permanent: false, direction: 'top', offset: [0, -14] },
          )
        })
      }

      // Road/Transit Geometry Coordinates: only draw polyline when true curve-snapped coordinates exist (>= 6 points)
      // This strictly prevents drawing low-resolution straight linear chords across the map
      if (routeMetrics.routeGeometry && routeMetrics.routeGeometry.length >= 6) {
        const polylinePoints = routeMetrics.routeGeometry

        // Outer glow line
        L.polyline(polylinePoints, {
          color: '#00f2ff',
          weight: 8,
          opacity: 0.25,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeGroup)

        // Inner sharp road line
        const routeLine = L.polyline(polylinePoints, {
          color: travelMode === 'transit' ? '#38bdf8' : '#00f2ff',
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: travelMode === 'transit' ? '8, 6' : undefined,
        }).addTo(routeGroup)

        // FIT BOUNDS WITH ADEQUATE PADDING (Never zooms to whole continent or squishes against HUD!)
        const bounds = routeLine.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            paddingTopLeft: [50, 40],
            paddingBottomRight: [isSidebarOpen ? 370 : 50, isHudMinimized ? 40 : 120],
            maxZoom: 15,
            animate: true,
          })
        }
      } else {
        // While road routing resolves, frame the origin and destination waypoints without a direct straight line
        const bounds = L.latLngBounds([p1.lat, p1.lng], [p2.lat, p2.lng])
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            paddingTopLeft: [50, 40],
            paddingBottomRight: [isSidebarOpen ? 370 : 50, isHudMinimized ? 40 : 120],
            maxZoom: 15,
            animate: true,
          })
        }
      }
    } else if (mode === 'SEARCH' && singleLocationCoords) {
      // Mode B: SEARCH / PINPOINT
      const pinIcon = L.divIcon({
        className: 'zenith-map-pin-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: rgba(0, 242, 255, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 22px; height: 22px; border-radius: 50%; background: #00f2ff; border: 3px solid #050505; box-shadow: 0 0 16px #00f2ff; display: flex; align-items: center; justify-content: center;">
              <div style="width: 6px; height: 6px; border-radius: 50%; background: #050505;"></div>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })

      const pinMarker = L.marker(
        [singleLocationCoords.lat, singleLocationCoords.lng],
        { icon: pinIcon },
      ).addTo(markersGroup)

      pinMarker.bindTooltip(
        `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; padding: 6px 10px; background: #090d16; border: 1px solid rgba(56, 189, 248, 0.7); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85); border-radius: 4px; color: #f8fafc; min-width: 170px; max-width: 250px;">
          <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #38bdf8; display: inline-block;"></span>
            <span style="color: #38bdf8; font-weight: 700; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;">Location Pinpoint</span>
          </div>
          <div style="font-weight: 600; color: #ffffff; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${singleLocationLabel}</div>
        </div>`,
        { permanent: false, direction: 'top', offset: [0, -14], opacity: 1 },
      )

      map.flyTo([singleLocationCoords.lat, singleLocationCoords.lng], 15, { animate: true })
    }
  }, [mode, routeMetrics, singleLocationCoords, singleLocationLabel, originLabel, destinationLabel, travelMode, isSidebarOpen, isHudMinimized])

  // Recenter Route & Recalibrate Fit Bounds
  const handleRecenter = () => {
    const map = mapInstanceRef.current
    if (!map) return

    map.invalidateSize()

    if ((mode === 'ROUTE' || mode === 'OPTIMIZE') && routeMetrics) {
      if (routeMetrics.routeGeometry && routeMetrics.routeGeometry.length >= 6) {
        const bounds = L.latLngBounds(routeMetrics.routeGeometry)
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            paddingTopLeft: [50, 40],
            paddingBottomRight: [isSidebarOpen ? 370 : 50, isHudMinimized ? 40 : 120],
            maxZoom: 15,
            animate: true,
          })
          return
        }
      }
      if (routeMetrics.originCoords && routeMetrics.destinationCoords) {
        const p1 = routeMetrics.originCoords
        const p2 = routeMetrics.destinationCoords
        const bounds = L.latLngBounds([p1.lat, p1.lng], [p2.lat, p2.lng])
        map.fitBounds(bounds, {
          paddingTopLeft: [50, 40],
          paddingBottomRight: [isSidebarOpen ? 370 : 50, isHudMinimized ? 40 : 120],
          maxZoom: 15,
          animate: true,
        })
      }
    } else if (singleLocationCoords) {
      map.flyTo([singleLocationCoords.lat, singleLocationCoords.lng], 15, { animate: true })
    }
  }

  // Recalibrate bounds when sidebar or visibility or HUD minimize changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    const timer = window.setTimeout(() => {
      map.invalidateSize()
      handleRecenter()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [isSidebarOpen, isVisible, isHudMinimized])

  // Resolves the precise LatLng coordinate for any maneuver step, with fallback interpolation
  const resolveStepCoord = (step: RouteStep, idx: number): { lat: number; lng: number } | null => {
    // 1. Direct step location
    if (
      step.location &&
      typeof step.location.lat === 'number' &&
      typeof step.location.lng === 'number' &&
      !isNaN(step.location.lat) &&
      !isNaN(step.location.lng)
    ) {
      return { lat: step.location.lat, lng: step.location.lng }
    }

    // 2. Check if step has maneuver coordinates array
    const anyStep = step as unknown as { maneuver?: { location?: [number, number] } }
    if (
      anyStep.maneuver?.location &&
      Array.isArray(anyStep.maneuver.location) &&
      anyStep.maneuver.location.length >= 2
    ) {
      return { lat: anyStep.maneuver.location[1], lng: anyStep.maneuver.location[0] }
    }

    // 3. Fallback: Interpolate along routeGeometry
    if (routeMetrics?.routeGeometry && routeMetrics.routeGeometry.length > 0) {
      const geom = routeMetrics.routeGeometry
      const totalSteps = routeMetrics.steps?.length || 1
      if (idx === 0) return { lat: geom[0][0], lng: geom[0][1] }
      if (idx === totalSteps - 1) return { lat: geom[geom.length - 1][0], lng: geom[geom.length - 1][1] }

      const ratio = Math.max(0, Math.min(1, idx / Math.max(1, totalSteps - 1)))
      const geomIdx = Math.min(Math.floor(ratio * (geom.length - 1)), geom.length - 1)
      return { lat: geom[geomIdx][0], lng: geom[geomIdx][1] }
    }

    // 4. Fallback to origin or destination
    if (idx === 0 && routeMetrics?.originCoords) {
      return routeMetrics.originCoords
    }
    if (routeMetrics?.destinationCoords) {
      return routeMetrics.destinationCoords
    }

    return null
  }

  // Interactive click-to-focus on specific maneuver waypoint
  const handleFocusStep = (step: RouteStep, idx: number) => {
    const map = mapInstanceRef.current
    if (!map) return

    const targetCoord = resolveStepCoord(step, idx)
    if (!targetCoord) return

    setFocusedStepIndex(idx)
    const focusGroup = stepFocusLayerRef.current
    if (focusGroup) {
      focusGroup.clearLayers()
    }

    // Cancel any running animations (e.g. from previous flyTo or initial fitBounds)
    // so Leaflet never silently drops or ignores the transition on first click
    try {
      map.stop()
    } catch {
      // continue
    }

    // Fly to target maneuver waypoint
    try {
      map.flyTo([targetCoord.lat, targetCoord.lng], 16, {
        animate: true,
        duration: 0.6,
      })
    } catch {
      map.setView([targetCoord.lat, targetCoord.lng], 16)
    }

    if (focusGroup) {
      const focusIcon = L.divIcon({
        className: 'zenith-map-focus-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(0, 242, 255, 0.45); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 24px; height: 24px; border-radius: 50%; background: #00f2ff; border: 2.5px solid #050505; box-shadow: 0 0 16px #00f2ff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: #050505; font-family: monospace;">
              ${idx + 1}
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      })

      const marker = L.marker([targetCoord.lat, targetCoord.lng], { icon: focusIcon }).addTo(focusGroup)
      // autoPan: false is critical to prevent popup autoPan from racing and aborting the flyTo transition
      marker
        .bindPopup(
          `<div style="font-family: monospace; font-size: 11px; padding: 4px 6px; background: rgba(5,5,5,0.96); border: 1px solid #00f2ff; box-shadow: 0 0 14px rgba(0,242,255,0.35); color: #fff; min-width: 180px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px;">
              <strong style="color: #00f2ff; font-size: 10px;">MANEUVER ${String(idx + 1).padStart(2, '0')}</strong>
              <span style="color: #00f2ff; font-size: 9px; font-weight: bold;">${step.distanceText}</span>
            </div>
            <div style="font-weight: bold; color: #ffffff; margin-top: 2px;">${step.instruction}</div>
            ${step.name ? `<div style="color: #a0a0a0; font-size: 9px; margin-top: 2px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2px;">${step.name}</div>` : ''}
          </div>`,
          { closeButton: false, offset: [0, -14], autoPan: false },
        )
        .openPopup()
    }
  }

  const handleResetCorridor = () => {
    setFocusedStepIndex(null)
    stepFocusLayerRef.current?.clearLayers()
    handleRecenter()
  }

  // Zoom controls
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn()
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut()

  return (
    <div
      className={`isolate relative h-full w-full overflow-hidden bg-void font-mono text-ink ${className}`}
    >
      {/* Leaflet container */}
      <div
        ref={containerRef}
        className={`h-full w-full leaflet-container leaflet-theme-${activeTheme.toLowerCase()}`}
      />

      {/* Atmospheric overlays matching the other tabs: Scanlines & CRT vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scanline-band opacity-25 z-[350]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 crt-vignette opacity-40 z-[350]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 border border-nexus/30 shadow-[inset_0_0_20px_rgba(0,242,255,0.08)] z-[350]"
      />

      {/* Map Control Tools - Floating Top Right (Compact Tactical HUD) */}
      <div className="absolute right-3 top-3 z-[1000] flex w-28 flex-col gap-1 border border-line bg-void/90 p-1 backdrop-blur-md shadow-xl select-none font-mono">
        {/* Quick Tools: Zoom In, Zoom Out, Fit Bounds */}
        <div className="grid grid-cols-3 gap-1 border-b border-line pb-1">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            className="flex h-7 items-center justify-center border border-line bg-surface text-ink hover:border-nexus hover:text-nexus active:scale-95 transition-all"
          >
            <ZoomInIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="flex h-7 items-center justify-center border border-line bg-surface text-ink hover:border-nexus hover:text-nexus active:scale-95 transition-all"
          >
            <ZoomOutIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            title="Fit Route Corridor"
            className="flex h-7 items-center justify-center border border-line bg-surface text-3xs font-bold text-dim hover:border-nexus hover:text-nexus active:scale-95 transition-all"
          >
            FIT
          </button>
        </div>

        {/* Tile Theme Selectors: Street / Satellite / Dark */}
        <div className="flex flex-col gap-0.5 pt-0.5">
          <div className="flex items-center justify-between px-0.5 text-4xs text-dimmer">
            <span>LAYER</span>
            <LayersIcon className="h-2.5 w-2.5 text-dim" />
          </div>
          <div className="flex flex-col gap-0.5">
            {(['STREET', 'SATELLITE', 'DARK'] as MapTileTheme[]).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => handleSelectTheme(theme)}
                className={`flex h-6 items-center justify-between px-1.5 text-3xs font-bold transition-all active:scale-98 ${
                  activeTheme === theme
                    ? 'border border-nexus/80 bg-nexus/20 text-nexus'
                    : 'border border-line bg-surface text-dimmer hover:text-ink'
                }`}
              >
                <span>{theme}</span>
                {activeTheme === theme && (
                  <span className="h-1.5 w-1.5 rounded-full bg-nexus" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Client Navigation Sidebar Toggle - Relocated directly below satellite/dark layer */}
        {onToggleSidebar && (
          <div className="pt-0.5 border-t border-line">
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`flex h-7 w-full items-center justify-between gap-1 border px-1.5 text-3xs font-bold transition-all active:scale-98 ${
                isSidebarOpen
                  ? 'border-nexus/60 bg-nexus/20 text-nexus'
                  : 'border-nexus/80 bg-void text-nexus shadow-[0_0_8px_rgba(0,243,255,0.25)] hover:bg-nexus hover:text-void'
              }`}
              title={isSidebarOpen ? 'Collapse Client Navigation' : 'Expand Client Navigation'}
            >
              <div className="flex items-center gap-1 truncate">
                {isSidebarOpen ? (
                  <PanelRightCloseIcon className="h-3 w-3 shrink-0" />
                ) : (
                  <PanelRightOpenIcon className="h-3 w-3 shrink-0 animate-pulse" />
                )}
                <span className="truncate">NAV</span>
              </div>
              {clientCount !== undefined && (
                <span className="text-4xs font-bold text-nexus bg-nexus/20 px-1 py-[1px] border border-nexus/40">
                  {clientCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Floating Tactical Route Telemetry HUD & Turn-By-Turn Panel */}
      {mode === 'ROUTE' && (routeMetrics || isCalculatingRoute) && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`absolute bottom-3 left-3 z-[1000] flex flex-col gap-2 border border-slate-700/80 bg-slate-950/95 p-2.5 shadow-2xl rounded-lg backdrop-blur-md transition-all duration-200 ${
            isHudMinimized
              ? 'w-auto max-w-[calc(100%-24px)] sm:max-w-md'
              : 'w-[calc(100%-24px)] sm:w-auto sm:max-w-md max-h-[48vh] overflow-y-auto term-scroll'
          }`}
        >
          {/* Header row: Status, Google Maps Parity badge, and minimize/expand toggle */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 text-3xs">
            <div className="flex items-center gap-1.5 truncate">
              {isCalculatingRoute ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-ping shadow-[0_0_8px_#f59e0b]" />
                  <span className="font-semibold text-amber-300 tracking-wide uppercase text-3xs animate-pulse">
                    Calculating Route Path…
                  </span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                  <span className="font-semibold text-slate-100 tracking-wide text-2xs">Route Telemetry</span>
                  <span className="hidden sm:inline font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-4xs rounded">
                    {routeMetrics?.routeGeometry ? 'Road-Snapped' : 'Direct Corridor'}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsHudMinimized((prev) => !prev)}
                className="flex items-center gap-1 border border-slate-700 bg-slate-900 px-2 py-0.5 text-4xs font-semibold text-slate-300 hover:text-cyan-400 hover:border-cyan-500 rounded transition-colors"
                title={isHudMinimized ? 'Expand route details' : 'Minimize HUD to fit map'}
              >
                <span>{isHudMinimized ? 'EXPAND' : 'MINIMIZE'}</span>
              </button>
              <span className="text-4xs font-semibold text-slate-400 uppercase bg-slate-900 px-1.5 py-0.5 border border-slate-800 rounded">
                {travelMode}
              </span>
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1 border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-4xs font-semibold text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 rounded transition-colors"
                  title="Cross-reference with Native Google Maps"
                >
                  <span>MAPS</span>
                  <ExternalLinkIcon className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>

          {/* Minimized Single-Row Status Capsule */}
          {isHudMinimized && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-3xs">
              <span className="text-cyan-400 font-bold font-mono">{routeMetrics?.durationText || 'Calculating…'}</span>
              <span className="text-slate-200 font-bold font-mono">{routeMetrics?.distanceText || '—'}</span>
              {routeMetrics?.etaText && (
                <span className="text-amber-300 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30 text-4xs font-semibold font-mono">
                  ETA {routeMetrics.etaText}
                </span>
              )}
              <span className="text-slate-400 text-4xs truncate max-w-[160px]">
                {routeMetrics?.pathCorridor || routeMetrics?.summary || ''}
              </span>
            </div>
          )}

          {/* Primary Metrics: Est Duration, Path Distance, and ETA */}
          {!isHudMinimized && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xs text-slate-400 uppercase font-medium">Est. Duration:</span>
                  <span className="text-base font-bold text-cyan-400 font-mono tracking-tight tabular-nums">
                    {isCalculatingRoute ? (
                      <span className="animate-pulse text-amber-300 text-xs">CALCULATING…</span>
                    ) : (
                      routeMetrics?.durationText || '—'
                    )}
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xs text-slate-400 uppercase font-medium">Distance:</span>
                  <span className="text-base font-bold text-slate-100 font-mono tracking-tight tabular-nums">
                    {isCalculatingRoute ? (
                      <span className="animate-pulse text-slate-400 text-xs">MEASURING…</span>
                    ) : (
                      routeMetrics?.distanceText || '—'
                    )}
                  </span>
                </div>

                {routeMetrics?.etaText && !isCalculatingRoute && (
                  <div className="flex items-baseline gap-1 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                    <span className="text-4xs text-cyan-400 uppercase font-bold">ETA:</span>
                    <span className="text-xs font-bold text-cyan-300 font-mono tabular-nums">{routeMetrics.etaText}</span>
                  </div>
                )}
              </div>

              {/* Corridor & Traffic Condition */}
              <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-800/80 pt-1.5 text-3xs text-slate-300">
                <div className="flex items-center gap-1.5 truncate">
                  <Navigation2Icon className="h-3 w-3 shrink-0 text-amber-400 rotate-45" />
                  <span className="text-slate-200 font-medium truncate">
                    {isCalculatingRoute
                      ? 'Establishing road network path…'
                      : routeMetrics?.pathCorridor || routeMetrics?.summary || 'Route Path'}
                  </span>
                </div>
                {routeMetrics?.trafficCondition && !isCalculatingRoute && (
                  <span className="text-4xs text-slate-400 hidden md:inline font-mono">
                    {routeMetrics.trafficCondition}
                  </span>
                )}
              </div>

          {/* Multi-Stop Optimized Dispatch Sequence Timeline */}
          {routeMetrics?.optimizedStops && routeMetrics.optimizedStops.length > 0 && !isCalculatingRoute && (
            <div className="border-t border-nexus/40 pt-1.5 space-y-1.5">
              <div className="flex items-center justify-between text-4xs font-bold">
                <div className="flex items-center gap-1.5 text-nexus">
                  <RouteIcon className="h-3 w-3 text-nexus" />
                  <span>OPTIMIZED DISPATCH SEQUENCE ({routeMetrics.optimizedStops.length} STOPS)</span>
                  {routeMetrics.timeSavedMinutes !== undefined && routeMetrics.timeSavedMinutes > 0 && (
                    <span className="font-mono text-4xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1">
                      SAVED {routeMetrics.timeSavedMinutes} MINS ({routeMetrics.percentageSaved}% GAIN)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto term-scroll pr-1">
                {routeMetrics.optimizedStops.map((stop, sIdx) => {
                  const isLast = sIdx === routeMetrics.optimizedStops!.length - 1
                  return (
                    <button
                      key={stop.id || sIdx}
                      type="button"
                      onClick={() => {
                        const map = mapInstanceRef.current
                        if (!map) return
                        try {
                          map.stop()
                        } catch {}
                        map.flyTo([stop.coords.lat, stop.coords.lng], 16, { animate: true, duration: 0.6 })
                        const focusGroup = stepFocusLayerRef.current
                        if (focusGroup) {
                          focusGroup.clearLayers()
                          const focusIcon = L.divIcon({
                            className: 'zenith-map-focus-marker',
                            html: `
                              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                                <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: ${isLast ? 'rgba(255, 49, 49, 0.45)' : 'rgba(0, 242, 255, 0.45)'}; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                                <div style="position: relative; width: 26px; height: 26px; border-radius: 50%; background: ${isLast ? '#ff3131' : '#00f2ff'}; border: 2.5px solid #050505; box-shadow: 0 0 16px ${isLast ? '#ff3131' : '#00f2ff'}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: #050505; font-family: monospace;">
                                  ${stop.stopNumber}
                                </div>
                              </div>
                            `,
                            iconSize: [44, 44],
                            iconAnchor: [22, 22],
                          })
                          L.marker([stop.coords.lat, stop.coords.lng], { icon: focusIcon }).addTo(focusGroup)
                        }
                      }}
                      className="flex items-center justify-between gap-2 p-1.5 text-left border border-line/60 bg-surface/70 hover:border-nexus hover:bg-nexus/10 transition-colors text-3xs"
                      title="Click to zoom to this stop"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`px-1 py-0.5 text-4xs font-bold font-mono ${isLast ? 'bg-hazard/20 text-hazard border border-hazard/50' : 'bg-nexus/20 text-nexus border border-nexus/50'}`}>
                          STOP {stop.stopNumber}
                        </span>
                        <div className="min-w-0 truncate">
                          <span className="font-bold text-ink truncate block">{stop.name}</span>
                          <span className="text-4xs text-dimmer truncate block">{stop.address}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-4xs font-bold text-nexus">{stop.estimatedArrival ? `ETA ${stop.estimatedArrival}` : stop.durationText}</div>
                        <div className="text-4xs text-dimmer">{stop.distanceText}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Turn-by-Turn Navigation Panel */}
          {routeMetrics?.steps && routeMetrics.steps.length > 0 && !isCalculatingRoute && (
            <div className="border-t border-line/60 pt-1.5 space-y-1">
              <div className="flex items-center justify-between text-4xs font-bold">
                <div className="flex items-center gap-1 text-nexus">
                  <CompassIcon className="h-3 w-3 text-nexus" />
                  <span>TURN-BY-TURN DIRECTIONS ({routeMetrics.steps.length} MANEUVERS)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {focusedStepIndex !== null && (
                    <button
                      type="button"
                      onClick={handleResetCorridor}
                      className="flex items-center gap-0.5 text-nexus bg-nexus/15 hover:bg-nexus hover:text-void px-1.5 py-0.5 border border-nexus/50 text-4xs font-bold transition-colors"
                      title="Reset map to full route corridor"
                    >
                      <span>[FIT ROUTE]</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTurnByTurn((prev) => !prev)}
                    className="flex items-center gap-0.5 text-dim hover:text-nexus px-1 py-0.5 border border-line hover:border-nexus transition-colors"
                  >
                    <span>{showTurnByTurn ? 'COLLAPSE' : 'EXPAND'}</span>
                    {showTurnByTurn ? (
                      <ChevronUpIcon className="h-2.5 w-2.5" />
                    ) : (
                      <ChevronDownIcon className="h-2.5 w-2.5" />
                    )}
                  </button>
                </div>
              </div>

              {showTurnByTurn && (
                <div className="max-h-44 overflow-y-auto space-y-1 pr-1 term-scroll border border-line/40 bg-surface/50 p-1">
                  {routeMetrics.steps.map((step, idx) => {
                    const isLast = idx === (routeMetrics.steps?.length ?? 1) - 1
                    const type = (step.type || '').toLowerCase()
                    const mod = (step.modifier || '').toLowerCase()
                    const inst = (step.instruction || '').toLowerCase()
                    const isFocused = focusedStepIndex === idx

                    let icon = <ArrowUpIcon className="h-3 w-3 text-ink/70 shrink-0" />
                    if (isLast || type === 'arrive' || inst.includes('arrive') || inst.includes('alight')) {
                      icon = <FlagIcon className="h-3 w-3 text-hazard shrink-0" />
                    } else if (type === 'transit' || inst.includes('board') || inst.includes('train') || inst.includes('rail') || inst.includes('ride') || inst.includes('line') || inst.includes('bus')) {
                      icon = <TrainIcon className="h-3 w-3 text-cyan-400 shrink-0" />
                    } else if (type === 'walk' || inst.includes('walk')) {
                      icon = <FootprintsIcon className="h-3 w-3 text-amber-400 shrink-0" />
                    } else if (type === 'depart' || inst.includes('depart') || inst.includes('head')) {
                      icon = <NavigationIcon className="h-3 w-3 text-nexus shrink-0" />
                    } else if (type.includes('roundabout') || type.includes('rotary') || inst.includes('roundabout')) {
                      icon = <RotateCcwIcon className="h-3 w-3 text-amber-400 shrink-0" />
                    } else if (mod.includes('left') || inst.includes('left')) {
                      icon = <CornerUpLeftIcon className="h-3 w-3 text-nexus shrink-0" />
                    } else if (mod.includes('right') || inst.includes('right')) {
                      icon = <CornerUpRightIcon className="h-3 w-3 text-nexus shrink-0" />
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          handleFocusStep(step, idx)
                        }}
                        className={`flex w-full items-start gap-1.5 p-1.5 text-left border transition-all text-3xs ${
                          isFocused
                            ? 'border-nexus bg-nexus/20 shadow-[0_0_12px_rgba(0,242,255,0.25)] border-l-4 border-l-nexus'
                            : 'border-line/40 bg-void/80 hover:border-nexus/60 hover:bg-nexus/10'
                        }`}
                        title="Click to focus maneuver waypoint on map"
                      >
                        <span className="font-mono text-4xs font-bold text-dimmer shrink-0 mt-0.5">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <div className="mt-0.5 shrink-0">{icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-ink font-semibold leading-tight flex items-center gap-1.5">
                            <span>{step.instruction}</span>
                            {isFocused && (
                              <span className="text-4xs font-bold text-nexus bg-nexus/20 px-1 border border-nexus/50 animate-pulse">
                                FOCUSED
                              </span>
                            )}
                          </div>
                          {step.name && (
                            <div className="text-4xs text-dimmer truncate mt-0.5">{step.name}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono text-4xs font-bold text-nexus bg-nexus/10 border border-nexus/30 px-1 py-0.2">
                            {step.distanceText}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

          {/* Loading road snapping status banner */}
          {isCalculatingRoute && (
            <div className="border-t border-amber-500/40 pt-1 text-3xs text-amber-300 flex items-center gap-1.5 animate-pulse">
              <RefreshCwIcon className="h-3 w-3 animate-spin shrink-0 text-amber-400" />
              <span>ACQUIRING ROAD VECTORS & MANEUVERS…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
