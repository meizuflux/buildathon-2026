import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cap } from '../lib/format.js'

export function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('input, select, textarea')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented({ value, options, onChange, label, size }) {
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="radiogroup" aria-label={label}>
      {options.map(([v, text, cls = '']) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? `on ${cls}` : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  )
}

export const Empty = ({ children }) => <div className="empty">{children}</div>
export const PriorityBadge = ({ priority }) => <span className={`badge pri-${priority}`}>{cap(priority)}</span>

export function Progress({ total, done, pending = 0 }) {
  const pct = (v) => `${total ? Math.min(100, (v / total) * 100) : 0}%`
  return (
    <div className="progress" role="img" aria-label={`${done} of ${total} received, ${pending} on the way`}>
      <span className="progress-done" style={{ width: pct(done) }} />
      <span className="progress-pending" style={{ width: pct(pending) }} />
    </div>
  )
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}
