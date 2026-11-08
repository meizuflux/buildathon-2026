import { useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { EvacuationHousehold, Requirement } from '../api/types'
import { compact, type Algo } from '../lib/evac'

// Canvas overlay for the evacuation simulation. One <canvas> is drawn every
// animation frame from typed arrays; there is no per-household React state or
// Leaflet layer, so ~1,000 moving dots stay smooth.

export type EvacPin = { id: string; name: string; lat: number; lng: number; total: number }
export type EvacFilter = Requirement | 'any' | null
/** ready: everyone at home. running: plays once, then onDone. done: everyone at their shelter. */
export type EvacPhase = 'ready' | 'running' | 'done'

const TRAVEL_S = 2.8 // each household's trip
const STAGGER_S = 2.2 // start times are spread over this window (total about 5 s)
const COLORS = ['#9fb2c6', '#4fc48d', '#f2615e'] // neutral, all met, unmet
const TWO_PI = Math.PI * 2
const SLOT_GAP = 5 // px between neighbouring arrivals; dots are 6 px wide, so the crowd touches
const PIN_CLEAR = 22 // keep arrivals just outside the shelter pin (radius 19 plus its ring)

// The n hex-grid points nearest the shelter, outside the pin: a tight crowd, not a ring.
const slotCache = new Map<number, [number, number][]>()
function crowdSlots(n: number): [number, number][] {
  const cached = slotCache.get(n)
  if (cached) return cached
  const rowH = SLOT_GAP * Math.sqrt(3) / 2
  const need = (PIN_CLEAR * PIN_CLEAR * Math.PI + n * SLOT_GAP * rowH) / Math.PI
  const reach = Math.sqrt(need) + SLOT_GAP * 2
  const pts: [number, number, number][] = []
  for (let r = -Math.ceil(reach / rowH); r <= Math.ceil(reach / rowH); r++) {
    const y = r * rowH
    const off = (r & 1) * SLOT_GAP / 2
    for (let c = -Math.ceil(reach / SLOT_GAP) - 1; c <= Math.ceil(reach / SLOT_GAP) + 1; c++) {
      const x = c * SLOT_GAP + off
      const d = Math.hypot(x, y)
      if (d >= PIN_CLEAR && d <= reach) pts.push([x, y, d])
    }
  }
  pts.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1])
  const slots = pts.slice(0, n).map(([x, y]): [number, number] => [x, y])
  slotCache.set(n, slots)
  return slots
}

type Model = {
  n: number
  homeLat: Float64Array
  homeLng: Float64Array
  destLat: Float64Array
  destLng: Float64Array
  delay: Float32Array
  jx: Float32Array
  jy: Float32Array
  people: Int32Array
  shelter: Int16Array // index into pins, -1 when unassigned
  byColor: Int32Array[]
  pins: EvacPin[]
  algo: Algo
  households: EvacuationHousehold[]
  doneAt: number
}

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

function buildModel(households: EvacuationHousehold[], pins: EvacPin[], algo: Algo): Model {
  const n = households.length
  const pinIndex = new Map(pins.map((p, i) => [p.id, i]))
  const m: Model = {
    n, pins, algo, households,
    homeLat: new Float64Array(n), homeLng: new Float64Array(n),
    destLat: new Float64Array(n), destLng: new Float64Array(n),
    delay: new Float32Array(n), jx: new Float32Array(n), jy: new Float32Array(n),
    people: new Int32Array(n), shelter: new Int16Array(n), byColor: [], doneAt: 0,
  }
  const lists: number[][] = [[], [], []]
  const arrivals: number[][] = pins.map(() => [])
  let maxDelay = 0
  households.forEach((h, i) => {
    const dest = h[algo]
    const si = dest.shelter_id != null ? pinIndex.get(dest.shelter_id) ?? -1 : -1
    m.homeLat[i] = h.location.latitude
    m.homeLng[i] = h.location.longitude
    m.people[i] = h.people
    m.shelter[i] = si
    m.delay[i] = hash01(h.family_id) * STAGGER_S
    maxDelay = Math.max(maxDelay, m.delay[i])
    if (si >= 0) {
      m.destLat[i] = pins[si].lat
      m.destLng[i] = pins[si].lng
      arrivals[si].push(i)
    } else {
      m.destLat[i] = m.homeLat[i]
      m.destLng[i] = m.homeLng[i]
    }
    const color = dest.unmet.length > 0 || (si < 0 && h.requirements.length > 0) ? 2 : h.requirements.length > 0 ? 1 : 0
    lists[color].push(i)
  })
  // Pack each shelter's arrivals into its nearest crowd slots, matching the side they came from,
  // so the crowd grows towards its neighbourhoods and paths don't cross.
  arrivals.forEach((members, si) => {
    if (!members.length) return
    const pin = pins[si]
    const cosLat = Math.cos((pin.lat * Math.PI) / 180)
    const bearing = (i: number) => Math.atan2(-(m.homeLat[i] - pin.lat), (m.homeLng[i] - pin.lng) * cosLat)
    const byBearing = [...members].sort((a, b) => bearing(a) - bearing(b) || a - b)
    const slots = [...crowdSlots(members.length)].sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]))
    byBearing.forEach((i, k) => {
      const jitter = hash01(households[i].family_id + ':j') - 0.5
      m.jx[i] = slots[k][0] + jitter
      m.jy[i] = slots[k][1] - jitter
    })
  })
  m.byColor = lists.map((l) => Int32Array.from(l))
  m.doneAt = maxDelay + TRAVEL_S
  return m
}

function computeLit(m: Model, filter: EvacFilter): Uint8Array {
  const lit = new Uint8Array(m.n)
  m.households.forEach((h, i) => {
    const unmet = h[m.algo].unmet
    lit[i] = filter == null ? 1 : filter === 'any' ? (unmet.length > 0 ? 1 : 0) : unmet.includes(filter) ? 1 : 0
  })
  return lit
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export default function EvacCanvas({ households, pins, algo, phase, onDone, filter }: {
  households: EvacuationHousehold[]
  pins: EvacPin[]
  algo: Algo
  phase: EvacPhase
  onDone: () => void
  filter: EvacFilter
}) {
  const map = useMap()
  const model = useMemo(() => buildModel(households, pins, algo), [households, pins, algo])
  const modelRef = useRef<Model>(model)
  const litRef = useRef<Uint8Array>(new Uint8Array(0))
  const filterRef = useRef<EvacFilter>(filter)
  const phaseRef = useRef<EvacPhase>(phase)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const ctl = useRef<{ restart: () => void; redraw: () => void } | null>(null)

  // Canvas, draw loop and map listeners: created once per map.
  useEffect(() => {
    const container = map.getContainer()
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '450' })
    container.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    let dpr = 1
    let raf = 0
    let alive = true
    let t0 = performance.now()
    let xs = new Float32Array(0)
    let ys = new Float32Array(0)
    let arrived = new Int32Array(0)

    const size = () => {
      dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(container.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(container.clientHeight * dpr))
    }

    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Draws one frame and reports whether the animation is still running.
    const draw = (now: number): boolean => {
      if (!ctx) return false
      const m = modelRef.current
      const lit = litRef.current
      const filtering = filterRef.current != null
      const w = container.clientWidth
      const h = container.clientHeight
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const ph = phaseRef.current
      const elapsed = ph === 'ready' ? 0 : ph === 'done' || reduced() ? Infinity : (now - t0) / 1000
      if (xs.length !== m.n) { xs = new Float32Array(m.n); ys = new Float32Array(m.n) }
      if (arrived.length !== m.pins.length) arrived = new Int32Array(m.pins.length)
      arrived.fill(0)

      for (let i = 0; i < m.n; i++) {
        const p = Math.min(1, Math.max(0, (elapsed - m.delay[i]) / TRAVEL_S))
        const e = ease(p)
        const s = m.shelter[i]
        const lat = m.homeLat[i] + (m.destLat[i] - m.homeLat[i]) * e
        const lng = m.homeLng[i] + (m.destLng[i] - m.homeLng[i]) * e
        const pt = map.latLngToContainerPoint([lat, lng])
        xs[i] = pt.x + m.jx[i] * e
        ys[i] = pt.y + m.jy[i] * e
        if (s >= 0 && p >= 1) arrived[s] += m.people[i]
      }

      // Dimmed households first, then the highlighted ones on top.
      for (let pass = 0; pass < (filtering ? 2 : 1); pass++) {
        const wantLit = filtering ? pass === 1 : true
        const r = filtering && wantLit ? 4 : 3
        ctx.globalAlpha = wantLit ? 0.92 : 0.1
        for (let c = 0; c < 3; c++) {
          const list = m.byColor[c]
          if (!list.length) continue
          ctx.fillStyle = COLORS[c]
          ctx.beginPath()
          for (let k = 0; k < list.length; k++) {
            const i = list[k]
            if ((lit[i] === 1) !== wantLit) continue
            const x = xs[i]
            const y = ys[i]
            if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue
            ctx.moveTo(x + r, y)
            ctx.arc(x, y, r, 0, TWO_PI)
          }
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      const finished = elapsed >= m.doneAt
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let si = 0; si < m.pins.length; si++) {
        const pin = m.pins[si]
        const pt = map.latLngToContainerPoint([pin.lat, pin.lng])
        if (pt.x < -80 || pt.y < -80 || pt.x > w + 80 || pt.y > h + 80) continue
        const load = arrived[si]
        const over = Math.max(0, load - pin.total)
        const frac = pin.total > 0 ? Math.min(1, load / pin.total) : load > 0 ? 1 : 0
        const color = over > 0 ? '#f2615e' : frac > 0.9 ? '#f1ab45' : '#e6edf4'
        if (over > 0) {
          const g = ctx.createRadialGradient(pt.x, pt.y, 14, pt.x, pt.y, 30)
          g.addColorStop(0, 'rgba(242,97,94,0.35)')
          g.addColorStop(1, 'rgba(242,97,94,0)')
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 30, 0, TWO_PI); ctx.fill()
        }
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 19, 0, TWO_PI)
        ctx.fillStyle = 'rgba(14,21,29,0.92)'; ctx.fill()
        ctx.lineWidth = 5; ctx.strokeStyle = '#3a4b5e'; ctx.stroke()
        if (frac > 0) {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 19, -Math.PI / 2, -Math.PI / 2 + frac * TWO_PI)
          ctx.strokeStyle = color; ctx.stroke()
        }
        ctx.font = '700 12px "Public Sans", system-ui, sans-serif'
        ctx.fillStyle = over > 0 ? '#f2615e' : '#e6edf4'
        ctx.fillText(compact(load), pt.x, pt.y + 0.5)
        ctx.font = '600 11px "Public Sans", system-ui, sans-serif'
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14,21,29,0.9)'; ctx.lineJoin = 'round'
        ctx.strokeText(pin.name, pt.x, pt.y + 32)
        ctx.fillStyle = '#e6edf4'
        ctx.fillText(pin.name, pt.x, pt.y + 32)
        if (finished && over > 0) {
          const label = `Over capacity +${over.toLocaleString()}`
          ctx.font = '700 11px "Public Sans", system-ui, sans-serif'
          const tw = ctx.measureText(label).width + 14
          ctx.fillStyle = '#f2615e'
          ctx.beginPath(); ctx.roundRect(pt.x - tw / 2, pt.y - 46, tw, 18, 5); ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.fillText(label, pt.x, pt.y - 37)
        }
      }
      if (ph === 'running' && finished) {
        phaseRef.current = 'done'
        onDoneRef.current()
      }
      return ph === 'running' && !finished
    }

    const frame = (now: number) => {
      raf = 0
      if (draw(now) && alive) raf = requestAnimationFrame(frame)
    }
    const redraw = () => { if (!raf && alive) raf = requestAnimationFrame(frame) }
    const restart = () => { t0 = performance.now(); redraw() }
    ctl.current = { restart, redraw }

    const onZoomStart = () => { canvas.style.opacity = '0' }
    const onZoomEnd = () => { canvas.style.opacity = '1'; redraw() }
    size()
    map.on('move zoom moveend zoomend resize viewreset', redraw)
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    const ro = new ResizeObserver(() => { size(); redraw() })
    ro.observe(container)
    redraw()

    return () => {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      map.off('move zoom moveend zoomend resize viewreset', redraw)
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
      canvas.remove()
      ctl.current = null
    }
  }, [map])

  // New data or algorithm: swap the model and redraw in the current phase (never restarts on its own).
  useEffect(() => {
    modelRef.current = model
    litRef.current = computeLit(model, filterRef.current)
    ctl.current?.redraw()
  }, [model])

  // Run plays once from the start; ready and done just redraw.
  useEffect(() => {
    phaseRef.current = phase
    if (phase === 'running') ctl.current?.restart()
    else ctl.current?.redraw()
  }, [phase])

  // Highlight changes only redraw.
  useEffect(() => {
    filterRef.current = filter
    litRef.current = computeLit(modelRef.current, filter)
    ctl.current?.redraw()
  }, [filter])

  return null
}
