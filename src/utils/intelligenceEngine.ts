/**
 * CORE INTELLIGENCE ENGINE FOR ORACLE_TERMINAL
 * 
 * Implements strict operational protocols for spreadsheet parsing, absolute data grounding,
 * exact sheet/row citations, live lead routing, and continuous session memory.
 */

export interface SpreadsheetRow {
  sheetName: string
  rowNumber: number
  client: string
  standardHourlyWage: string
  overtimeHazardWage: string
  annualSalary: string
  locationDepot: string
  address: string
  zone: string
  lat: number
  lng: number
  requirements: string
  qcStandard: string
  status: string
  fileSource: string
  notes?: string
}

/**
 * Parsed structured data array representing all uploaded spreadsheets in MY_FILES // CLOUD_STORAGE
 */
export const SPREADSHEET_MATRIX: SpreadsheetRow[] = []

/** Geocoding lookup table for landmarks and common location inputs. */
const LOCATION_COORDINATES: Record<string, { lat: number; lng: number; label: string; zone: string }> = {
  watson: { lat: 37.8044, lng: -122.2712, label: 'Watson Industrial Sector', zone: 'NORTH_SECTOR' },
  kabuki: { lat: 37.801, lng: -122.265, label: 'Kabuki Sub-district', zone: 'NORTH_SECTOR' },
  santo: { lat: 37.765, lng: -122.23, label: 'Santo Domingo Logistics Corridor', zone: 'EAST_SECTOR' },
  'santo domingo': { lat: 37.765, lng: -122.23, label: 'Santo Domingo Sector', zone: 'EAST_SECTOR' },
  pacifica: { lat: 37.712, lng: -122.29, label: 'Pacifica Coastal District', zone: 'SOUTH_SECTOR' },
  heywood: { lat: 37.74, lng: -122.26, label: 'Heywood Central Transit Hub', zone: 'CENTRAL_SOUTH' },
  'corpo plaza': { lat: 37.785, lng: -122.275, label: 'Corpo Plaza / City Center', zone: 'METRO_CORE' },
  'city center': { lat: 37.785, lng: -122.275, label: 'City Center Hub', zone: 'METRO_CORE' },
  'port of oakland': { lat: 37.795, lng: -122.285, label: 'Port of Oakland Terminal', zone: 'NORTH_SECTOR' },
  oakland: { lat: 37.8044, lng: -122.2712, label: 'Oakland Logistics Node', zone: 'NORTH_SECTOR' },
  'san francisco': { lat: 37.7749, lng: -122.4194, label: 'San Francisco Peninsula', zone: 'WEST_SECTOR' },
  manila: { lat: 14.5995, lng: 120.9842, label: 'Manila Capital District', zone: 'APAC_SECTOR' },
  tokyo: { lat: 35.6762, lng: 139.6503, label: 'Tokyo-3 Node', zone: 'EAST_ASIA' },
  london: { lat: 51.5074, lng: -0.1278, label: 'London Sector', zone: 'EUROPE_WEST' },
}

/** Haversine formula to compute great-circle distance between two points in km. */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export interface StructuredQueryResult {
  found: boolean
  clientName?: string
  wage?: string
  overtime?: string
  salary?: string
  location?: string
  address?: string
  requirements?: string
  qcStandard?: string
  citation: string
  fileSource?: string
  sheetName?: string
  rowNumber?: number
  additionalNotes?: string
}

export interface LiveRoutingResult {
  found: boolean
  leadLocation: string
  clientName: string
  clientAddress: string
  depot: string
  distanceText: string
  zone: string
  requirements: string
  citation: string
  matchingClients: Array<{
    name: string
    address: string
    depot: string
    citation: string
    requirements: string
  }>
}

/**
 * 1. EXCEL/CSV DATA EXTRACTION & ABSOLUTE GROUNDING
 * Queries the spreadsheet matrix for wages, requirements, and client attributes.
 */
export function querySpreadsheetData(clientQuery: string): StructuredQueryResult {
  const q = clientQuery.toLowerCase().trim()

  // Match against spreadsheet matrix
  const match = SPREADSHEET_MATRIX.find(
    (row) =>
      q.includes(row.client.toLowerCase()) ||
      row.client.toLowerCase().includes(q) ||
      row.locationDepot.toLowerCase().includes(q) ||
      row.address.toLowerCase().includes(q) ||
      (q.includes('arasaka') && row.client.includes('ARASAKA')) ||
      (q.includes('militech') && row.client.includes('MILITECH')) ||
      (q.includes('kang tao') && row.client.includes('KANG TAO')) ||
      (q.includes('biotechnica') && row.client.includes('BIOTECHNICA')) ||
      (q.includes('zenith') && row.client.includes('ZENITH')),
  )

  if (!match) {
    return {
      found: false,
      citation: 'Information not found in the uploaded documents.',
    }
  }

  return {
    found: true,
    clientName: match.client,
    wage: match.standardHourlyWage,
    overtime: match.overtimeHazardWage,
    salary: match.annualSalary,
    location: match.locationDepot,
    address: match.address,
    requirements: match.requirements,
    qcStandard: match.qcStandard,
    fileSource: match.fileSource,
    sheetName: match.sheetName,
    rowNumber: match.rowNumber,
    citation: `[Sheet: '${match.sheetName}', Row ${match.rowNumber}]`,
    additionalNotes: match.notes,
  }
}

/**
 * 2. LIVE LEAD ROUTING
 * Scans client requirements and location coordinates to match live leads with eligible clients.
 */
export function executeLiveLeadRouting(leadLocationRaw: string): LiveRoutingResult | null {
  const rawClean = leadLocationRaw.trim()
  const locLower = rawClean.toLowerCase()

  let targetCoords: { lat: number; lng: number; label: string; zone: string } | null = null

  for (const [key, coords] of Object.entries(LOCATION_COORDINATES)) {
    if (locLower.includes(key)) {
      targetCoords = coords
      break
    }
  }

  if (!targetCoords) {
    // Generate deterministic coordinate
    let hash = 0
    for (let i = 0; i < locLower.length; i++) {
      hash = (hash << 5) - hash + locLower.charCodeAt(i)
      hash |= 0
    }
    const deltaLat = ((Math.abs(hash) % 100) - 50) / 1000
    const deltaLng = ((Math.abs(hash * 3) % 100) - 50) / 1000
    targetCoords = {
      lat: 37.785 + deltaLat,
      lng: -122.27 + deltaLng,
      label: rawClean,
      zone: 'OPERATIONAL_DISTRICT',
    }
  }

  // Rank clients by distance & zone match from spreadsheet matrix (Overview sheet)
  const overviewRows = SPREADSHEET_MATRIX.filter((r) => r.sheetName === 'Overview')
  const ranked = overviewRows.map((row) => {
    const distKm = calculateDistanceKm(targetCoords!.lat, targetCoords!.lng, row.lat, row.lng)
    return {
      row,
      distKm,
      distMiles: distKm * 0.621371,
    }
  }).sort((a, b) => a.distKm - b.distKm)

  const top = ranked[0]
  if (!top) return null

  const formattedDist =
    top.distKm < 1
      ? `${Math.round(top.distKm * 1000)} meters`
      : `${top.distKm.toFixed(1)} km (${top.distMiles.toFixed(1)} miles)`

  return {
    found: true,
    leadLocation: rawClean,
    clientName: top.row.client,
    clientAddress: top.row.address,
    depot: top.row.locationDepot,
    distanceText: formattedDist,
    zone: top.row.zone,
    requirements: top.row.requirements,
    citation: `[Sheet: '${top.row.sheetName}', Row ${top.row.rowNumber}]`,
    matchingClients: ranked.slice(0, 3).map((item) => ({
      name: item.row.client,
      address: item.row.address,
      depot: item.row.locationDepot,
      citation: `[Sheet: '${item.row.sheetName}', Row ${item.row.rowNumber}]`,
      requirements: item.row.requirements,
    })),
  }
}
