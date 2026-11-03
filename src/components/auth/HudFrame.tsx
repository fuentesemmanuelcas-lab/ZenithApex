import React from 'react'

const corner = 'pointer-events-none absolute h-16 w-16 border-hazard/70'

/** Decorative HUD chrome framing the access gate. */
export function HudFrame() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 p-4">
      <div className={`${corner} left-4 top-4 border-l border-t`}>
        <span className="absolute left-2 top-2 font-mono text-3xs tracking-[0.2em] text-hazard/70">SYS.INIT_01</span>
      </div>
      <div className={`${corner} right-4 top-4 border-r border-t`}>
        <span className="absolute right-2 top-2 text-right font-mono text-3xs leading-tight tracking-[0.2em] text-hazard/70">
          NET.LINK
          <br />
          SECURE
        </span>
      </div>
      <div className={`${corner} bottom-4 left-4 border-b border-l`}>
        <span className="absolute bottom-2 left-2 font-mono text-3xs leading-tight tracking-[0.2em] text-hazard/70">
          NODE: TOKYO-03
          <br />
          STATUS: ARMED
        </span>
      </div>
      <div className={`${corner} bottom-4 right-4 border-b border-r`}>
        <span className="absolute bottom-2 right-2 text-right font-mono text-3xs leading-tight tracking-[0.2em] text-hazard/70">
          VER: 4.2.1
          <br />
          CORP_ID: 9940
        </span>
      </div>

      <div className="absolute left-1/2 top-4 h-px w-1/3 -translate-x-1/2 bg-hazard/25" />
      <div className="absolute bottom-4 left-1/2 h-px w-1/3 -translate-x-1/2 bg-hazard/25" />
    </div>
  )
}
