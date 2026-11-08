export const RESOURCE_KEYS = ['food', 'water', 'medication', 'clothes']
export const AVAILABILITY = ['available', 'limited', 'unavailable', 'unknown']
export const SHELTER_STATUSES = ['open', 'full', 'closed']
export const SEVERITIES = ['info', 'warning', 'critical']
export const MEDICAL_STAFF = ['doctor', 'nurse', 'paramedic', 'pharmacist']
export const REPORT_TYPES = {
  need_help: 'Needs help',
  status_update: 'Status update',
  resource_request: 'Resource request',
  other: 'Other',
}
export const DISASTER_TYPES = { hurricane: 'Hurricane', flood: 'Flood', tsunami: 'Tsunami', tornado: 'Tornado' }

export const PRIORITIES = ['critical', 'high', 'medium', 'low']
export const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }

export const CATEGORIES = {
  water: 'Water',
  food: 'Food',
  medication: 'Medication',
  medical_supplies: 'Medical supplies',
  baby: 'Baby & infant',
  bedding: 'Bedding',
  hygiene: 'Hygiene',
  clothes: 'Clothes',
  power: 'Power & fuel',
}

export const ORG_TYPES = { government: 'Government', nonprofit: 'Nonprofit', private: 'Private', faith: 'Faith-based', medical: 'Medical' }
export const ORG_SERVICES = {
  distribution: 'Distribution',
  food: 'Food',
  medical: 'Medical',
  transport: 'Transport',
  shelter_support: 'Shelter support',
  logistics: 'Logistics',
}
export const ORG_STATUSES = ['active', 'limited', 'inactive']

export const SHIPMENT_FLOW = ['requested', 'approved', 'in_transit', 'delivered']
export const SHIPMENT_LABEL = { requested: 'Requested', approved: 'Approved', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled' }
export const SHIPMENT_NEXT = {
  requested: { status: 'approved', label: 'Approve' },
  approved: { status: 'in_transit', label: 'Mark departed' },
  in_transit: { status: 'delivered', label: 'Confirm delivery' },
}

export const AUDIENCE_NEEDS = {
  immediate_medication: 'Needs medication',
  accessibility: 'Accessibility needs',
  no_car: 'No car',
  children: 'Has children',
  pets: 'Has pets',
}

export const BROADCAST_TEMPLATES = [
  {
    id: 'evacuate',
    name: 'Evacuation order',
    severity: 'critical',
    title: 'Evacuation order: leave now',
    message: 'An evacuation order is in effect for your area. Leave now and go to the shelter in your Haven plan. Bring medication, documents, and pet supplies. Do not drive through flood water.',
  },
  {
    id: 'shelter_in_place',
    name: 'Shelter in place',
    severity: 'critical',
    title: 'Shelter in place',
    message: 'Stay indoors and away from windows. Do not travel until officials give the all clear. Keep your phone charged and check Haven for updates.',
  },
  {
    id: 'boil_water',
    name: 'Boil water notice',
    severity: 'warning',
    title: 'Boil water notice',
    message: 'Tap water in your area may be unsafe. Boil water for at least 1 minute before drinking, cooking, or brushing teeth until further notice.',
  },
  {
    id: 'road_closure',
    name: 'Road closure',
    severity: 'warning',
    title: 'Road closures in your area',
    message: 'Several roads near you are closed due to flooding or debris. Check your Haven plan for an updated route before traveling.',
  },
  {
    id: 'distribution',
    name: 'Supply distribution',
    severity: 'info',
    title: 'Supplies available',
    message: 'Water, food and hygiene kits are being distributed today from 9am to 5pm. Bring ID if you have it.',
  },
  {
    id: 'shelter_change',
    name: 'Shelter change',
    severity: 'info',
    title: 'Shelter availability changed',
    message: 'Shelter availability has changed. Open Haven to check your current plan before traveling.',
  },
  {
    id: 'all_clear',
    name: 'All clear',
    severity: 'info',
    title: 'All clear',
    message: 'The immediate danger has passed for your area. Follow local guidance before returning home and avoid downed power lines.',
  },
]

// Citizen assistance (Part 2 §11)
export const ASSIST_KINDS = { delivery: 'Supply delivery', transport: 'Transport', medical: 'Medical', welfare_check: 'Welfare check', other: 'Other' }
export const ASSIST_STATUS = { open: 'Open', claimed: 'Accepted', en_route: 'En route', completed: 'Completed', cancelled: 'Cancelled' }
export const ASSIST_COLOR = { open: '#d64545', claimed: '#2563eb', en_route: '#7c3aed', completed: '#1f9d55', cancelled: '#8a8f98' }

// Default map centre (Example County demo area).
export const DEFAULT_CENTER = [26.25, -81.58]

export function emptyShelter(disasterId, location) {
  return {
    disaster_id: disasterId,
    name: '',
    address: '',
    location: location || { latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1] },
    status: 'open',
    capacity: { total_people: 100, available_people: 100 },
    capabilities: { pets_allowed: false, child_friendly: false, wheelchair_accessible: false, medical_staff: [], special_care_notes: '' },
    resources: { food: 'unknown', water: 'unknown', medication: 'unknown', clothes: 'unknown' },
  }
}

export function emptyOrganization(disasterId) {
  return {
    disaster_id: disasterId,
    name: '',
    type: 'nonprofit',
    services: ['distribution'],
    status: 'active',
    address: '',
    location: { latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1] },
    contact: { name: '', phone: '', email: '' },
    coverage_radius_km: 15,
    notes: '',
  }
}
