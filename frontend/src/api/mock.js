// In-browser mock of the Haven API (Part 1 + Part 2 contracts) so the dashboard
// works before the backend routes exist. Same method names and shapes as
// liveApi, including the side effects Part 2 describes. State persists in
// localStorage; resetMockData() starts over. All data here is fictional.

import { ApiError } from './live.js'

const KEY = 'haven-mock-db-v3'
const D = 'disaster_001'
const now = () => new Date().toISOString()
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString()
const fromNow = (m) => new Date(Date.now() + m * 60_000).toISOString()
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
    // Portal logins for shelters / organizations (credentials live in the mock server, not here).
    partner_accounts: [
      { id: 'user_partner_bayside', email: 'bayside@demo.example', contact_name: 'Dana Ruiz', site: { kind: 'organization', id: 'org_002' }, status: 'active', created_at: ago(400), last_login_at: null },
      { id: 'user_partner_stluke', email: 'stluke@demo.example', contact_name: 'Charge nurse on duty', site: { kind: 'shelter', id: 'shelter_003' }, status: 'active', created_at: ago(380), last_login_at: null },
    ],
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
  return migrate(db)
}

// ---------- citizen assistance (Part 2 §11) ----------
// Requests from households who can't get to an aid location. All people,
// names, phone numbers and addresses here are synthetic.
const CITIZEN_APPROVED = { org_001: true, org_002: true, org_003: true, org_004: true, org_005: true, org_007: true }
const FIRST = ['Maria', 'James', 'Aisha', 'Tom', 'Linh', 'Carlos', 'Grace', 'Omar', 'Priya', 'Daniel', 'Rosa', 'Kevin', 'Mei', 'Andre', 'Fatima', 'Luis', 'Hannah', 'Samuel', 'Yara', 'Ethan']
const LAST = ['Alvarez', 'Brooks', 'Chen', 'Diaz', 'Evans', 'Foster', 'Garcia', 'Hughes', 'Ibrahim', 'Jensen', 'Kim', 'Lopez', 'Morgan', 'Nguyen', 'Okafor', 'Patel', 'Reyes', 'Singh', 'Torres', 'Walker']
const STREETS = ['Bayview Dr', 'Palmetto St', 'Cypress Ave', 'Harbor Ln', 'Magnolia Ct', 'Sunset Blvd', 'Oak Hollow Rd', 'Gulf Breeze Way', 'Mangrove Pl', 'Pelican St']
const SCENARIOS = [
  { kind: 'delivery', priority: 'high', items: [['water_bottled', 2], ['food_mre', 12]], message: "Street is flooded and we can't drive out. Need drinking water and food for the family.", hh: { children: 2 } },
  { kind: 'medical', priority: 'critical', items: [['insulin', 2]], message: "Insulin is running out and the fridge has no power. Can't get to a clinic.", hh: { immediate_medication: true, medical_notes: 'Type 1 diabetic adult; needs refrigerated insulin.' } },
  { kind: 'transport', priority: 'high', items: [], message: 'Need wheelchair-accessible transport to a shelter. Regular vans cannot take the chair.', hh: { accessibility_notes: 'Power wheelchair user.' } },
  { kind: 'medical', priority: 'critical', items: [['oxygen', 1]], message: 'Oxygen concentrator needs power. Backup tank is low.', hh: { immediate_medication: true, medical_notes: 'COPD, on home oxygen 24/7.', adults: 2 } },
  { kind: 'delivery', priority: 'high', items: [['baby_formula', 4], ['diapers', 2]], message: 'Two infants at home and we are out of formula. Bridge to the store is closed.', hh: { children: 2 } },
  { kind: 'welfare_check', priority: 'high', items: [], message: "My elderly mother lives alone and hasn't answered her phone since last night. I'm out of state.", hh: { adults: 1, accessibility_notes: 'Uses a walker; hard of hearing.' } },
  { kind: 'transport', priority: 'high', items: [], message: 'No car and three kids. Need a ride to the shelter in our plan.', hh: { children: 3 } },
  { kind: 'delivery', priority: 'medium', items: [['rx_refills', 1]], message: 'Left blood pressure medication behind when we evacuated to a relative.', hh: { immediate_medication: true, medical_notes: 'Hypertension; daily medication.' } },
  { kind: 'delivery', priority: 'medium', items: [['blankets', 4], ['hygiene_kit', 2]], message: 'Roof damage, house is cold and wet. Need blankets and hygiene kits.', hh: {} },
  { kind: 'transport', priority: 'medium', items: [], message: "We can't take our two dogs on the evacuation bus. Need a pet-friendly ride.", hh: { pets: true } },
  { kind: 'delivery', priority: 'high', items: [['food_canned', 1], ['water_gallon', 4]], message: "Elderly couple, no food left. Can't stand in line at the distribution point.", hh: { adults: 2, accessibility_notes: 'Both over 80; one uses a cane.' } },
  { kind: 'other', priority: 'low', items: [['clothing', 2]], message: 'Lost most of our clothes in the flooding. Kids need dry clothes for school shelter.', hh: { children: 2 } },
]

function seedAssistance(state) {
  const r = rng(7)
  const out = []
  const make = (k, fam, sc, extra = {}) => {
    const first = FIRST[Math.floor(r() * FIRST.length)]
    const last = LAST[Math.floor(r() * LAST.length)]
    const hh = sc.hh
    const adults = hh.adults ?? 1 + Math.floor(r() * 2)
    const children = hh.children ?? (fam.flags.children ? 1 + Math.floor(r() * 2) : 0)
    const createdAgo = extra.createdAgo ?? 4 + ((k * 17) % 200)
    out.push({
      id: `assist_${String(k + 1).padStart(3, '0')}`, disaster_id: D, family_id: fam.id, source_report_id: extra.report || null,
      kind: sc.kind, priority: sc.priority, status: 'open', message: extra.message || sc.message,
      items: sc.items.map(([resource_type_id, quantity]) => ({ resource_type_id, quantity })), cannot_travel: true,
      location: { latitude: +fam.location.latitude.toFixed(5), longitude: +fam.location.longitude.toFixed(5) },
      address: `${100 + Math.floor(r() * 8800)} ${STREETS[Math.floor(r() * STREETS.length)]}, Example City`,
      contact: { name: `${first} ${last}`, phone: `+1-555-01${String(10 + Math.floor(r() * 89))}` },
      household: {
        adults, children, pets: hh.pets ?? fam.flags.pets, immediate_medication: hh.immediate_medication ?? false,
        medical_notes: hh.medical_notes || null, accessibility_notes: hh.accessibility_notes || null, other_special_care: null, has_car: false,
      },
      consent_to_share: extra.consent ?? k % 7 !== 3,
      assigned_to: null, eta: null, partner_note: null, resolution_note: null, operator_notes: '',
      history: [{ status: 'open', at: ago(createdAgo), by: { kind: 'family', id: fam.id, name: 'Household' } }],
      created_at: ago(createdAgo), updated_at: ago(createdAgo),
    })
  }
  // Two requests continue seeded family reports, at the same locations.
  const fromReport = (id) => state.reports.find((x) => x.id === id)
  const r5 = fromReport('report_005')
  const r4 = fromReport('report_004')
  if (r5) make(0, { id: r5.family_id, location: r5.location, flags: { children: true, pets: true } }, { kind: 'transport', priority: 'critical', items: [], hh: { children: 2, pets: true } }, { report: r5.id, message: r5.message, createdAgo: 9, consent: true })
  if (r4) make(1, { id: r4.family_id, location: r4.location, flags: {} }, SCENARIOS[3], { report: r4.id, message: r4.message, createdAgo: 27, consent: true })
  for (let k = 2; k < 30; k++) make(k, FAMILIES[(k * 157) % FAMILIES.length], SCENARIOS[k % SCENARIOS.length])

  // A few already in progress, so the demo shows every state.
  const assign = (id, orgId, status, minsAgo, note) => {
    const a = out.find((x) => x.id === id)
    if (!a || !a.consent_to_share) return
    const by = { kind: 'organization', id: orgId, name: state.organizations.find((o) => o.id === orgId)?.name || orgId }
    a.assigned_to = { kind: 'organization', id: orgId }
    a.status = status
    a.eta = status === 'completed' ? null : fromNow(25)
    a.partner_note = note
    a.history.push({ status: 'claimed', at: ago(minsAgo), by })
    if (status !== 'claimed') a.history.push({ status, at: ago(Math.max(1, minsAgo - 10)), by })
    if (status === 'completed') a.resolution_note = 'Delivered and checked on the family. All OK.'
    a.updated_at = ago(Math.max(1, minsAgo - 10))
  }
  assign('assist_007', 'org_005', 'claimed', 30, 'A volunteer van will pick you up. Please be ready with documents and medication.')
  assign('assist_009', 'org_002', 'en_route', 40, 'Bringing water and meals now.')
  assign('assist_015', 'org_007', 'completed', 120, 'Hot meals and water on the way.')
  assign('assist_016', 'org_004', 'claimed', 18, 'Our nurse will call you before arriving.')
  return out
}


// ---------- persistence ----------
// Browser: localStorage. Mock server: a JSON file (see mock-server/handler.js).
let storage = {
  load: () => JSON.parse(localStorage.getItem(KEY)),
  save: (state) => localStorage.setItem(KEY, JSON.stringify(state)),
}
let latency = 1

function migrate(state) {
  state.partner_accounts ||= []
  for (const c of state.conversations) if (!('partner_read_at' in c)) c.partner_read_at = null
  for (const o of state.organizations) if (o.citizen_assistance === undefined) o.citizen_assistance = !!CITIZEN_APPROVED[o.id]
  state.assistance_requests ||= seedAssistance(state)
  return state
}
function load() {
  try {
    const state = storage.load()
    if (state?.shelters) return migrate(state)
  } catch {
    /* fall through */
  }
  const fresh = seed()
  save(fresh)
  return fresh
}
function save(state) {
  try {
    storage.save(state)
  } catch {
    /* page-lifetime only */
  }
}
let db = load()

export function configureMock(options) {
  if (options.storage) storage = options.storage
  if (options.latency !== undefined) latency = options.latency
  db = load()
}
export function resetMockData() {
  db = seed()
  save(db)
}

// ---------- viewers ----------
// Every method takes an optional last argument `as`: who is calling.
// Operators see and may change everything; partners (shelter / organization
// portal accounts) are scoped to their own site, per Part 2 §10.
export const OPERATOR_VIEW = { role: 'operator', user_id: OPERATOR.id, name: 'Operator' }
const isPartner = (as) => as?.role === 'partner'
const owns = (as, ref) => isPartner(as) && ref && as.site.kind === ref.kind && as.site.id === ref.id
const forbid = (msg = 'Not permitted for this account.') => new ApiError(403, 'not_permitted', msg)
function requireOperator(as) {
  if (isPartner(as)) throw forbid()
}
function actorOf(as = OPERATOR_VIEW) {
  return isPartner(as) ? { kind: as.site.kind, id: as.site.id, name: nameOf(as.site.kind, as.site.id) } : { kind: 'operator', id: as.user_id, name: as.name || 'Operator' }
}
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)))
const wait = () => new Promise((r) => setTimeout(r, latency ? 40 + Math.random() * 100 : 0))

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
const SYSTEM = { kind: 'system', id: 'system', name: 'System' }

function log(type, summary, ref, actor) {
  db.activity.push({ id: uid('act'), disaster_id: D, type, summary, ref, actor: actor || actorOf(), created_at: now() })
}

function invRow(holderId, rt, create = false) {
  let row = db.inventory.find((r) => r.holder.id === holderId && r.resource_type_id === rt)
  if (!row && create) {
    row = { holder: { kind: 'organization', id: holderId }, resource_type_id: rt, quantity: 0, reserved: 0, updated_at: now() }
    db.inventory.push(row)
  }
  return row
}

function checkStock(shipment) {
  for (const it of shipment.items) {
    const row = invRow(shipment.from.id, it.resource_type_id)
    const avail = row ? row.quantity - row.reserved : 0
    if (avail < it.quantity) {
      throw new ApiError(409, 'insufficient_inventory', `${nameOf('organization', shipment.from.id)} has only ${avail} ${rtName(it.resource_type_id)} available.`)
    }
  }
}
function reserve(shipment) {
  checkStock(shipment)
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

function viewConversation(c, as) {
  const msgs = db.messages.filter((m) => m.conversation_id === c.id)
  const last = msgs.at(-1)
  const partner = isPartner(as)
  const readAt = partner ? c.partner_read_at : c.read_at
  const unread = msgs.filter((m) => (partner ? m.sender.kind === 'operator' : m.sender.kind !== 'operator') && (!readAt || m.created_at > readAt)).length
  return {
    id: c.id, disaster_id: c.disaster_id, participant: named(c.participant), subject: c.subject, created_at: c.created_at,
    last_message_at: last?.created_at ?? c.created_at, last_message_preview: last?.body ?? '', unread_count: unread,
  }
}

const hasPortal = (ref) => db.partner_accounts.some((a) => a.status === 'active' && a.site.kind === ref.kind && a.site.id === ref.id)

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

// Sites without a portal login get a simulated reply so demos feel live.
// Sites with a login answer for themselves from the partner portal.
function scheduleReply(conv) {
  if (!['shelter', 'organization'].includes(conv.participant.kind) || hasPortal(conv.participant)) return
  setTimeout(() => {
    const lines = CANNED[conv.participant.kind]
    const body = lines[Math.floor(Math.random() * lines.length)]
    db.messages.push({ id: uid('msg'), conversation_id: conv.id, sender: { ...conv.participant }, body, created_at: now() })
    log('message_received', `${nameOf(conv.participant.kind, conv.participant.id)}: "${body.slice(0, 40)}…"`, { kind: 'conversation', id: conv.id }, SYSTEM)
    save(db)
  }, 3500 + Math.random() * 3000)
}

const viewAccount = (a) => ({ ...clone(a), site: named(a.site) })

// What a partner organization may see of one citizen request (Part 2 §11):
// full details once they've accepted it; otherwise, for consented open requests
// inside their coverage area, an approximate location and a household summary.
function viewAssistanceForPartner(a, org) {
  if (a.assigned_to?.kind === 'organization' && a.assigned_to.id === org.id) {
    return { ...clone(a), assigned_to: named(a.assigned_to), redacted: false, distance_km: +km(org.location, a.location).toFixed(1) }
  }
  if (a.status !== 'open' || a.assigned_to || !a.consent_to_share) return null
  const dist = km(org.location, a.location)
  if (dist > (org.coverage_radius_km || 15)) return null
  const h = a.household
  return {
    id: a.id, disaster_id: a.disaster_id, kind: a.kind, priority: a.priority, status: a.status, redacted: true,
    items: clone(a.items), cannot_travel: a.cannot_travel,
    approx_location: { latitude: Math.round(a.location.latitude * 100) / 100, longitude: Math.round(a.location.longitude * 100) / 100 },
    distance_km: Math.round(dist * 2) / 2,
    household: {
      people: h.adults + h.children, children: h.children, pets: !!h.pets, immediate_medication: !!h.immediate_medication,
      accessibility: !!h.accessibility_notes, has_car: !!h.has_car,
    },
    created_at: a.created_at, updated_at: a.updated_at,
  }
}
const tempPassword = () => {
  const words = ['harbor', 'cedar', 'beacon', 'summit', 'meadow', 'river', 'falcon', 'anchor', 'willow', 'signal']
  const w = () => words[Math.floor(Math.random() * words.length)]
  return `${w()}-${w()}-${Math.floor(1000 + Math.random() * 9000)}`
}

// ---------- API ----------
export const mockApi = {
  async login(email, password) {
    await wait()
    if (!email || !password) throw bad('Enter an email and password.')
    return { access_token: 'mock-token', token_type: 'Bearer', expires_at: new Date(Date.now() + 864e5).toISOString(), user: OPERATOR }
  },
  async logout() { await wait(); return null },
  async me() { await wait(); return OPERATOR },

  async listDisasters() { await wait(); return clone(db.disasters) },

  // Shelters (Part 1; partners may edit their own shelter's live fields)
  async listShelters(disasterId) {
    await wait()
    return clone(db.shelters.filter((s) => !disasterId || s.disaster_id === disasterId))
  },
  async createShelter(body, as) {
    await wait()
    requireOperator(as)
    const created = { ...clone(body), id: uid('shelter'), updated_at: now() }
    db.shelters.push(created)
    log('shelter_created', `Relief location "${created.name}" added`, { kind: 'shelter', id: created.id }, actorOf(as))
    save(db)
    return clone(created)
  },
  async updateShelter(id, patch, as) {
    await wait()
    const i = db.shelters.findIndex((s) => s.id === id)
    if (i < 0) throw notFound('shelter')
    if (isPartner(as)) {
      if (!owns(as, { kind: 'shelter', id })) throw forbid()
      patch = pick(patch, ['status', 'capacity', 'resources', 'capabilities'])
    }
    const before = db.shelters[i]
    db.shelters[i] = { ...merge(before, patch), updated_at: now() }
    const after = db.shelters[i]
    const changes = []
    if (before.status !== after.status) changes.push(`marked ${after.status}`)
    if (before.capacity.available_people !== after.capacity.available_people) changes.push(`${after.capacity.available_people} spaces free`)
    if (JSON.stringify(before.resources) !== JSON.stringify(after.resources)) changes.push('supplies updated')
    log('shelter_updated', `${after.name} ${changes.join(', ') || 'updated'}`, { kind: 'shelter', id }, actorOf(as))
    save(db)
    return clone(after)
  },

  // Updates / broadcasts (Part 1 §5 + Part 2 §6)
  async listUpdates(disasterId, as) {
    await wait()
    const list = db.updates.filter((u) => u.disaster_id === disasterId).map(viewUpdate)
    return isPartner(as) ? list.filter((u) => u.status === 'published') : list
  },
  async previewUpdate(disasterId, { target, audience }, as) {
    await wait()
    requireOperator(as)
    return { recipient_count: countRecipients(disasterId, target, audience) }
  },
  async publishUpdate(disasterId, body, as) {
    await wait()
    requireOperator(as)
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
    log('update_published', `${scheduled ? 'Scheduled' : 'Sent'} ${created.severity} broadcast "${created.title}" to ${where} (${created.recipient_count})`, { kind: 'update', id: created.id }, actorOf(as))
    save(db)
    return viewUpdate(created)
  },
  async retractUpdate(id, as) {
    await wait()
    requireOperator(as)
    const u = db.updates.find((x) => x.id === id)
    if (!u) throw notFound('update')
    u.status = 'retracted'
    log('update_retracted', `Broadcast "${u.title}" retracted`, { kind: 'update', id }, actorOf(as))
    save(db)
    return viewUpdate(u)
  },

  // Reports (Part 1 §6)
  async listReports(disasterId, as) {
    await wait()
    requireOperator(as)
    return disasterId === D ? clone(db.reports) : []
  },

  // Part 2
  async listResourceTypes() { await wait(); return clone(RESOURCE_TYPES) },

  async listOrganizations(disasterId) {
    await wait()
    return clone(db.organizations.filter((o) => o.disaster_id === disasterId))
  },
  async createOrganization(body, as) {
    await wait()
    requireOperator(as)
    if (!body.name?.trim()) throw bad('Name is required.')
    const created = { ...clone(body), id: uid('org'), updated_at: now() }
    db.organizations.push(created)
    log('org_created', `Organization "${created.name}" added`, { kind: 'organization', id: created.id }, actorOf(as))
    save(db)
    return clone(created)
  },
  async updateOrganization(id, patch, as) {
    await wait()
    const i = db.organizations.findIndex((o) => o.id === id)
    if (i < 0) throw notFound('organization')
    if (isPartner(as)) {
      if (!owns(as, { kind: 'organization', id })) throw forbid()
      patch = pick(patch, ['status', 'contact', 'notes', 'services', 'address', 'location', 'coverage_radius_km'])
    }
    db.organizations[i] = { ...merge(db.organizations[i], patch), updated_at: now() }
    log('org_updated', `${db.organizations[i].name} updated${patch.status ? ` (now ${patch.status})` : ''}`, { kind: 'organization', id }, actorOf(as))
    save(db)
    return clone(db.organizations[i])
  },

  async listInventory(disasterId, as) {
    await wait()
    const orgIds = new Set(db.organizations.filter((o) => o.disaster_id === disasterId).map((o) => o.id))
    return db.inventory
      .filter((r) => orgIds.has(r.holder.id) && (!isPartner(as) || owns(as, r.holder)))
      .map((r) => ({ ...clone(r), holder: named(r.holder) }))
  },
  async setInventory(orgId, items, as) {
    await wait()
    if (!db.organizations.some((o) => o.id === orgId)) throw notFound('organization')
    if (isPartner(as) && !owns(as, { kind: 'organization', id: orgId })) throw forbid()
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
    log('inventory_updated', `${nameOf('organization', orgId)} inventory updated (${items.length} item${items.length === 1 ? '' : 's'})`, { kind: 'organization', id: orgId }, actorOf(as))
    save(db)
    return db.inventory.filter((r) => r.holder.id === orgId).map((r) => ({ ...clone(r), holder: named(r.holder) }))
  },

  async listNeeds(disasterId) {
    await wait()
    return db.needs.filter((n) => n.disaster_id === disasterId).map((n) => ({ ...clone(n), requester: named(n.requester) }))
  },
  async createNeed(body, as) {
    await wait()
    const requester = isPartner(as) ? { ...as.site } : body.requester
    if (!requester?.id || !body.resource_type_id || !(body.quantity_needed > 0)) throw bad('Requester, resource and a positive quantity are required.')
    const created = {
      id: uid('need'), disaster_id: body.disaster_id, requester: { kind: requester.kind, id: requester.id },
      resource_type_id: body.resource_type_id, quantity_needed: body.quantity_needed, quantity_fulfilled: 0,
      priority: body.priority || 'medium', status: 'open', needed_by: body.needed_by || null, notes: body.notes || '',
      created_at: now(), updated_at: now(),
    }
    db.needs.push(created)
    const who = nameOf(created.requester.kind, created.requester.id)
    log('need_created', `${isPartner(as) ? `${who} requested` : `${created.priority[0].toUpperCase() + created.priority.slice(1)} need:`} ${created.quantity_needed} ${rtName(created.resource_type_id)}${isPartner(as) ? ` (${created.priority})` : ` for ${who}`}`, { kind: 'need', id: created.id }, actorOf(as))
    save(db)
    return { ...clone(created), requester: named(created.requester) }
  },
  async updateNeed(id, patch, as) {
    await wait()
    const n = db.needs.find((x) => x.id === id)
    if (!n) throw notFound('need')
    if (isPartner(as)) {
      if (!owns(as, n.requester)) throw forbid()
      patch = pick(patch, ['quantity_needed', 'notes', 'needed_by', 'status', 'priority'])
      if (patch.status && patch.status !== 'cancelled') throw forbid('Partners can only cancel their own requests.')
    }
    Object.assign(n, patch, { updated_at: now() })
    if (patch.status === undefined && n.status === 'open' && n.quantity_fulfilled >= n.quantity_needed) n.status = 'fulfilled'
    log('need_updated', `Need for ${rtName(n.resource_type_id)} at ${nameOf(n.requester.kind, n.requester.id)} ${patch.status ? `marked ${patch.status}` : 'updated'}`, { kind: 'need', id }, actorOf(as))
    save(db)
    return { ...clone(n), requester: named(n.requester) }
  },

  async listShipments(disasterId, as) {
    await wait()
    return db.shipments
      .filter((s) => s.disaster_id === disasterId && (!isPartner(as) || owns(as, s.from) || owns(as, s.to)))
      .map((s) => ({ ...clone(s), from: named(s.from), to: named(s.to) }))
  },
  // Operators create approved shipments. Partner organizations create *offers*
  // from their own stock (status "requested") for an operator to approve.
  async createShipment(body, as) {
    await wait()
    const partner = isPartner(as)
    if (partner && (as.site.kind !== 'organization' || body.from?.id !== as.site.id)) throw forbid('Offers must come from your own organization.')
    if (body.from?.kind !== 'organization') throw bad('Shipments must come from an organization.')
    if (body.from.id === body.to?.id) throw bad('Source and destination must differ.')
    const items = (body.items || []).filter((i) => i.quantity > 0)
    if (!items.length) throw bad('Add at least one item.')
    const status = partner ? 'requested' : 'approved'
    const s = {
      id: uid('shipment'), disaster_id: body.disaster_id, from: { kind: 'organization', id: body.from.id }, to: { kind: body.to.kind, id: body.to.id },
      items, need_ids: body.need_ids || [], priority: body.priority || 'medium', status, eta: body.eta || null,
      notes: body.notes || '', created_at: now(), updated_at: now(), status_history: [{ status, at: now() }],
    }
    if (partner) checkStock(s)
    else reserve(s)
    db.shipments.push(s)
    const what = items.map((i) => `${i.quantity} ${rtName(i.resource_type_id)}`).join(', ')
    log('shipment_created', partner
      ? `${nameOf('organization', s.from.id)} offered ${what} for ${nameOf(s.to.kind, s.to.id)}`
      : `Shipment ${what} from ${nameOf('organization', s.from.id)} to ${nameOf(s.to.kind, s.to.id)}`, { kind: 'shipment', id: s.id }, actorOf(as))
    save(db)
    return { ...clone(s), from: named(s.from), to: named(s.to) }
  },
  async updateShipment(id, patch, as) {
    await wait()
    const s = db.shipments.find((x) => x.id === id)
    if (!s) throw notFound('shipment')
    if (isPartner(as)) {
      const sender = owns(as, s.from)
      const receiver = owns(as, s.to)
      const to = patch.status
      const ok = !to || to === s.status
        || (sender && s.status === 'approved' && to === 'in_transit')
        || (sender && s.status === 'requested' && to === 'cancelled')
        || (receiver && s.status === 'in_transit' && to === 'delivered')
      if (!ok || (!sender && !receiver) || ((patch.eta !== undefined || patch.notes !== undefined) && !sender)) throw forbid()
    }
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
      const label = { approved: 'approved', in_transit: 'departed', delivered: 'delivered', cancelled: 'cancelled' }[to]
      log('shipment_status', `Shipment ${nameOf('organization', s.from.id)} → ${nameOf(s.to.kind, s.to.id)} ${label}`, { kind: 'shipment', id }, actorOf(as))
    }
    if (patch.eta !== undefined) s.eta = patch.eta
    if (patch.notes !== undefined) s.notes = patch.notes
    s.updated_at = now()
    save(db)
    return { ...clone(s), from: named(s.from), to: named(s.to) }
  },

  async listConversations(disasterId, as) {
    await wait()
    return db.conversations
      .filter((c) => c.disaster_id === disasterId && (!isPartner(as) || owns(as, c.participant)))
      .map((c) => viewConversation(c, as))
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
  },
  async createConversation(body, as) {
    await wait()
    const partner = isPartner(as)
    const participant = partner ? { ...as.site } : body.participant
    if (!participant?.id || !body.message?.trim()) throw bad('Recipient and message are required.')
    const c = {
      id: uid('conv'), disaster_id: body.disaster_id, participant: { kind: participant.kind, id: participant.id },
      subject: body.subject || '(no subject)', created_at: now(), read_at: partner ? null : now(), partner_read_at: partner ? now() : null,
    }
    db.conversations.push(c)
    db.messages.push({ id: uid('msg'), conversation_id: c.id, sender: partner ? { ...as.site } : actorOf(as), body: body.message, created_at: now() })
    if (partner) log('message_received', `${nameOf(participant.kind, participant.id)}: "${body.message.slice(0, 40)}…"`, { kind: 'conversation', id: c.id }, actorOf(as))
    save(db)
    if (!partner) scheduleReply(c)
    return viewConversation(c, as)
  },
  async listMessages(conversationId, as) {
    await wait()
    const c = db.conversations.find((x) => x.id === conversationId)
    if (!c || (isPartner(as) && !owns(as, c.participant))) throw notFound('conversation')
    return db.messages.filter((m) => m.conversation_id === conversationId).map((m) => ({ ...clone(m), sender: named(m.sender) }))
  },
  async sendMessage(conversationId, body, as) {
    await wait()
    const c = db.conversations.find((x) => x.id === conversationId)
    if (!c || (isPartner(as) && !owns(as, c.participant))) throw notFound('conversation')
    if (!body?.trim()) throw bad('Message is empty.')
    const partner = isPartner(as)
    const m = { id: uid('msg'), conversation_id: c.id, sender: partner ? { ...as.site } : actorOf(as), body, created_at: now() }
    db.messages.push(m)
    if (partner) {
      c.partner_read_at = now()
      log('message_received', `${nameOf(c.participant.kind, c.participant.id)}: "${body.slice(0, 40)}…"`, { kind: 'conversation', id: c.id }, actorOf(as))
    } else {
      c.read_at = now()
    }
    save(db)
    if (!partner) scheduleReply(c)
    return { ...clone(m), sender: named(m.sender) }
  },
  async markConversationRead(conversationId, as) {
    await wait()
    const c = db.conversations.find((x) => x.id === conversationId)
    if (!c || (isPartner(as) && !owns(as, c.participant))) throw notFound('conversation')
    if (isPartner(as)) c.partner_read_at = now()
    else c.read_at = now()
    save(db)
    return null
  },

  async listActivity(disasterId, as) {
    await wait()
    requireOperator(as)
    return db.activity.filter((a) => a.disaster_id === disasterId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 60).map(clone)
  },

  // Partner portal accounts (Part 2 §10). The in-browser mock only tracks the
  // account records; the mock server also stores credentials so logins work.
  async listPartnerAccounts(disasterId, as) {
    await wait()
    requireOperator(as)
    const inDisaster = (a) => (a.site.kind === 'shelter' ? db.shelters : db.organizations).some((x) => x.id === a.site.id && x.disaster_id === disasterId)
    return db.partner_accounts.filter(inDisaster).map(viewAccount)
  },
  async createPartnerAccount(body, as) {
    await wait()
    requireOperator(as)
    const email = String(body.email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address.')
    if (!body.site?.id || !['shelter', 'organization'].includes(body.site.kind)) throw bad('Choose the shelter or organization this login belongs to.')
    if (db.partner_accounts.some((a) => a.email === email) || email === 'government@demo.example') throw new ApiError(409, 'email_in_use', 'An account with this email already exists.')
    const account = {
      id: body.id || uid('user'), email, contact_name: body.contact_name || '', site: { kind: body.site.kind, id: body.site.id },
      status: 'active', created_at: now(), last_login_at: null,
    }
    db.partner_accounts.push(account)
    log('partner_account_created', `Portal login created for ${nameOf(account.site.kind, account.site.id)} (${email})`, { kind: account.site.kind, id: account.site.id }, actorOf(as))
    save(db)
    return { account: viewAccount(account), temporary_password: body.temporary_password || tempPassword() }
  },
  async updatePartnerAccount(id, patch, as) {
    await wait()
    requireOperator(as)
    const a = db.partner_accounts.find((x) => x.id === id)
    if (!a) throw notFound('account')
    if (patch.status && !['active', 'disabled'].includes(patch.status)) throw bad('Status must be active or disabled.')
    Object.assign(a, pick(patch, ['status', 'contact_name']))
    if (patch.status) log('partner_account_updated', `Portal login for ${nameOf(a.site.kind, a.site.id)} ${patch.status === 'disabled' ? 'disabled' : 're-enabled'}`, { kind: a.site.kind, id: a.site.id }, actorOf(as))
    save(db)
    return viewAccount(a)
  },
  async resetPartnerPassword(id, as) {
    await wait()
    requireOperator(as)
    const a = db.partner_accounts.find((x) => x.id === id)
    if (!a) throw notFound('account')
    log('partner_account_updated', `Portal password reset for ${nameOf(a.site.kind, a.site.id)}`, { kind: a.site.kind, id: a.site.id }, actorOf(as))
    save(db)
    return { temporary_password: tempPassword() }
  },

  // Citizen assistance (Part 2 §11). Operators see everything. Approved
  // partner organizations see *consented, open* requests in their coverage
  // area in redacted form, and full details only for requests they accepted.
  async listAssistanceRequests(disasterId, as) {
    await wait()
    const list = db.assistance_requests.filter((a) => a.disaster_id === disasterId)
    if (!isPartner(as)) return list.map((a) => ({ ...clone(a), assigned_to: named(a.assigned_to) }))
    const org = as.site.kind === 'organization' && db.organizations.find((o) => o.id === as.site.id)
    if (!org?.citizen_assistance) return []
    return list.map((a) => viewAssistanceForPartner(a, org)).filter(Boolean)
  },
  async claimAssistanceRequest(id, body = {}, as) {
    await wait()
    const a = db.assistance_requests.find((x) => x.id === id)
    if (!a) throw notFound('request')
    const org = isPartner(as) && db.organizations.find((o) => o.id === as.site.id)
    if (!org || as.site.kind !== 'organization') throw forbid('Only partner organizations can accept citizen requests.')
    if (!org.citizen_assistance) throw forbid('Your organization is not approved for citizen assistance. Contact the operations center.')
    if (!a.consent_to_share) throw notFound('request')
    if (a.status !== 'open' || a.assigned_to) throw new ApiError(409, 'already_claimed', 'Another organization has already accepted this request.')
    if (!viewAssistanceForPartner(a, org)) throw notFound('request') // outside their coverage area
    const by = actorOf(as)
    a.assigned_to = { kind: 'organization', id: org.id }
    a.status = 'claimed'
    a.eta = body.eta || null
    a.partner_note = body.partner_note || null
    a.history.push({ status: 'claimed', at: now(), by })
    a.updated_at = now()
    log('citizen_request_claimed', `${org.name} accepted citizen request ${a.id.replace('assist_', '#')} (${a.kind.replace('_', ' ')}) — household contact details released to them`, { kind: 'assistance', id: a.id }, by)
    save(db)
    return { ...clone(a), assigned_to: named(a.assigned_to) }
  },
  async updateAssistanceRequest(id, patch, as) {
    await wait()
    const a = db.assistance_requests.find((x) => x.id === id)
    if (!a) throw notFound('request')
    const by = actorOf(as)
    const was = a.status
    if (isPartner(as)) {
      if (!owns(as, a.assigned_to)) throw notFound('request')
      const to = patch.status
      const ok = !to || (to === 'en_route' && was === 'claimed') || (to === 'completed' && ['claimed', 'en_route'].includes(was)) || (to === 'released' && ['claimed', 'en_route'].includes(was))
      if (!ok) throw new ApiError(409, 'invalid_transition', `Can't move a ${was} request to ${to}.`)
      if (to === 'released') {
        a.assigned_to = null
        a.status = 'open'
        a.eta = null
        a.partner_note = null
        a.history.push({ status: 'released', at: now(), by, note: patch.note || '' })
        log('citizen_request_released', `${by.name} released citizen request ${a.id.replace('assist_', '#')}${patch.note ? `: "${patch.note}"` : ''}`, { kind: 'assistance', id }, by)
      } else {
        if (to) a.status = to
        if (patch.eta !== undefined) a.eta = patch.eta
        if (patch.partner_note !== undefined) a.partner_note = patch.partner_note
        if (to === 'completed') {
          a.resolution_note = patch.resolution_note || ''
          if (patch.deduct_inventory) {
            for (const it of a.items) {
              const row = invRow(as.site.id, it.resource_type_id)
              if (row) row.quantity = Math.max(row.reserved, row.quantity - it.quantity)
            }
          }
        }
        if (to) {
          a.history.push({ status: to, at: now(), by, note: patch.resolution_note || patch.partner_note || '' })
          log('citizen_request_status', `Citizen request ${a.id.replace('assist_', '#')} ${to === 'en_route' ? 'en route' : to} (${by.name})`, { kind: 'assistance', id }, by)
        }
      }
    } else {
      if (patch.assigned_to !== undefined) {
        if (patch.assigned_to) {
          const org = db.organizations.find((o) => o.id === patch.assigned_to.id)
          if (!org) throw notFound('organization')
          if (!a.consent_to_share) throw new ApiError(409, 'consent_required', "This household didn't consent to sharing with aid organizations. Handle it directly.")
          a.assigned_to = { kind: 'organization', id: org.id }
          if (['open', 'released'].includes(a.status)) a.status = 'claimed'
          a.history.push({ status: 'claimed', at: now(), by, note: `Assigned to ${org.name} by operations` })
          log('citizen_request_claimed', `Operations assigned citizen request ${a.id.replace('assist_', '#')} to ${org.name}`, { kind: 'assistance', id }, by)
        } else {
          a.assigned_to = null
          if (['claimed', 'en_route'].includes(a.status)) a.status = 'open'
          a.history.push({ status: 'open', at: now(), by, note: 'Unassigned by operations' })
        }
      }
      if (patch.status && patch.status !== a.status) {
        a.status = patch.status
        a.history.push({ status: patch.status, at: now(), by, note: patch.note || '' })
        log('citizen_request_status', `Citizen request ${a.id.replace('assist_', '#')} marked ${patch.status.replace('_', ' ')} by operations`, { kind: 'assistance', id }, by)
      }
      for (const k of ['priority', 'operator_notes', 'eta', 'partner_note']) if (patch[k] !== undefined) a[k] = patch[k]
    }
    a.updated_at = now()
    save(db)
    return isPartner(as)
      ? viewAssistanceForPartner(a, db.organizations.find((o) => o.id === as.site.id)) || { id: a.id, status: a.status, released: true }
      : { ...clone(a), assigned_to: named(a.assigned_to) }
  },

  // Used by the mock server only.
  _partnerAccount: (id) => clone(db.partner_accounts.find((a) => a.id === id) || null),
  _partnerAccountByEmail: (email) => clone(db.partner_accounts.find((a) => a.email === email) || null),
  _touchLogin(id) {
    const a = db.partner_accounts.find((x) => x.id === id)
    if (a) { a.last_login_at = now(); save(db) }
  },
  _siteName: (ref) => nameOf(ref.kind, ref.id),
}
