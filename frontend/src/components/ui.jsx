import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cap } from '../lib/format.js'

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('input, select, textarea, button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
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

export function Segmented({ value, options, onChange, size, label }) {
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="radiogroup" aria-label={label}>
      {options.map(([v, text, cls = '']) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? `on ${cls}` : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

// Group shelters and orgs into one <select> of site references.
export function SiteSelect({ value, onChange, shelters, organizations, kinds = ['shelter', 'organization'], placeholder = 'Choose…', id, required }) {
  const v = value ? `${value.kind}:${value.id}` : ''
  return (
    <select id={id} value={v} required={required} onChange={(e) => {
      const [kind, ...rest] = e.target.value.split(':')
      onChange(e.target.value ? { kind, id: rest.join(':') } : null)
    }}>
      <option value="">{placeholder}</option>
      {kinds.includes('shelter') && (
        <optgroup label="Shelters">
          {shelters.map((s) => <option key={s.id} value={`shelter:${s.id}`}>{s.name}</option>)}
        </optgroup>
      )}
      {kinds.includes('organization') && (
        <optgroup label="Organizations">
          {organizations.map((o) => <option key={o.id} value={`organization:${o.id}`}>{o.name}</option>)}
        </optgroup>
      )}
    </select>
  )
}
