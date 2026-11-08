export const PRIORITIES = ['critical', 'high', 'medium', 'low']
export const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }
export const RESOURCE_KEYS = ['food', 'water', 'medication', 'clothes']
export const AVAILABILITY = ['available', 'limited', 'unavailable', 'unknown']
export const SHELTER_STATUSES = ['open', 'full', 'closed']
export const ORG_STATUSES = ['active', 'limited', 'inactive']
export const MEDICAL_STAFF = ['doctor', 'nurse', 'paramedic', 'pharmacist']
export const CATEGORIES = {
  water: 'Water', food: 'Food', medication: 'Medication', medical_supplies: 'Medical supplies',
  baby: 'Baby & infant', bedding: 'Bedding', hygiene: 'Hygiene', clothes: 'Clothes', power: 'Power & fuel',
}
export const ORG_TYPES = { government: 'Government', nonprofit: 'Nonprofit', private: 'Private', faith: 'Faith-based', medical: 'Medical' }
export const ORG_SERVICES = { distribution: 'Distribution', food: 'Food', medical: 'Medical', transport: 'Transport', shelter_support: 'Shelter support', logistics: 'Logistics' }
export const SHIPMENT_LABEL = { requested: 'Offer pending approval', approved: 'Approved — awaiting departure', in_transit: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' }
export const ASSIST_KINDS = { delivery: 'Supply delivery', transport: 'Transport', medical: 'Medical', welfare_check: 'Welfare check', other: 'Other' }
export const ASSIST_STATUS = { open: 'Open', claimed: 'Accepted', en_route: 'On the way', completed: 'Completed', cancelled: 'Cancelled' }
export const SHIPMENT_SHORT = { requested: 'Pending approval', approved: 'Approved', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled' }
