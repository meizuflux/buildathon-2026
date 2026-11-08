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
