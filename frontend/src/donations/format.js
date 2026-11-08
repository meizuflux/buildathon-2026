// Mirrors the server resource catalog (GET /api/resource-types).
export const RESOURCE_TYPES = [
  ['water_bottled', 'Bottled water'],
  ['water_gallon', 'Water jugs (1 gal)'],
  ['food_mre', 'Ready-to-eat meals'],
  ['food_canned', 'Canned food'],
  ['baby_formula', 'Baby formula'],
  ['diapers', 'Diapers'],
  ['insulin', 'Insulin (refrigerated)'],
  ['rx_refills', 'Prescription refills'],
  ['first_aid', 'First aid kits'],
  ['oxygen', 'Oxygen cylinders'],
  ['blankets', 'Blankets'],
  ['cots', 'Cots'],
  ['hygiene_kit', 'Hygiene kits'],
  ['clothing', 'Clothing bundles'],
  ['generator', 'Generators'],
  ['fuel', 'Fuel'],
];
export const RESOURCE_LABELS = Object.fromEntries(RESOURCE_TYPES);

export const HUB_TYPES = {
  mosque: 'Mosque',
  church: 'Church',
  fire_station: 'Fire station',
  school: 'School',
  community_center: 'Community center',
  other: 'Hub',
};

export const itemsText = (items) =>
  items.map((i) => `${i.quantity} ${i.name ?? RESOURCE_LABELS[i.resource_type_id] ?? i.resource_type_id}`).join(', ');

export function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export const authMessage = (e) => (e.status === 401 || e.status === 403 ? 'You need to sign in with the right account.' : e.message);

export function capacityHex(pct) {
  if (pct >= 90) return '#dc2626';
  if (pct >= 70) return '#f59e0b';
  return '#16a34a';
}
