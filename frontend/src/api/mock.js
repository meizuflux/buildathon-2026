// In-browser mock of the Haven API (Part 1 + Part 2 contracts) so the dashboard
// works before the backend routes exist. Same method names and shapes as
// liveApi, including the side effects Part 2 describes. State persists in
// localStorage; resetMockData() starts over. All data here is fictional.

import { ApiError } from './live.js'

const KEY = 'haven-mock-db-v2'
const D = 'disaster_001'
const now = () => new Date().toISOString()
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString()
const fromNow = (m) => new Date(Date.now() + m * 60_000).toISOString()
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`
const clone = (v) => structuredClone(v)
const OPERATOR = { id: 'user_mock_operator', role: 'operator', family_id: null }
const OPERATOR_ACTOR = { kind: 'operator', id: OPERATOR.id, name: 'Operator' }

export const RESOURCE_TYPES = [
  { id: 'water_bottled', name: 'Bottled water', category: 'water', unit: 'cases' },
  { id: 'water_gallon', name: 'Water jugs (1 gal)', category: 'water', unit: 'jugs' },
  { id: 'food_mre', name: 'Ready-to-eat meals', category: 'food', unit: 'meals' },
  { id: 'food_canned', name: 'Canned food', category: 'food', unit: 'cases' },
  { id: 'baby_formula', name: 'Baby formula', category: 'baby', unit: 'cans' },
  { id: 'diapers', name: 'Diapers', category: 'baby', unit: 'packs' },
  { id: 'insulin', name: 'Insulin (refrigerated)', category: 'medication', unit: 'vials' },
  { id: 'rx_refills', name: 'Prescription refills', category: 'medication', unit: 'doses' },
  { id: 'first_aid', name: 'First aid kits', category: 'medical_supplies', unit: 'kits' },
  { id: 'oxygen', name: 'Oxygen cylinders', category: 'medical_supplies', unit: 'cylinders' },
  { id: 'blankets', name: 'Blankets', category: 'bedding', unit: 'units' },
  { id: 'cots', name: 'Cots', category: 'bedding', unit: 'units' },
  { id: 'hygiene_kit', name: 'Hygiene kits', category: 'hygiene', unit: 'kits' },
  { id: 'clothing', name: 'Clothing bundles', category: 'clothes', unit: 'bundles' },
  { id: 'generator', name: 'Generators', category: 'power', unit: 'units' },
  { id: 'fuel', name: 'Fuel', category: 'power', unit: 'gallons' },
]

// ---------- deterministic fake families (only used for broadcast reach) ----------
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const FAMILIES = (() => {
  const r = rng(42)
  return Array.from({ length: 4800 }, (_, i) => {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 11 // km from centre
    const lat = 27.955 + (d / 111) * Math.cos(a)
    return {
      id: `family_${String(i + 1).padStart(3, '0')}`,
      location: { latitude: lat, longitude: -82.455 + (d / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a) },
      flags: {
        pets: r() < 0.32,
        immediate_medication: r() < 0.14,
        accessibility: r() < 0.08,
        no_car: r() < 0.21,
        children: r() < 0.41,
      },
    }
  })
})()

function km(a, b) {
  const R = 6371
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function countRecipients(disasterId, target, audience) {
  if (disasterId !== D) return 0
  const needs = audience?.needs || []
  return FAMILIES.filter((f) => {
    if (target?.type === 'radius' && km(f.location, target.center) > target.radius_km) return false
    return needs.length === 0 || needs.some((n) => f.flags[n])
  }).length
}

// ---------- seed ----------
function seed() {
  const shelter = (n, name, address, lat, lng, status, total, avail, caps, res, updatedAgo) => ({
    id: `shelter_00${n}`, disaster_id: D, name, address,
    location: { latitude: lat, longitude: lng }, status,
    capacity: { total_people: total, available_people: avail },
    capabilities: { pets_allowed: false, child_friendly: false, wheelchair_accessible: false, medical_staff: [], special_care_notes: '', ...caps },
    resources: { food: 'available', water: 'available', medication: 'unknown', clothes: 'unknown', ...res },
    updated_at: ago(updatedAgo),
  })
  const org = (n, name, type, services, status, address, lat, lng, contact, radius, notes, updatedAgo) => ({
    id: `org_00${n}`, disaster_id: D, name, type, services, status, address,
    location: { latitude: lat, longitude: lng }, contact, coverage_radius_km: radius, notes, updated_at: ago(updatedAgo),
  })
  const inv = (orgId, rows) => rows.map(([rt, q, reserved = 0]) => ({
    holder: { kind: 'organization', id: orgId }, resource_type_id: rt, quantity: q, reserved, updated_at: ago(40),
  }))
  const need = (n, kind, id, rt, qty, done, priority, notes, createdAgo, neededIn) => ({
    id: `need_00${n}`, disaster_id: D, requester: { kind, id }, resource_type_id: rt,
    quantity_needed: qty, quantity_fulfilled: done, priority, status: done >= qty ? 'fulfilled' : 'open',
    needed_by: neededIn == null ? null : fromNow(neededIn), notes, created_at: ago(createdAgo), updated_at: ago(createdAgo),
  })
  const update = (n, title, message, severity, publishedAgo, target = { type: 'all' }, audience = { needs: [] }) => ({
    id: `update_00${n}`, disaster_id: D, title, message, severity, target, audience,
    status: 'published', published_at: ago(publishedAgo), scheduled_for: null, expires_at: null,
    recipient_count: countRecipients(D, target, audience),
  })

  const db = {
    disasters: [
      { id: D, type: 'hurricane', name: 'Hurricane Haven', status: 'active', affected_area: 'Example County', updated_at: ago(30) },
      { id: 'disaster_002', type: 'flood', name: 'River Flooding', status: 'active', affected_area: 'North Example County', updated_at: ago(240) },
    ],
    shelters: [
      shelter(1, 'Central Community Center', '100 Main Street, Example City', 27.96, -82.45, 'open', 100, 30,
        { pets_allowed: true, child_friendly: true, wheelchair_accessible: true, medical_staff: ['doctor', 'nurse'], special_care_notes: 'Can refrigerate insulin' },
        { medication: 'limited', clothes: 'available' }, 12),
      shelter(2, 'Westside High School Gym', '2200 West Oak Ave, Example City', 27.948, -82.51, 'open', 250, 140,
        { child_friendly: true, wheelchair_accessible: true }, { water: 'limited', clothes: 'available' }, 25),
      shelter(3, 'St. Luke Medical Annex', '45 Harbor Blvd, Example City', 27.935, -82.46, 'open', 40, 4,
        { wheelchair_accessible: true, medical_staff: ['doctor', 'nurse', 'paramedic'], special_care_notes: 'Oxygen, dialysis referrals' },
        { medication: 'available', food: 'limited' }, 5),
      shelter(4, 'Northgate Church Hall', '780 Northgate Rd, Example City', 28.01, -82.44, 'full', 80, 0,
        { pets_allowed: true, child_friendly: true }, { food: 'limited', water: 'unavailable' }, 48),
      shelter(5, 'Eastbay Fairgrounds', '1 Fairground Way, Example City', 27.97, -82.37, 'open', 400, 310,
        { pets_allowed: true }, { medication: 'unavailable' }, 70),
      shelter(6, 'Riverside Library', '312 River St, Example City', 27.98, -82.47, 'closed', 60, 0,
        { child_friendly: true, wheelchair_accessible: true },
        { food: 'unavailable', water: 'unavailable', medication: 'unavailable', clothes: 'unavailable' }, 130),
      shelter(7, 'Palm Heights Rec Center', '900 Palm Ave, Example City', 27.925, -82.49, 'open', 120, 18,
        { child_friendly: true, pets_allowed: true }, { water: 'limited', clothes: 'limited' }, 150),
    ],
    organizations: [
      org(1, 'Example County EOC Depot', 'government', ['distribution', 'logistics'], 'active', '4000 Depot Rd, Example City', 27.99, -82.53,
        { name: 'Logistics desk', phone: '+1-555-0101', email: 'depot@county.example' }, 40, 'Main county staging area. 3 box trucks.', 35),
      org(2, 'Bayside Food Bank', 'nonprofit', ['distribution', 'food'], 'active', '55 Port Ave, Example City', 27.94, -82.43,
        { name: 'Dana Ruiz', phone: '+1-555-0102', email: 'ops@bayside.example' }, 15, 'Refrigerated truck available.', 20),
      org(3, 'Harbor Relief Alliance', 'nonprofit', ['distribution', 'shelter_support'], 'active', '12 Wharf St, Example City', 27.965, -82.4,
        { name: 'Sam Okafor', phone: '+1-555-0103', email: 'sam@harborrelief.example' }, 20, '', 55),
      org(4, 'MedServe Mobile Clinic', 'medical', ['medical'], 'active', '230 Clinic Way, Example City', 27.955, -82.48,
        { name: 'Dr. Lee Chen', phone: '+1-555-0104', email: 'dispatch@medserve.example' }, 12, 'Cold chain for insulin. 2 mobile units.', 15),
      org(5, 'Suncoast Transit Volunteers', 'nonprofit', ['transport'], 'active', '77 Depot St, Example City', 27.95, -82.465,
        { name: 'Ari Patel', phone: '+1-555-0105', email: 'rides@suncoast.example' }, 25, '4 vans, 1 wheelchair-accessible van until 8pm.', 60),
      org(6, 'Northside Supply Co.', 'private', ['distribution', 'logistics'], 'limited', '1500 Industrial Pkwy, Example City', 28.03, -82.46,
        { name: 'Warehouse office', phone: '+1-555-0106', email: 'orders@northside.example' }, 30, 'Generators and fuel only. Low staff.', 90),
      org(7, 'Faith Kitchen Collective', 'faith', ['food', 'shelter_support'], 'active', '18 Chapel St, Example City', 27.92, -82.5,
        { name: 'Pastor Jordan Hayes', phone: '+1-555-0107', email: 'kitchen@faithcollective.example' }, 10, 'Hot meals 11am–7pm.', 45),
    ],
    inventory: [
      ...inv('org_001', [['water_bottled', 1450, 50], ['water_gallon', 900], ['food_mre', 2200], ['cots', 180], ['blankets', 600], ['first_aid', 120], ['generator', 6], ['hygiene_kit', 300]]),
      ...inv('org_002', [['food_mre', 600, 100], ['food_canned', 340], ['water_bottled', 220], ['baby_formula', 48]]),
      ...inv('org_003', [['hygiene_kit', 420], ['clothing', 260], ['blankets', 310], ['diapers', 150]]),
      ...inv('org_004', [['insulin', 34], ['rx_refills', 180], ['first_aid', 60], ['oxygen', 8]]),
      ...inv('org_006', [['generator', 9], ['fuel', 1200], ['cots', 40]]),
      ...inv('org_007', [['food_mre', 350], ['water_gallon', 120]]),
    ],
    needs: [
      need(1, 'shelter', 'shelter_001', 'insulin', 20, 10, 'high', 'Three insulin-dependent residents.', 150, 120),
      need(2, 'shelter', 'shelter_003', 'food_mre', 150, 0, 'high', 'One day of meals left for 36 people.', 75, 180),
      need(3, 'shelter', 'shelter_004', 'water_bottled', 40, 0, 'critical', 'Over capacity, turning families away.', 50, 60),
      need(4, 'shelter', 'shelter_002', 'water_bottled', 80, 0, 'high', '', 110, 240),
      need(5, 'shelter', 'shelter_005', 'rx_refills', 100, 0, 'critical', 'No pharmacist on site. Many evacuees left meds behind.', 35, 90),
      need(6, 'shelter', 'shelter_002', 'cots', 60, 0, 'medium', 'Overflow sleeping in gym bleachers.', 200, null),
      need(7, 'shelter', 'shelter_001', 'baby_formula', 24, 0, 'medium', 'Two infants (family report).', 20, 300),
      need(8, 'organization', 'org_007', 'fuel', 50, 0, 'medium', 'Propane/fuel for cooking.', 95, 360),
      need(9, 'shelter', 'shelter_007', 'water_bottled', 30, 0, 'high', '', 140, 180),
    ],
    shipments: [
      {
        id: 'shipment_001', disaster_id: D, from: { kind: 'organization', id: 'org_001' }, to: { kind: 'shelter', id: 'shelter_002' },
        items: [{ resource_type_id: 'water_bottled', quantity: 50 }], need_ids: ['need_004'], priority: 'high', status: 'in_transit',
        eta: ago(10), notes: 'Truck 2', created_at: ago(70), updated_at: ago(40),
        status_history: [{ status: 'approved', at: ago(70) }, { status: 'in_transit', at: ago(40) }],
      },
      {
        id: 'shipment_002', disaster_id: D, from: { kind: 'organization', id: 'org_002' }, to: { kind: 'shelter', id: 'shelter_003' },
        items: [{ resource_type_id: 'food_mre', quantity: 100 }], need_ids: ['need_002'], priority: 'high', status: 'approved',
        eta: fromNow(45), notes: 'Use the Harbor Blvd loading dock.', created_at: ago(25), updated_at: ago(25),
        status_history: [{ status: 'approved', at: ago(25) }],
      },
      {
        id: 'shipment_003', disaster_id: D, from: { kind: 'organization', id: 'org_004' }, to: { kind: 'shelter', id: 'shelter_001' },
        items: [{ resource_type_id: 'insulin', quantity: 10 }], need_ids: ['need_001'], priority: 'high', status: 'delivered',
        eta: ago(70), notes: 'Cold chain', created_at: ago(140), updated_at: ago(65),
        status_history: [{ status: 'approved', at: ago(140) }, { status: 'in_transit', at: ago(100) }, { status: 'delivered', at: ago(65) }],
      },
      {
        id: 'shipment_004', disaster_id: D, from: { kind: 'organization', id: 'org_006' }, to: { kind: 'shelter', id: 'shelter_002' },
        items: [{ resource_type_id: 'generator', quantity: 2 }, { resource_type_id: 'fuel', quantity: 100 }], need_ids: [], priority: 'medium', status: 'requested',
        eta: fromNow(120), notes: 'Offered by Northside — needs approval.', created_at: ago(15), updated_at: ago(15),
        status_history: [{ status: 'requested', at: ago(15) }],
      },
    ],
    updates: [
      update(3, 'Boil water notice: north county', 'Residents north of Fowler Ave should boil tap water for 1 minute before drinking until further notice.', 'warning', 55,
        { type: 'radius', center: { latitude: 28.0, longitude: -82.45 }, radius_km: 5, label: '5 km around Northgate' }),
      update(2, 'Riverside Library closed', 'Flooding on River St. Riverside Library is closed until further notice.', 'warning', 120),
      update(1, 'Shelters open', 'Central Community Center is open. Check your plan before traveling.', 'info', 180),
    ],
    reports: [
      { id: 'report_005', family_id: 'family_031', type: 'need_help', message: 'Water rising in our street, two kids and a dog. No car.', location: { latitude: 27.972, longitude: -82.462 }, status: 'received', created_at: ago(9) },
      { id: 'report_004', family_id: 'family_014', type: 'need_help', message: 'Elderly parent on oxygen, power is out. Need transport.', location: { latitude: 27.942, longitude: -82.49 }, status: 'received', created_at: ago(27) },
      { id: 'report_003', family_id: 'family_009', type: 'resource_request', message: 'Out of baby formula, 2 infants.', location: { latitude: 27.99, longitude: -82.42 }, status: 'received', created_at: ago(22) },
      { id: 'report_002', family_id: 'family_001', type: 'need_help', message: 'We need transportation to a shelter.', location: { latitude: 27.9506, longitude: -82.4572 }, status: 'received', created_at: ago(41) },
      { id: 'report_001', family_id: 'family_005', type: 'status_update', message: 'Arrived safely at Westside High School Gym.', location: null, status: 'received', created_at: ago(95) },
    ],
    conversations: [
      { id: 'conv_001', disaster_id: D, participant: { kind: 'shelter', id: 'shelter_003' }, subject: 'Food running low', created_at: ago(80), read_at: ago(24) },
      { id: 'conv_002', disaster_id: D, participant: { kind: 'shelter', id: 'shelter_004' }, subject: 'At capacity', created_at: ago(52), read_at: null },
      { id: 'conv_003', disaster_id: D, participant: { kind: 'organization', id: 'org_005' }, subject: 'Transport availability', created_at: ago(65), read_at: ago(60) },
      { id: 'conv_004', disaster_id: D, participant: { kind: 'organization', id: 'org_006' }, subject: 'Generator offer', created_at: ago(16), read_at: null },
    ],
    messages: [
      { id: 'msg_001', conversation_id: 'conv_001', sender: { kind: 'shelter', id: 'shelter_003' }, body: "We're down to one day of meals for 36 people.", created_at: ago(80) },
      { id: 'msg_002', conversation_id: 'conv_001', sender: OPERATOR_ACTOR, body: 'Bayside Food Bank is sending 100 meals, ETA 45 min.', created_at: ago(25) },
      { id: 'msg_003', conversation_id: 'conv_001', sender: { kind: 'shelter', id: 'shelter_003' }, body: 'Thank you. Can they also bring water?', created_at: ago(19) },
      { id: 'msg_004', conversation_id: 'conv_002', sender: { kind: 'shelter', id: 'shelter_004' }, body: "We're full and sending families on to Eastbay. Out of drinking water — need it urgently.", created_at: ago(52) },
      { id: 'msg_005', conversation_id: 'conv_003', sender: { kind: 'organization', id: 'org_005' }, body: 'We have 4 vans and 1 wheelchair-accessible van available until 8pm. Send pickup addresses here.', created_at: ago(65) },
      { id: 'msg_006', conversation_id: 'conv_004', sender: { kind: 'organization', id: 'org_006' }, body: 'We can deliver 2 generators + 100 gal fuel to Westside within 2 hours. Logged as a shipment request.', created_at: ago(16) },
    ],
    activity: [],
  }

  const act = (type, summary, ref, createdAgo, actor = { kind: 'system', id: 'system', name: 'System' }) =>
    db.activity.push({ id: uid('act'), disaster_id: D, type, summary, ref, actor, created_at: ago(createdAgo) })
  act('update_published', 'Broadcast "Shelters open" sent to all families', { kind: 'update', id: 'update_001' }, 180, OPERATOR_ACTOR)
  act('shipment_created', 'Shipment from MedServe Mobile Clinic to Central Community Center created', { kind: 'shipment', id: 'shipment_003' }, 140, OPERATOR_ACTOR)
  act('shelter_updated', 'Riverside Library marked closed', { kind: 'shelter', id: 'shelter_006' }, 130, OPERATOR_ACTOR)
  act('update_published', 'Broadcast "Riverside Library closed" sent to all families', { kind: 'update', id: 'update_002' }, 120, OPERATOR_ACTOR)
  act('shipment_status', 'Insulin delivered to Central Community Center', { kind: 'shipment', id: 'shipment_003' }, 65, OPERATOR_ACTOR)
  act('update_published', 'Broadcast "Boil water notice: north county" sent', { kind: 'update', id: 'update_003' }, 55, OPERATOR_ACTOR)
  act('message_received', 'Northgate Church Hall: "We\'re full and sending families on…"', { kind: 'conversation', id: 'conv_002' }, 52)
  act('need_created', 'Critical need: 40 cases bottled water for Northgate Church Hall', { kind: 'need', id: 'need_003' }, 50, OPERATOR_ACTOR)
  act('report_received', 'Help request from family_001', { kind: 'report', id: 'report_002' }, 41)
  act('shipment_status', 'Water shipment to Westside High School Gym in transit', { kind: 'shipment', id: 'shipment_001' }, 40, OPERATOR_ACTOR)
  act('need_created', 'Critical need: 100 prescription refills for Eastbay Fairgrounds', { kind: 'need', id: 'need_005' }, 35, OPERATOR_ACTOR)
  act('report_received', 'Help request from family_014', { kind: 'report', id: 'report_004' }, 27)
  act('shipment_created', 'Meals from Bayside Food Bank to St. Luke Medical Annex approved', { kind: 'shipment', id: 'shipment_002' }, 25, OPERATOR_ACTOR)
  act('report_received', 'Resource request from family_009', { kind: 'report', id: 'report_003' }, 22)
  act('message_received', 'St. Luke Medical Annex: "Thank you. Can they also bring water?"', { kind: 'conversation', id: 'conv_001' }, 19)
  act('shipment_created', 'Northside Supply Co. offered generators + fuel for Westside', { kind: 'shipment', id: 'shipment_004' }, 15)
  act('report_received', 'Help request from family_031', { kind: 'report', id: 'report_005' }, 9)
  return db
}

// ---------- persistence ----------
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* fall through */
  }
  const fresh = seed()
  save(fresh)
  return fresh
}
function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* page-lifetime only */
  }
}
let db = load()
export function resetMockData() {
  db = seed()
  save(db)
}

// ---------- helpers ----------
function merge(target, patch) {
  const out = { ...target }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' ? merge(target[k], v) : v
  }
  return out
}
const notFound = (what) => new ApiError(404, `${what}_not_found`, `${what[0].toUpperCase()}${what.slice(1)} not found.`)
const bad = (msg) => new ApiError(400, 'invalid_request', msg)

function nameOf(kind, id) {
  if (kind === 'shelter') return db.shelters.find((s) => s.id === id)?.name ?? id
  if (kind === 'organization') return db.organizations.find((o) => o.id === id)?.name ?? id
  if (kind === 'family') return `Family ${id.replace('family_', '#')}`
  if (kind === 'operator') return 'Operator'
  return id
}
const named = (ref) => ref && { ...ref, name: nameOf(ref.kind, ref.id) }
const rtName = (id) => RESOURCE_TYPES.find((r) => r.id === id)?.name ?? id

function log(type, summary, ref, actor = OPERATOR_ACTOR) {
  db.activity.push({ id: uid('act'), disaster_id: D, type, summary, ref, actor, created_at: now() })
}

function invRow(holderId, rt, create = false) {
  let row = db.inventory.find((r) => r.holder.id === holderId && r.resource_type_id === rt)
  if (!row && create) {
    row = { holder: { kind: 'organization', id: holderId }, resource_type_id: rt, quantity: 0, reserved: 0, updated_at: now() }
    db.inventory.push(row)
  }
  return row
}

function reserve(shipment) {
  for (const it of shipment.items) {
    const row = invRow(shipment.from.id, it.resource_type_id)
    const avail = row ? row.quantity - row.reserved : 0
    if (avail < it.quantity) {
      throw new ApiError(409, 'insufficient_inventory', `${nameOf('organization', shipment.from.id)} has only ${avail} ${rtName(it.resource_type_id)} available.`)
    }
  }
  for (const it of shipment.items) {
    const row = invRow(shipment.from.id, it.resource_type_id)
    row.reserved += it.quantity
    row.updated_at = now()
  }
}

const TRANSITIONS = {
  requested: ['approved', 'cancelled'],
  approved: ['in_transit', 'cancelled'],
  in_transit: ['delivered'],
  delivered: [],
  cancelled: [],
}

function viewUpdate(u) {
  const t = Date.now()
  let status = u.status
  let published_at = u.published_at
  if (status === 'scheduled' && new Date(u.scheduled_for).getTime() <= t) {
    status = 'published'
    published_at = u.scheduled_for
  }
  if (status === 'published' && u.expires_at && new Date(u.expires_at).getTime() <= t) status = 'expired'
  const mins = published_at ? (t - new Date(published_at).getTime()) / 60_000 : 0
  const read_count = status === 'scheduled' ? 0 : Math.round(u.recipient_count * 0.9 * (1 - Math.exp(-Math.max(0, mins) / 22)))
  return { ...clone(u), status, published_at, read_count }
}

function viewConversation(c) {
  const msgs = db.messages.filter((m) => m.conversation_id === c.id)
  const last = msgs.at(-1)
  const unread = msgs.filter((m) => m.sender.kind !== 'operator' && (!c.read_at || m.created_at > c.read_at)).length
  return {
    id: c.id, disaster_id: c.disaster_id, participant: named(c.participant), subject: c.subject, created_at: c.created_at,
    last_message_at: last?.created_at ?? c.created_at, last_message_preview: last?.body ?? '', unread_count: unread,
  }
}

const CANNED = {
  shelter: [
    'Received, thank you. Will confirm when it arrives.',
    "Copy. We'll have volunteers at the loading door.",
    'Understood. Current headcount updated on our end.',
    'Thanks — please keep us posted on the ETA.',
  ],
  organization: [
    'Acknowledged. Dispatching a team now.',
    "Got it. We'll confirm pickup within 15 minutes.",
    'Confirmed. Driver details to follow.',
    'Received — checking stock and will reply shortly.',
  ],
}

function scheduleReply(conv) {
  if (!['shelter', 'organization'].includes(conv.participant.kind)) return
  setTimeout(() => {
    const lines = CANNED[conv.participant.kind]
    const body = lines[Math.floor(Math.random() * lines.length)]
    db.messages.push({ id: uid('msg'), conversation_id: conv.id, sender: { ...conv.participant }, body, created_at: now() })
    log('message_received', `${nameOf(conv.participant.kind, conv.participant.id)}: "${body.slice(0, 40)}…"`, { kind: 'conversation', id: conv.id }, { kind: 'system', id: 'system', name: 'System' })
    save(db)
  }, 3500 + Math.random() * 3000)
}

// ---------- API ----------
export const mockApi = {
  async login(email, password) {
    await wait()
    if (!email || !password) throw bad('Enter an email and password.')
    return { access_token: 'mock-token', token_type: 'Bearer', expires_at: new Date(Date.now() + 864e5).toISOString(), user: OPERATOR }
  },
  async logout() { await wait(30); return null },
  async me() { await wait(30); return OPERATOR },

  async listDisasters() { await wait(); return clone(db.disasters) },

  // Shelters (Part 1)
  async listShelters(disasterId) {
    await wait()
    return clone(db.shelters.filter((s) => !disasterId || s.disaster_id === disasterId))
  },
  async createShelter(body) {
    await wait()
    const created = { ...clone(body), id: uid('shelter'), updated_at: now() }
    db.shelters.push(created)
    log('shelter_created', `Relief location "${created.name}" added`, { kind: 'shelter', id: created.id })
    save(db)
    return clone(created)
  },
  async updateShelter(id, patch) {
    await wait()
    const i = db.shelters.findIndex((s) => s.id === id)
    if (i < 0) throw notFound('shelter')
    const before = db.shelters[i]
    db.shelters[i] = { ...merge(before, patch), updated_at: now() }
    const after = db.shelters[i]
    const detail = before.status !== after.status ? `marked ${after.status}` : 'updated'
    log('shelter_updated', `${after.name} ${detail}`, { kind: 'shelter', id })
    save(db)
    return clone(after)
  },

  // Updates / broadcasts (Part 1 §5 + Part 2 §6)
  async listUpdates(disasterId) {
    await wait()
    return db.updates.filter((u) => u.disaster_id === disasterId).map(viewUpdate)
  },
  async previewUpdate(disasterId, { target, audience }) {
    await wait(60)
    return { recipient_count: countRecipients(disasterId, target, audience) }
  },
  async publishUpdate(disasterId, body) {
    await wait()
    if (!body.title?.trim() || !body.message?.trim()) throw bad('Title and message are required.')
    const target = body.target || { type: 'all' }
    const audience = body.audience || { needs: [] }
    const scheduled = body.scheduled_for && new Date(body.scheduled_for) > new Date()
    const created = {
      id: uid('update'), disaster_id: disasterId, title: body.title, message: body.message, severity: body.severity || 'info',
      target, audience, status: scheduled ? 'scheduled' : 'published', published_at: scheduled ? null : now(),
      scheduled_for: scheduled ? body.scheduled_for : null, expires_at: body.expires_at || null,
      recipient_count: countRecipients(disasterId, target, audience),
    }
    db.updates.unshift(created)
    const where = target.type === 'radius' ? (target.label || `${target.radius_km} km area`) : 'all families'
    log('update_published', `${scheduled ? 'Scheduled' : 'Sent'} ${created.severity} broadcast "${created.title}" to ${where} (${created.recipient_count})`, { kind: 'update', id: created.id })
    save(db)
    return viewUpdate(created)
  },
  async retractUpdate(id) {
    await wait()
    const u = db.updates.find((x) => x.id === id)
    if (!u) throw notFound('update')
    u.status = 'retracted'
    log('update_retracted', `Broadcast "${u.title}" retracted`, { kind: 'update', id })
    save(db)
    return viewUpdate(u)
  },

  // Reports (Part 1 §6)
  async listReports(disasterId) {
    await wait()
    return disasterId === D ? clone(db.reports) : []
  },

  // Part 2
  async listResourceTypes() { await wait(30); return clone(RESOURCE_TYPES) },

  async listOrganizations(disasterId) {
    await wait()
    return clone(db.organizations.filter((o) => o.disaster_id === disasterId))
  },
  async createOrganization(body) {
    await wait()
    if (!body.name?.trim()) throw bad('Name is required.')
    const created = { ...clone(body), id: uid('org'), updated_at: now() }
    db.organizations.push(created)
    log('org_created', `Organization "${created.name}" added`, { kind: 'organization', id: created.id })
    save(db)
    return clone(created)
  },
  async updateOrganization(id, patch) {
    await wait()
    const i = db.organizations.findIndex((o) => o.id === id)
    if (i < 0) throw notFound('organization')
    db.organizations[i] = { ...merge(db.organizations[i], patch), updated_at: now() }
    log('org_updated', `${db.organizations[i].name} updated${patch.status ? ` (now ${patch.status})` : ''}`, { kind: 'organization', id })
    save(db)
    return clone(db.organizations[i])
  },

  async listInventory(disasterId) {
    await wait()
    const orgIds = new Set(db.organizations.filter((o) => o.disaster_id === disasterId).map((o) => o.id))
    return db.inventory.filter((r) => orgIds.has(r.holder.id)).map((r) => ({ ...clone(r), holder: named(r.holder) }))
  },
  async setInventory(orgId, items) {
    await wait()
    if (!db.organizations.some((o) => o.id === orgId)) throw notFound('organization')
    for (const it of items) {
      const row = invRow(orgId, it.resource_type_id)
      if (row && it.quantity < row.reserved) {
        throw new ApiError(409, 'inventory_conflict', `${rtName(it.resource_type_id)}: ${row.reserved} are reserved for shipments.`)
      }
    }
    for (const it of items) {
      const row = invRow(orgId, it.resource_type_id, true)
      row.quantity = Math.max(0, Math.round(it.quantity))
      row.updated_at = now()
    }
    log('inventory_updated', `${nameOf('organization', orgId)} inventory updated (${items.length} item${items.length === 1 ? '' : 's'})`, { kind: 'organization', id: orgId })
    save(db)
    return db.inventory.filter((r) => r.holder.id === orgId).map((r) => ({ ...clone(r), holder: named(r.holder) }))
  },

  async listNeeds(disasterId) {
    await wait()
    return db.needs.filter((n) => n.disaster_id === disasterId).map((n) => ({ ...clone(n), requester: named(n.requester) }))
  },
  async createNeed(body) {
    await wait()
    if (!body.requester?.id || !body.resource_type_id || !(body.quantity_needed > 0)) throw bad('Requester, resource and a positive quantity are required.')
    const created = {
      id: uid('need'), disaster_id: body.disaster_id, requester: { kind: body.requester.kind, id: body.requester.id },
      resource_type_id: body.resource_type_id, quantity_needed: body.quantity_needed, quantity_fulfilled: 0,
      priority: body.priority || 'medium', status: 'open', needed_by: body.needed_by || null, notes: body.notes || '',
      created_at: now(), updated_at: now(),
    }
    db.needs.push(created)
    log('need_created', `${created.priority[0].toUpperCase() + created.priority.slice(1)} need: ${created.quantity_needed} ${rtName(created.resource_type_id)} for ${nameOf(created.requester.kind, created.requester.id)}`, { kind: 'need', id: created.id })
    save(db)
    return { ...clone(created), requester: named(created.requester) }
  },
  async updateNeed(id, patch) {
    await wait()
    const n = db.needs.find((x) => x.id === id)
    if (!n) throw notFound('need')
    Object.assign(n, patch, { updated_at: now() })
    if (patch.status === undefined && n.status === 'open' && n.quantity_fulfilled >= n.quantity_needed) n.status = 'fulfilled'
    log('need_updated', `Need for ${rtName(n.resource_type_id)} at ${nameOf(n.requester.kind, n.requester.id)} ${patch.status ? `marked ${patch.status}` : 'updated'}`, { kind: 'need', id })
    save(db)
    return { ...clone(n), requester: named(n.requester) }
  },

  async listShipments(disasterId) {
    await wait()
    return db.shipments.filter((s) => s.disaster_id === disasterId).map((s) => ({ ...clone(s), from: named(s.from), to: named(s.to) }))
  },
  async createShipment(body) {
    await wait()
    if (body.from?.kind !== 'organization') throw bad('Shipments must come from an organization.')
    if (body.from.id === body.to?.id) throw bad('Source and destination must differ.')
    const items = (body.items || []).filter((i) => i.quantity > 0)
    if (!items.length) throw bad('Add at least one item.')
    const s = {
      id: uid('shipment'), disaster_id: body.disaster_id, from: { kind: 'organization', id: body.from.id }, to: { kind: body.to.kind, id: body.to.id },
      items, need_ids: body.need_ids || [], priority: body.priority || 'medium', status: 'approved', eta: body.eta || null,
      notes: body.notes || '', created_at: now(), updated_at: now(), status_history: [{ status: 'approved', at: now() }],
    }
    reserve(s)
    db.shipments.push(s)
    log('shipment_created', `Shipment ${items.map((i) => `${i.quantity} ${rtName(i.resource_type_id)}`).join(', ')} from ${nameOf('organization', s.from.id)} to ${nameOf(s.to.kind, s.to.id)}`, { kind: 'shipment', id: s.id })
    save(db)
    return { ...clone(s), from: named(s.from), to: named(s.to) }
  },
  async updateShipment(id, patch) {
    await wait()
    const s = db.shipments.find((x) => x.id === id)
    if (!s) throw notFound('shipment')
    if (patch.status && patch.status !== s.status) {
      if (!TRANSITIONS[s.status].includes(patch.status)) throw new ApiError(409, 'invalid_transition', `Can't move a ${s.status} shipment to ${patch.status}.`)
      const to = patch.status
      if (to === 'approved') reserve(s)
      for (const it of s.items) {
        const row = invRow(s.from.id, it.resource_type_id, true)
        if (to === 'in_transit') { row.quantity -= it.quantity; row.reserved -= it.quantity }
        if (to === 'cancelled' && s.status === 'approved') row.reserved -= it.quantity
        row.updated_at = now()
      }
      if (to === 'delivered') {
        for (const it of s.items) {
          if (s.to.kind === 'organization') invRow(s.to.id, it.resource_type_id, true).quantity += it.quantity
          let left = it.quantity
          for (const n of db.needs.filter((x) => s.need_ids.includes(x.id) && x.resource_type_id === it.resource_type_id)) {
            const add = Math.min(left, Math.max(0, n.quantity_needed - n.quantity_fulfilled))
            n.quantity_fulfilled += add
            left -= add
            if (n.quantity_fulfilled >= n.quantity_needed && n.status === 'open') n.status = 'fulfilled'
            n.updated_at = now()
          }
        }
      }
      s.status = to
      s.status_history.push({ status: to, at: now() })
      const label = { approved: 'approved', in_transit: 'in transit', delivered: 'delivered', cancelled: 'cancelled' }[to]
      log('shipment_status', `Shipment to ${nameOf(s.to.kind, s.to.id)} ${label}`, { kind: 'shipment', id })
    }
    if (patch.eta !== undefined) s.eta = patch.eta
    if (patch.notes !== undefined) s.notes = patch.notes
    s.updated_at = now()
    save(db)
    return { ...clone(s), from: named(s.from), to: named(s.to) }
  },

  async listConversations(disasterId) {
    await wait()
    return db.conversations.filter((c) => c.disaster_id === disasterId).map(viewConversation)
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
  },
  async createConversation(body) {
    await wait()
    if (!body.participant?.id || !body.message?.trim()) throw bad('Recipient and message are required.')
    const c = { id: uid('conv'), disaster_id: body.disaster_id, participant: { kind: body.participant.kind, id: body.participant.id }, subject: body.subject || '(no subject)', created_at: now(), read_at: now() }
    db.conversations.push(c)
    db.messages.push({ id: uid('msg'), conversation_id: c.id, sender: OPERATOR_ACTOR, body: body.message, created_at: now() })
    save(db)
    scheduleReply(c)
    return viewConversation(c)
  },
  async listMessages(conversationId) {
    await wait(60)
    if (!db.conversations.some((c) => c.id === conversationId)) throw notFound('conversation')
    return db.messages.filter((m) => m.conversation_id === conversationId).map((m) => ({ ...clone(m), sender: named(m.sender) }))
  },
  async sendMessage(conversationId, body) {
    await wait(80)
    const c = db.conversations.find((x) => x.id === conversationId)
    if (!c) throw notFound('conversation')
    if (!body?.trim()) throw bad('Message is empty.')
    const m = { id: uid('msg'), conversation_id: c.id, sender: OPERATOR_ACTOR, body, created_at: now() }
    db.messages.push(m)
    c.read_at = now()
    save(db)
    scheduleReply(c)
    return { ...clone(m), sender: named(m.sender) }
  },
  async markConversationRead(conversationId) {
    await wait(30)
    const c = db.conversations.find((x) => x.id === conversationId)
    if (c) { c.read_at = now(); save(db) }
    return null
  },

  async listActivity(disasterId) {
    await wait()
    return db.activity.filter((a) => a.disaster_id === disasterId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 60).map(clone)
  },
}
