import React from 'react'

export function PanelHead({
  label,
  right,
  tone = 'nexus',
}: {
  label: string
  right?: React.ReactNode
  tone?: 'nexus' | 'hazard' | 'caution'
}) {
  const toneText = tone === 'hazard' ? 'text-hazard' : tone === 'caution' ? 'text-caution' : 'text-nexus'
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-b border-line bg-surface2 px-2">
      <h2 className={`font-mono text-3xs font-bold tracking-[0.18em] ${toneText}`}>{label}</h2>
      {right}
    </div>
  )
}

export function Pill({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-[1px] font-mono text-3xs tracking-widest ${className}`}
    >
      {children}
    </span>
  )
}

export function TermButton({
  children,
  onClick,
  tone = 'nexus',
  className = '',
  title,
  type = 'button',
  disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  tone?: 'nexus' | 'hazard' | 'caution' | 'ghost'
  className?: string
  title?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const map = {
    nexus: 'border-nexus/50 text-nexus hover:bg-nexus/10',
    hazard: 'border-hazard/60 text-hazard hover:bg-hazard/10',
    caution: 'border-caution/60 text-caution hover:bg-caution/10',
    ghost: 'border-line2 text-dim hover:text-ink hover:border-dim',
  }
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`border px-2 py-1 font-mono text-3xs tracking-widest transition-colors duration-150 ease-out ${map[tone]} ${className}`}
    >
      {children}
    </button>
  )
}


export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-3xs tracking-widest text-dim">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full border border-line2 bg-void px-2 py-1.5 font-mono text-xs text-ink outline-none transition-colors duration-150 ease-out focus:border-nexus'
