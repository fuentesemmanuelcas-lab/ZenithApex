/**
 * Zenith Route Optimization & Multi-Stop Dispatch Service
 * Solves Traveling Salesperson / Vehicle Routing Optimization using real-time road & transit routing APIs.
 * Computes optimal stop ordering, real road-following polylines (never straight chords), and per-stop telemetry.
 */

import {
  geocodeLocation,
  formatStepInstruction,
  buildTransitRoute,
  normalizeLocation,
  type LatLng,
  type RouteStep,
} from './routeService'

export interface StopInput {
  id?: string
  name?: string
  address: string
  coords?: LatLng
}

export interface RouteOptimizationRequest {
  origin: string
  originCoords?: LatLng
  stops: StopInput[]
  destination?: string
  mode?: 'driving' | 'transit'
  roundTrip?: boolean // Whether vehicle returns to origin hub after last delivery
}

export interface OptimizedStop {
  id: string
  name: string
  address: string
  coords: LatLng
  stopNumber: number // 1, 2, 3...
  distanceFromPreviousMiles: number
  distanceFromPreviousKm: number
  durationFromPreviousMinutes: number
  distanceText: string
  durationText: string
  estimatedArrival: string // e.g. "09:45 AM"
  legSummary: string // e.g. "via A505 / Dunstable Northern Bypass"
  steps?: RouteStep[]
}

export interface RouteOptimizationResponse {
  origin: string
  originCoords: LatLng
  mode: 'driving' | 'transit'
  roundTrip: boolean
  totalDistanceMiles: number
  totalDistanceKm: number
  totalDistanceText: string
  totalDurationMinutes: number
  totalDurationText: string
  distanceSavedMiles: number
  timeSavedMinutes: number
  percentageSaved: number
  stops: OptimizedStop[]
  routeGeometry: [number, number][] // Full continuous road-snapped polyline across all stops
  allSteps: RouteStep[]
  summary: string
  calculatedAt: string
}

/**
 * Calculates Great-Circle distance in km
 */
function haversineKm(p1: LatLng, p2: LatLng): number {
  const R = 6371
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Solves Traveling Salesperson problem using Nearest-Neighbor + 2-Opt heuristic
 * Minimizes total travel duration along the road/transit network
 */
function solveOptimalSequence(
  durationMatrix: number[][],
  distanceMatrix: number[][],
  numStops: number,
  roundTrip: boolean,
): { sequence: number[]; naiveDuration: number; optimalDuration: number } {
  // Index 0 is the Origin / Depot
  // Indices 1 .. numStops are the candidate stops
  const allStopIndices = Array.from({ length: numStops }, (_, i) => i + 1)

  // 1. Calculate naive order cost (visiting in provided order)
  let naiveDuration = 0
  let prev = 0
  for (const s of allStopIndices) {
    naiveDuration += durationMatrix[prev]?.[s] ?? 0
    prev = s
  }
  if (roundTrip) {
    naiveDuration += durationMatrix[prev]?.[0] ?? 0
  }

  // 2. Nearest Neighbor construction heuristic starting from origin
  const unvisited = new Set(allStopIndices)
  const currentTour: number[] = [0]
  let curr = 0

  while (unvisited.size > 0) {
    let nearest = -1
    let bestCost = Infinity
    for (const cand of unvisited) {
      const cost = durationMatrix[curr]?.[cand] ?? Infinity
      if (cost < bestCost) {
        bestCost = cost
        nearest = cand
      }
    }
    if (nearest === -1) {
      nearest = Array.from(unvisited)[0]
    }
    currentTour.push(nearest)
    unvisited.delete(nearest)
    curr = nearest
  }

  if (roundTrip) {
    currentTour.push(0)
  }

  // 3. 2-Opt Local Search Improvement heuristic
  let improved = true
  let iterations = 0
  const maxIterations = 50

  const calculateTourCost = (tour: number[]): number => {
    let cost = 0
    for (let i = 0; i < tour.length - 1; i++) {
      cost += durationMatrix[tour[i]][tour[i + 1]] ?? 0
    }
    return cost
  }

  let bestTour = [...currentTour]
  let bestCost = calculateTourCost(bestTour)

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    // Only swap internal stop sequence (keep origin at 0, and if roundTrip keep depot at end)
    const endIndex = roundTrip ? bestTour.length - 2 : bestTour.length - 1

    for (let i = 1; i < endIndex; i++) {
      for (let k = i + 1; k <= endIndex; k++) {
        // Reverse sub-array from i to k
        const candidateTour = [
          ...bestTour.slice(0, i),
          ...bestTour.slice(i, k + 1).reverse(),
          ...bestTour.slice(k + 1),
        ]

        const candCost = calculateTourCost(candidateTour)
        if (candCost < bestCost - 0.5) {
          bestTour = candidateTour
          bestCost = candCost
          improved = true
        }
      }
    }
  }

  // Extract sequence of stops (excluding leading origin 0 and trailing return 0)
  const finalSequence = bestTour.filter((idx, i) => {
    if (i === 0 && idx === 0) return false
    if (roundTrip && i === bestTour.length - 1 && idx === 0) return false
    return true
  })

  return {
    sequence: finalSequence,
    naiveDuration,
    optimalDuration: bestCost,
  }
}

/**
 * Optimizes a multi-stop dispatch route using real-time road/transit routing APIs
 */
export async function optimizeRoute(
  request: RouteOptimizationRequest,
): Promise<RouteOptimizationResponse> {
  const mode = request.mode || 'driving'
  const roundTrip = request.roundTrip ?? false

  // 1. Resolve Origin coordinates
  const originStr = request.origin?.trim() || 'Watson, Oakland, CA'
  const originCoords =
    request.originCoords ||
    (await geocodeLocation(originStr)) ||
    { lat: 37.7535, lng: -122.1818 }

  // 2. Resolve Stop coordinates
  const resolvedStops: Array<{
    id: string
    name: string
    address: string
    coords: LatLng
  }> = []

  for (let i = 0; i < request.stops.length; i++) {
    const s = request.stops[i]
    const addr = s.address?.trim() || `Stop ${i + 1}`
    const coords = s.coords || (await geocodeLocation(addr))
    if (coords) {
      resolvedStops.push({
        id: s.id || `STOP-${i + 1}`,
        name: s.name || addr.split(',')[0].trim() || `Stop ${i + 1}`,
        address: addr,
        coords,
      })
    }
  }

  if (resolvedStops.length === 0) {
    throw new Error('No valid stop coordinates could be resolved for route optimization.')
  }

  // All points: Index 0 is origin, followed by stops 1..N
  const allLocations: LatLng[] = [originCoords, ...resolvedStops.map((s) => s.coords)]

  // 3. Fetch real-time road/transit Distance & Duration Matrix from OSRM Table API
  const locCoordsString = allLocations.map((loc) => `${loc.lng},${loc.lat}`).join(';')
  const osrmTableUrl = `https://router.project-osrm.org/table/v1/driving/${locCoordsString}?annotations=duration,distance`

  let durationsMatrix: number[][] = []
  let distancesMatrix: number[][] = []

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const tableRes = await fetch(osrmTableUrl, { signal: controller.signal })
    clearTimeout(timer)

    if (tableRes.ok) {
      const tableData = (await tableRes.json()) as {
        code: string
        durations?: number[][]
        distances?: number[][]
      }
      if (tableData.code === 'Ok' && tableData.durations && tableData.distances) {
        durationsMatrix = tableData.durations
        distancesMatrix = tableData.distances

        // Calibrate table durations for Public Transit schedules (boarding, headways, dwell times)
        if (mode === 'transit') {
          for (let i = 0; i < durationsMatrix.length; i++) {
            for (let j = 0; j < durationsMatrix[i].length; j++) {
              if (i !== j && durationsMatrix[i][j] > 0) {
                // Transit schedule penalty: station walk & transfer wait (approx 6-8 mins) + transit speed factor
                durationsMatrix[i][j] = Math.round(durationsMatrix[i][j] * 1.35 + 420)
              }
            }
          }
        }
      }
    }
  } catch {
    // Fallback: estimate pairwise road matrix via calibrated haversine
  }

  // Fallback matrix calculation if OSRM table request times out or is unreachable
  if (durationsMatrix.length === 0 || durationsMatrix.length !== allLocations.length) {
    durationsMatrix = []
    distancesMatrix = []
    const speedKmh = mode === 'transit' ? 36 : 48

    for (let i = 0; i < allLocations.length; i++) {
      durationsMatrix[i] = []
      distancesMatrix[i] = []
      for (let j = 0; j < allLocations.length; j++) {
        if (i === j) {
          durationsMatrix[i][j] = 0
          distancesMatrix[i][j] = 0
        } else {
          const directKm = haversineKm(allLocations[i], allLocations[j])
          const roadKm = directKm * 1.28
          const roadMeters = roadKm * 1000
          const sec = (roadKm / speedKmh) * 3600 + (mode === 'transit' ? 420 : 120)
          distancesMatrix[i][j] = roadMeters
          durationsMatrix[i][j] = sec
        }
      }
    }
  }

  // 4. Solve Optimal Visit Sequence (TSP)
  const { sequence, naiveDuration, optimalDuration } = solveOptimalSequence(
    durationsMatrix,
    distancesMatrix,
    resolvedStops.length,
    roundTrip,
  )

  // Map 1-based stop indices back to resolvedStops (index - 1)
  const orderedStops = sequence.map((stopIndex) => resolvedStops[stopIndex - 1])

  // 5. Fetch full road/transit-network continuous polyline & leg directions for the optimal sequence
  // Construct coordinates path: Origin -> Stop 1 -> Stop 2 ... [-> Origin if roundTrip]
  const orderedCoords: LatLng[] = [originCoords, ...orderedStops.map((s) => s.coords)]
  if (roundTrip) {
    orderedCoords.push(originCoords)
  }

  const routeWaypointsString = orderedCoords.map((loc) => `${loc.lng},${loc.lat}`).join(';')

  let fullRouteGeometry: [number, number][] = []
  let routeLegs: Array<{
    distance: number
    duration: number
    summary: string
    steps: RouteStep[]
  }> = []

  if (mode === 'transit') {
    // 5A. Real-Time Transit Routing Engine across optimal stop sequence
    // Uses real-time transit timetables, guided busway / railway corridors, and road-snapped geometry
    for (let legIdx = 0; legIdx < orderedCoords.length - 1; legIdx++) {
      const fromCoord = orderedCoords[legIdx]
      const toCoord = orderedCoords[legIdx + 1]
      const fromAddr = legIdx === 0 ? originStr : orderedStops[legIdx - 1].address
      const toAddr =
        legIdx < orderedStops.length
          ? orderedStops[legIdx].address
          : `Return to ${originStr}`
      const cleanFrom = normalizeLocation(fromAddr)
      const cleanTo = normalizeLocation(toAddr)

      try {
        const legTransit = await buildTransitRoute(
          fromCoord,
          toCoord,
          fromAddr,
          toAddr,
          cleanFrom,
          cleanTo,
        )

        if (legTransit.routeGeometry && legTransit.routeGeometry.length > 0) {
          // Chain continuous polyline avoiding duplicate joint point
          if (fullRouteGeometry.length > 0) {
            fullRouteGeometry.push(...legTransit.routeGeometry.slice(1))
          } else {
            fullRouteGeometry.push(...legTransit.routeGeometry)
          }
        }

        routeLegs.push({
          distance: Math.round(legTransit.distanceKm * 1000),
          duration: legTransit.durationMinutes * 60,
          summary: legTransit.pathCorridor || 'via Transit Network Corridor',
          steps: legTransit.steps || [],
        })
      } catch (err) {
        console.warn(`Transit leg ${legIdx} failed:`, err)
        const directKm = haversineKm(fromCoord, toCoord)
        const transitKm = Number((directKm * 1.22).toFixed(1))
        const legDurMins = Math.max(10, Math.round((transitKm / 36) * 60 + 8))

        routeLegs.push({
          distance: Math.round(transitKm * 1000),
          duration: legDurMins * 60,
          summary: 'via Public Transit Corridor',
          steps: [
            {
              instruction: `Depart from ${fromAddr} to nearest transit interchange`,
              distanceText: '0.2 mi',
              distanceMeters: 350,
              durationText: '5 min',
              durationSeconds: 300,
              type: 'depart',
              location: fromCoord,
            },
            {
              instruction: `Board Regional Transit Network towards ${toAddr}`,
              distanceText: `${(transitKm * 0.621371).toFixed(1)} mi`,
              distanceMeters: Math.round(transitKm * 1000),
              durationText: `${legDurMins - 6} min`,
              durationSeconds: (legDurMins - 6) * 60,
              type: 'transit',
              location: fromCoord,
            },
            {
              instruction: `Alight and arrive at ${toAddr}`,
              distanceText: 'Station Stop',
              distanceMeters: 50,
              durationText: '1 min',
              durationSeconds: 60,
              type: 'arrive',
              location: toCoord,
            },
          ],
        })
      }
    }

    // Ensure full continuous road/rail geometry exists (never straight chords!)
    if (fullRouteGeometry.length === 0) {
      try {
        const osrmRouteUrl = `https://router.project-osrm.org/route/v1/driving/${routeWaypointsString}?overview=full&geometries=geojson`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 4000)
        const res = await fetch(osrmRouteUrl, { signal: controller.signal })
        clearTimeout(timer)
        if (res.ok) {
          const data = (await res.json()) as { routes?: Array<{ geometry?: { coordinates: [number, number][] } }> }
          if (data.routes?.[0]?.geometry?.coordinates) {
            fullRouteGeometry = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
          }
        }
      } catch {
        // Fallback handled below
      }
    }
  } else {
    // 5B. DRIVING: Multi-waypoint OSRM Directions
    const osrmRouteUrl = `https://router.project-osrm.org/route/v1/driving/${routeWaypointsString}?overview=full&geometries=geojson&steps=true`

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 7000)
      const routeRes = await fetch(osrmRouteUrl, { signal: controller.signal })
      clearTimeout(timer)

      if (routeRes.ok) {
        const routeData = (await routeRes.json()) as {
          code: string
          routes?: Array<{
            geometry?: { coordinates: [number, number][] }
            legs?: Array<{
              distance: number
              duration: number
              summary: string
              steps?: Array<{
                distance: number
                duration: number
                name: string
                maneuver?: { type: string; modifier?: string; location?: [number, number] }
              }>
            }>
          }>
        }

        if (routeData.code === 'Ok' && routeData.routes?.[0]) {
          const r = routeData.routes[0]
          if (r.geometry?.coordinates) {
            fullRouteGeometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng])
          }

          if (r.legs) {
            routeLegs = r.legs.map((leg, legIdx) => {
              const rawSteps = leg.steps || []
              const prominentStreets: string[] = []
              const targetDest =
                legIdx < orderedStops.length
                  ? orderedStops[legIdx].address
                  : `Return to ${originStr}`

              const legSteps: RouteStep[] = rawSteps.map((s, stepIdx) => {
                const isLast = stepIdx === rawSteps.length - 1
                if (s.name && s.name.length > 2 && !prominentStreets.includes(s.name)) {
                  prominentStreets.push(s.name)
                }
                const stepDist =
                  s.distance < 50
                    ? 'Immediate'
                    : s.distance * 0.000621371 >= 0.1
                      ? `${(s.distance * 0.000621371).toFixed(1)} mi`
                      : `${Math.round(s.distance)} m`
                const stepDurMins = Math.round((s.duration || 0) / 60)
                const stepDur = stepDurMins > 0 ? `${stepDurMins} min` : undefined
                const instruction = formatStepInstruction(
                  s.maneuver?.type,
                  s.maneuver?.modifier,
                  s.name,
                  isLast,
                  targetDest,
                )
                return {
                  instruction,
                  distanceText: stepDist,
                  distanceMeters: s.distance || 0,
                  durationText: stepDur,
                  durationSeconds: s.duration,
                  name: s.name,
                  type: s.maneuver?.type,
                  modifier: s.maneuver?.modifier,
                  location: s.maneuver?.location
                    ? { lat: s.maneuver.location[1], lng: s.maneuver.location[0] }
                    : undefined,
                }
              })

              const legCorridor =
                prominentStreets.length > 0
                  ? `via ${prominentStreets.slice(0, 2).join(' / ')}`
                  : leg.summary
                    ? `via ${leg.summary}`
                    : 'via Optimal Corridor'

              return {
                distance: leg.distance,
                duration: leg.duration,
                summary: legCorridor,
                steps: legSteps,
              }
            })
          }
        }
      }
    } catch {
      // Road network fetch failed or timed out
    }
  }

  // 6. Assemble Optimized Stop Entities with Timestamps and Leg Metrics
  let cumulativeSeconds = 0
  let totalDistanceMeters = 0
  const optimizedStops: OptimizedStop[] = []
  const allRouteSteps: RouteStep[] = []

  const startTime = Date.now()

  for (let i = 0; i < orderedStops.length; i++) {
    const stop = orderedStops[i]
    const leg = routeLegs[i]

    let legMeters = leg?.distance
    let legSeconds = leg?.duration

    if (typeof legMeters !== 'number' || typeof legSeconds !== 'number') {
      const prevLoc = i === 0 ? originCoords : orderedStops[i - 1].coords
      const directKm = haversineKm(prevLoc, stop.coords)
      legMeters = directKm * 1.25 * 1000
      legSeconds = (legMeters / 1000 / (mode === 'transit' ? 36 : 45)) * 3600 + (mode === 'transit' ? 420 : 0)
    }

    cumulativeSeconds += legSeconds
    totalDistanceMeters += legMeters

    const legMiles = Number((legMeters * 0.000621371).toFixed(1))
    const legKm = Number((legMeters / 1000).toFixed(1))
    const legMinutes = Math.max(1, Math.round(legSeconds / 60))

    const arrivalDate = new Date(startTime + cumulativeSeconds * 1000)
    const arrivalText = arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

    const legSummary = leg?.summary || 'via Fastest Road Corridor'
    const legSteps = leg?.steps || [
      {
        instruction: `Travel along road network towards ${stop.name}`,
        distanceText: `${legMiles} mi`,
        distanceMeters: legMeters,
        durationText: `${legMinutes} min`,
        type: 'depart',
        location: i === 0 ? originCoords : orderedStops[i - 1].coords,
      },
      {
        instruction: `Arrive at stop ${i + 1}: ${stop.name} (${stop.address})`,
        distanceText: 'Station Stop',
        distanceMeters: 50,
        durationText: '1 min',
        type: 'arrive',
        location: stop.coords,
      },
    ]

    allRouteSteps.push(...legSteps)

    optimizedStops.push({
      id: stop.id,
      name: stop.name,
      address: stop.address,
      coords: stop.coords,
      stopNumber: i + 1,
      distanceFromPreviousMiles: legMiles,
      distanceFromPreviousKm: legKm,
      durationFromPreviousMinutes: legMinutes,
      distanceText: `${legMiles} MI (${legKm} KM)`,
      durationText: `${legMinutes} MINS`,
      estimatedArrival: arrivalText,
      legSummary,
      steps: legSteps,
    })
  }

  // Handle return leg to origin if roundTrip
  if (roundTrip && routeLegs[orderedStops.length]) {
    const returnLeg = routeLegs[orderedStops.length]
    cumulativeSeconds += returnLeg.duration
    totalDistanceMeters += returnLeg.distance
    allRouteSteps.push(...returnLeg.steps)
  }

  // Calculate savings vs naive order
  const naiveSeconds = naiveDuration
  const optimizedSeconds = Math.max(optimalDuration, cumulativeSeconds)
  const timeSavedMinutes = Math.max(0, Math.round((naiveSeconds - optimizedSeconds) / 60))
  const totalDurationMinutes = Math.max(1, Math.round(cumulativeSeconds / 60))

  const totalDistanceKm = Number((totalDistanceMeters / 1000).toFixed(1))
  const totalDistanceMiles = Number((totalDistanceKm * 0.621371).toFixed(1))

  // Estimate distance saved based on time saved ratio
  const distanceSavedMiles = Number(
    (timeSavedMinutes > 0 && naiveSeconds > 0
      ? ((naiveSeconds - optimizedSeconds) / 3600) * 45 * 0.621371
      : 0
    ).toFixed(1),
  )

  const percentageSaved =
    naiveSeconds > optimizedSeconds && naiveSeconds > 0
      ? Math.round(((naiveSeconds - optimizedSeconds) / naiveSeconds) * 100)
      : 0

  let totalDurationText = `${totalDurationMinutes} MINS`
  if (totalDurationMinutes >= 60) {
    const hrs = Math.floor(totalDurationMinutes / 60)
    const mins = totalDurationMinutes % 60
    totalDurationText = mins > 0 ? `${hrs} HR ${mins} MINS` : `${hrs} HOURS`
  }

  const summary =
    mode === 'transit'
      ? timeSavedMinutes > 0
        ? `OPTIMIZED ${orderedStops.length}-STOP TRANSIT CORRIDOR · SAVED ${timeSavedMinutes} MINS (${distanceSavedMiles} MI)`
        : `OPTIMIZED ${orderedStops.length}-STOP TRANSIT CORRIDOR (${totalDurationText} · ${totalDistanceMiles} MI)`
      : timeSavedMinutes > 0
        ? `OPTIMIZED ${orderedStops.length}-STOP DISPATCH · SAVED ${timeSavedMinutes} MINS (${distanceSavedMiles} MI)`
        : `OPTIMIZED ${orderedStops.length}-STOP DISPATCH (${totalDurationText} · ${totalDistanceMiles} MI)`

  return {
    origin: originStr,
    originCoords,
    mode,
    roundTrip,
    totalDistanceMiles,
    totalDistanceKm,
    totalDistanceText: `${totalDistanceMiles} MI (${totalDistanceKm} KM)`,
    totalDurationMinutes,
    totalDurationText,
    distanceSavedMiles,
    timeSavedMinutes,
    percentageSaved,
    stops: optimizedStops,
    routeGeometry: fullRouteGeometry,
    allSteps: allRouteSteps,
    summary,
    calculatedAt: new Date().toISOString(),
  }
}
