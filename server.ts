import express from 'express'
import path from 'path'
import { createServer as createViteServer } from 'vite'
import dotenv from 'dotenv'
import { calculateRoute, geocodeLocation } from './src/server/routeService'
import { optimizeRoute } from './src/server/routeOptimizationService'

dotenv.config()

const app = express()
const PORT = 3000

// Body parsing with generous payload allowance for context
app.use(express.json({ limit: '10mb' }))

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// Geocoding endpoint
app.get('/api/geocode', async (req, res) => {
  try {
    const address = String(req.query.q || req.query.address || '').trim()
    if (!address) {
      return res.status(400).json({ error: 'Missing address query parameter' })
    }
    const coords = await geocodeLocation(address)
    if (!coords) {
      return res.status(404).json({ error: 'Location not found', address })
    }
    res.json({ address, coords })
  } catch (err) {
    res.status(500).json({
      error: 'Geocode failed',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})

// Route metrics & distance calculation endpoint
app.get('/api/route', async (req, res) => {
  try {
    const origin = String(req.query.origin || 'Watson, Oakland, CA')
    const destination = String(req.query.destination || 'Port of Oakland, CA')
    const rawMode = String(req.query.mode || 'driving').toLowerCase()
    const mode: 'driving' | 'transit' = rawMode === 'transit' ? 'transit' : 'driving'
    const result = await calculateRoute(origin, destination, mode)
    res.json(result)
  } catch (err) {
    res.status(500).json({
      error: 'Route calculation failed',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})

app.post('/api/route', async (req, res) => {
  try {
    const origin = String(req.body?.origin || 'Watson, Oakland, CA')
    const destination = String(req.body?.destination || 'Port of Oakland, CA')
    const rawMode = String(req.body?.mode || 'driving').toLowerCase()
    const mode: 'driving' | 'transit' = rawMode === 'transit' ? 'transit' : 'driving'
    const result = await calculateRoute(origin, destination, mode)
    res.json(result)
  } catch (err) {
    res.status(500).json({
      error: 'Route calculation failed',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})

// Route optimization & multi-stop dispatch endpoint (POST)
app.post('/api/route/optimize', async (req, res) => {
  try {
    const { origin, stops, mode, roundTrip } = req.body || {}
    if (!origin || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({
        error: 'Invalid request: origin and an array of stops are required',
      })
    }
    const result = await optimizeRoute({
      origin: String(origin),
      stops,
      mode: mode === 'transit' ? 'transit' : 'driving',
      roundTrip: Boolean(roundTrip),
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({
      error: 'Route optimization failed',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})

// Route optimization & multi-stop dispatch endpoint (GET for query parameters)
app.get('/api/route/optimize', async (req, res) => {
  try {
    const origin = String(req.query.origin || 'Watson, Oakland, CA')
    const rawStops = req.query.stops ? String(req.query.stops).split('|') : []
    const mode = String(req.query.mode || 'driving').toLowerCase() === 'transit' ? 'transit' : 'driving'
    const roundTrip = req.query.roundTrip === 'true'

    if (rawStops.length === 0) {
      return res.status(400).json({
        error: 'Invalid request: query parameter stops (pipe-separated addresses) is required',
      })
    }

    const stops = rawStops.map((addr, idx) => ({
      id: `STOP-${idx + 1}`,
      address: addr.trim(),
    }))

    const result = await optimizeRoute({
      origin,
      stops,
      mode,
      roundTrip,
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({
      error: 'Route optimization failed',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})

// Start server with Vite middleware in development or static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.join(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Zenith Apex Server running on http://0.0.0.0:${PORT}`)
  })
}

startServer()
