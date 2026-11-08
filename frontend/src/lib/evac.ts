import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { EvacuationPreview, Requirement } from '../api/types'
import { errorMessage } from './ops'

export type Algo = 'naive' | 'personalized'

export const REQUIREMENTS: Requirement[] = [
  'medication', 'medical_staff', 'wheelchair_accessible', 'pets', 'child_friendly', 'special_care',
]
export const REQ_LABEL: Record<Requirement, string> = {
  medication: 'Medication',
  medical_staff: 'Medical staff',
  wheelchair_accessible: 'Wheelchair access',
  pets: 'Pets',
  child_friendly: 'Child-friendly',
  special_care: 'Special care',
}
export const REQ_UNMET_LABEL: Record<Requirement, string> = {
  medication: 'Medication not available',
  medical_staff: 'No medical staff',
  wheelchair_accessible: 'No wheelchair access',
  pets: 'Pets not allowed',
  child_friendly: 'Not child-friendly',
  special_care: 'No special care',
}

export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
export const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
export const km = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} km`)

// Fetches the operator-only evacuation preview; refetches when the disaster changes or reload() runs.
export function useEvacuationPreview(disasterId: string | null, enabled = true) {
  const [preview, setPreview] = useState<EvacuationPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (!disasterId) return
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const p = await api.getEvacuationPreview(disasterId)
      if (seq.current === mine) setPreview(p)
    } catch (e) {
      if (seq.current === mine) setError(errorMessage(e))
    } finally {
      if (seq.current === mine) setLoading(false)
    }
  }, [disasterId])

  useEffect(() => {
    setPreview(null)
    if (!enabled) { seq.current++; setLoading(false); return }
    reload()
    return () => { seq.current++ }
  }, [disasterId, enabled, reload])

  return { preview, loading, error, reload }
}
