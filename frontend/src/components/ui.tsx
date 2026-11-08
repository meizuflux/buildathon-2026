import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { api } from '../api'
import type { Family } from '../api/types'
import type { ShelterLevel } from '../lib/format'
import { errorMessage, loadAllFamilies } from '../lib/ops'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="hx-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`hx-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="hx-modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Head({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="hx-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

export type SegOption<T extends string> = readonly [value: T, label: string, className?: string, count?: number]

export function Seg<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T
  options: readonly SegOption<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={`seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([v, text, cls = '', count]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} className={cls} onClick={() => onChange(v)}>
          {text}
          {count != null && <span className="count">{count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Meter({ value, level, thin }: { value: number; level?: ShelterLevel; thin?: boolean }) {
  return (
    <div className={`meter ${thin ? 'thin' : ''}`} aria-hidden="true">
      <i className={level ? `lvl-${level}` : ''} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

// Every family in the disaster for the map layer, refreshed every 12 s while shown.
export function useAllFamilies(disasterId: string | null, enabled = true) {
  const [families, setFamilies] = useState<Family[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let loading = false
    setFamilies([])
    setError(null)
    if (!disasterId || !enabled) return () => { active = false }
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const all = await loadAllFamilies(api, disasterId)
        if (active) { setFamilies(all); setError(null) }
      } catch (e) {
        if (active) setError(errorMessage(e))
      } finally {
        loading = false
      }
    }
    load()
    const t = setInterval(load, 12_000)
    return () => { active = false; clearInterval(t) }
  }, [disasterId, enabled])
  return { families, error }
}
