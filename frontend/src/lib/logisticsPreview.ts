import type { ResourceAvailability, ResourceKey, Shelter } from '../api/types'
import { fullTime } from './format'

export type LogisticsPriority = 'Urgent' | 'High' | 'Routine'

export type LogisticsRequest = {
  id: string
  reference: string
  shelterId: string
  site: string
  request: string
  quantity: string
  priority: LogisticsPriority
  status: string
  availability: ResourceAvailability
  note: string
}

export type DispatchRow = {
  id: string
  item: string
  from: string
  to: string
  eta: string
}

export type DispatchGroup = {
  key: string
  label: string
  rows: DispatchRow[]
}

export type StockRow = {
  id: string
  item: string
  category: string
  location: string
  availability: ResourceAvailability
  quantity: string
  held: string
  updated: string
}

export type LogisticsPreview = {
  needs: LogisticsRequest[]
  dispatchGroups: DispatchGroup[]
  stock: StockRow[]
  shelterCount: number
  occupiedPeople: number
}

type Supply = {
  key: ResourceKey
  name: string
  category: string
  quantity: (people: number) => string
}

const SUPPLIES: Supply[] = [
  {
    key: 'water',
    name: 'Drinking water',
    category: 'Water',
    quantity: (people) => `${Math.ceil(people / 12)} cases`,
  },
  {
    key: 'food',
    name: 'Ready-to-eat meals',
    category: 'Food',
    quantity: (people) => `${people * 3} meals`,
  },
  {
    key: 'medication',
    name: 'Medication coordination',
    category: 'Medical',
    quantity: () => 'Refill assessment',
  },
  {
    key: 'clothes',
    name: 'Dry clothing',
    category: 'Clothes',
    quantity: (people) => `${Math.ceil(people / 4)} bundles`,
  },
]

const STAGES = [
  { key: 'requested', label: 'Requested', requestStatus: 'Awaiting review' },
  { key: 'approved', label: 'Approved', requestStatus: 'Approved' },
  { key: 'transit', label: 'In transit', requestStatus: 'In transit' },
  { key: 'delivered', label: 'Delivered', requestStatus: 'Fulfilled' },
] as const

const AVAILABILITY = new Set<ResourceAvailability>([
  'available',
  'limited',
  'unavailable',
  'unknown',
])

function hash(value: string) {
  return [...value].reduce((n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) >>> 0, 0)
}

function availability(shelter: Shelter, resource: ResourceKey): ResourceAvailability {
  const value = shelter.resources?.[resource]
  return value && AVAILABILITY.has(value) ? value : 'unknown'
}

export function buildLogisticsPreview(shelters: Shelter[]): LogisticsPreview {
  const active = shelters.filter((shelter) => shelter.status !== 'closed')
  const needs: LogisticsRequest[] = []
  const stock: StockRow[] = []
  const dispatchGroups: DispatchGroup[] = STAGES.map(({ key, label }) => ({
    key,
    label,
    rows: [],
  }))
  let occupiedPeople = 0

  for (const shelter of active) {
    const total = shelter.capacity?.total_people ?? 0
    const reserved = Math.max(0, total - (shelter.capacity?.available_people ?? total))
    occupiedPeople += reserved
    // Example quantities are illustrative restock requests, not measured shortages.
    const planningSize = Math.max(1, reserved, Math.ceil(total * 0.1))
    const shortages = SUPPLIES.filter((supply) =>
      ['limited', 'unavailable'].includes(availability(shelter, supply.key)),
    )
    const requested = shortages.length
      ? shortages
      : [SUPPLIES[hash(shelter.id) % SUPPLIES.length]]

    for (const supply of requested) {
      const id = `example-${shelter.id}-${supply.key}`
      const stageIndex = hash(id) % STAGES.length
      const resourceStatus = availability(shelter, supply.key)
      const priority: LogisticsPriority =
        resourceStatus === 'unavailable' ? 'Urgent' : resourceStatus === 'limited' ? 'High' : 'Routine'
      const request: LogisticsRequest = {
        id,
        reference: `EX-${hash(id).toString(16).toUpperCase().padStart(8, '0')}`,
        shelterId: shelter.id,
        site: shelter.name,
        request: supply.name,
        quantity: supply.quantity(planningSize),
        priority,
        status: STAGES[stageIndex].requestStatus,
        availability: resourceStatus,
        note: `${reserved} of ${total} spaces reserved · ${supply.key} ${resourceStatus}. Example restock request.`,
      }
      needs.push(request)
      dispatchGroups[stageIndex].rows.push({
        id: `DEL-${request.reference.slice(3)}`,
        item: `${request.request} · ${request.quantity}`,
        from: 'Example delivery source',
        to: shelter.name,
        eta: stageIndex === 3 ? 'Example completed delivery' : 'Example delivery · ETA not set',
      })
    }

    for (const supply of SUPPLIES) {
      stock.push({
        id: `${shelter.id}-${supply.key}`,
        item: supply.name,
        category: supply.category,
        location: shelter.name,
        availability: availability(shelter, supply.key),
        quantity: 'Not tracked',
        held: 'Not tracked',
        updated: shelter.updated_at ? fullTime(shelter.updated_at) : 'Not reported',
      })
    }
  }
  return { needs, dispatchGroups, stock, shelterCount: active.length, occupiedPeople }
}
