import React, { useState } from 'react'
import { RouteIcon, XIcon } from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { TermButton } from '../ui/Primitives'
import { buildMapEmbed, executeMapDirections } from '../../utils/maps'

/** #pModal — projection engine overlay with live direction routing. */
export function ProjectModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { records, pushLog } = useZenith()
  const seed = projectId.split('-')[1] ?? 'depot'
  const [origin, setOrigin] = useState('Central Waypoint')
  const [destination, setDestination] = useState(seed)
  const [src, setSrc] = useState(() => buildMapEmbed(seed))
  const [label, setLabel] = useState(seed.toUpperCase())

  const related = records.filter((r) => r.depot.toLowerCase().includes(seed.toLowerCase()))

  return (
    <div id="pModal" className="fixed inset-0 z-50 flex flex-col bg-void/95 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-line bg-surface px-3 py-2">
        <h2 className="font-mono text-3xs tracking-[0.2em] text-hazard text-glow-hazard">
          PROJECTION_ENGINE // {projectId}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSrc(executeMapDirections(origin, destination))
            setLabel(`${origin.toUpperCase()} → ${destination.toUpperCase()}`)
            pushLog('NAV', `overlay route ${origin} → ${destination}`, 'nexus')
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex items-center gap-1.5 border border-line bg-void px-2">
            <span className="font-mono text-3xs text-dimmer">FROM</span>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              aria-label="Route origin"
              className="w-36 bg-transparent py-1 font-mono text-2xs text-ink outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 border border-line bg-void px-2">
            <span className="font-mono text-3xs text-dimmer">TO</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              aria-label="Route destination"
              className="w-36 bg-transparent py-1 font-mono text-2xs text-ink outline-none"
            />
          </div>
          <TermButton type="submit" className="flex items-center gap-1">
            <RouteIcon className="h-3 w-3" aria-hidden />
            ROUTE
          </TermButton>
          <TermButton tone="hazard" onClick={onClose} className="flex items-center gap-1">
            <XIcon className="h-3 w-3" aria-hidden />
            CLOSE
          </TermButton>
        </form>
      </div>

      <div className="mt-2 grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_260px]">
        <div className="relative min-h-0 border border-nexus/30">
          <iframe
            key={src}
            title={`Routing for ${projectId}`}
            src={src}
            className="h-full w-full grayscale-[0.6] contrast-125"
            style={{ border: 0 }}
            loading="lazy"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-nexus/[0.04]" />
          <span className="pointer-events-none absolute bottom-2 left-2 max-w-[90%] truncate border border-nexus/40 bg-void/85 px-2 py-1 font-mono text-3xs text-nexus">
            {label}
          </span>
        </div>
        <div className="term-scroll min-h-0 overflow-y-auto border border-line bg-surface p-2">
          <p className="mb-2 font-mono text-3xs tracking-widest text-dimmer">LINKED_RECORDS</p>
          <ul className="space-y-1">
            {related.map((r) => (
              <li key={r.id} className="border border-line bg-void px-2 py-1">
                <p className="font-mono text-2xs text-nexus">{r.id}</p>
                <p className="truncate text-2xs text-ink">{r.operator}</p>
                <p className="font-mono text-3xs text-dim">
                  {r.stage} · {r.qc} · SLA {r.sla}%
                </p>
              </li>
            ))}
            {related.length === 0 && (
              <li className="font-mono text-3xs text-dimmer">no records linked to this project</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
