import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeftIcon, ExternalLinkIcon, EraserIcon } from 'lucide-react'
import { useZenith } from '../../contexts/ZenithContext'
import { PanelHead } from '../ui/Primitives'
import { AGENT_SUGGESTIONS, runAgent, type AgentLine, type AgentTone } from '../../utils/aiAgent'

interface Entry {
  id: string
  role: 'USER' | 'AI'
  line: AgentLine
}

const toneCls: Record<AgentTone, string> = {
  ink: 'text-ink',
  dim: 'text-dim',
  nexus: 'text-nexus',
  hazard: 'text-hazard',
  caution: 'text-caution',
}

const BOOT: Entry[] = [
  {
    id: 'boot-1',
    role: 'AI',
    line: { text: 'ORACLE online — reading live NEXUS state.', tone: 'nexus' },
  },
  {
    id: 'boot-2',
    role: 'AI',
    line: { text: 'Ask about SLA risk, stages, holds, or schedule.', tone: 'dim' },
  },
]

let seq = 0
const nextId = (): string => `AE${++seq}`

/** Conversational analyst over the operator dataset. Answers are computed on-device. */
export function AiTerminal({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const { records, events, latency, bridge, syncCycle, userFiles, pushLog, setView, device } = useZenith()
  const [entries, setEntries] = useState<Entry[]>(BOOT)
  const [queue, setQueue] = useState<AgentLine[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const feedRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  // Print queued response lines one at a time so answers read as terminal output.
  useEffect(() => {
    if (!queue.length) return
    const t = window.setTimeout(() => {
      setQueue((prev) => {
        const [head, ...rest] = prev
        if (head) setEntries((e) => [...e, { id: nextId(), role: 'AI', line: head }].slice(-60))
        if (!rest.length) setBusy(false)
        return rest
      })
    }, 70)
    timers.current.push(t)
    return () => window.clearTimeout(t)
  }, [queue])

  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries, busy])

  const ctx = useMemo(
    () => ({ records, events, userFiles, latency, bridge, syncCycle, recentQueries: history }),
    [records, events, userFiles, latency, bridge, syncCycle, history],
  )

  const ask = async (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    setEntries((e) => [...e, { id: nextId(), role: 'USER', line: { text } }].slice(-60))
    setHistory((h) => [text, ...h].slice(0, 20))
    setHistIdx(-1)
    setInput('')
    setBusy(true)
    pushLog('ORACLE', `query "${text}"`, 'nexus')

    // Deterministic intelligence engine executing directly on-device
    const t = window.setTimeout(() => {
      const reply = runAgent(text, ctx)
      setQueue(reply.lines.length ? reply.lines : [{ text: 'No output.', tone: 'dim' }])
      if (reply.view) setView(reply.view)
    }, 120)
    timers.current.push(t)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = Math.min(history.length - 1, histIdx + 1)
      setHistIdx(i)
      setInput(history[i])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = histIdx - 1
      setHistIdx(i)
      setInput(i >= 0 ? history[i] : '')
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border border-line bg-surface">
      <PanelHead
        label="ORACLE_TERMINAL"
        right={
          <button
            type="button"
            onClick={() => {
              setEntries(BOOT)
              setQueue([])
              setBusy(false)
            }}
            title="Clear transcript"
            className="text-dimmer transition-colors duration-150 ease-out hover:text-nexus"
          >
            <EraserIcon className="h-3 w-3" aria-hidden />
            <span className="sr-only">Clear transcript</span>
          </button>
        }
      />

      <div
        ref={feedRef}
        role="log"
        aria-live="polite"
        aria-label="Oracle terminal transcript"
        className="term-scroll min-h-0 flex-1 space-y-1 overflow-y-auto bg-void p-2 font-mono text-3xs leading-relaxed"
      >
        {entries.map((entry) =>
          entry.role === 'USER' ? (
            <p key={entry.id} className="text-2xs text-ink">
              <span className="text-nexus">&gt;</span> {entry.line.text}
            </p>
          ) : (
            <div key={entry.id} className="pl-2">
              <p className={toneCls[entry.line.tone ?? 'ink']}>{entry.line.text}</p>
              {entry.line.ref && (
                <button
                  type="button"
                  onClick={() => onOpenProject(entry.line.ref as string)}
                  className="mt-0.5 inline-flex items-center gap-1 text-nexus underline decoration-nexus/40 underline-offset-2 transition-colors duration-150 ease-out hover:decoration-nexus"
                >
                  {entry.line.ref}
                  <ExternalLinkIcon className="h-2.5 w-2.5" aria-hidden />
                </button>
              )}
            </div>
          ),
        )}
        {busy && (
          <p className="pl-2 text-dimmer">
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-nexus align-middle" />
            resolving…
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface2 p-1.5">
        <div className={`mb-1.5 flex flex-wrap gap-1 ${device === 'D' ? '' : 'max-h-8 overflow-hidden'}`}>
          {AGENT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => ask(s)}
              className="border border-line2 px-1.5 py-[1px] font-mono text-3xs tracking-widest text-dim transition-colors duration-150 ease-out hover:border-nexus/60 hover:text-nexus disabled:opacity-40"
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(input)
          }}
          className="flex items-center gap-1 border border-line2 bg-void px-1.5 transition-colors duration-150 ease-out focus-within:border-nexus"
        >
          <span aria-hidden className="font-mono text-2xs text-nexus">
            &gt;
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            aria-label="Ask the Oracle"
            placeholder="query nexus…"
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-2xs text-ink outline-none placeholder:text-dimmer disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            title="Send query"
            className="text-dimmer transition-colors duration-150 ease-out hover:text-nexus disabled:opacity-40"
          >
            <CornerDownLeftIcon className="h-3 w-3" aria-hidden />
            <span className="sr-only">Send query</span>
          </button>
        </form>
      </div>
    </section>
  )
}
