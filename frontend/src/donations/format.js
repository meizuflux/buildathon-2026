export const CATEGORY_LABELS = {
  water: 'Water',
  diapers: 'Diapers',
  formula: 'Formula',
  canned_goods: 'Canned goods',
  blankets: 'Blankets',
};

export const HUB_TYPES = {
  church: 'Church',
  fire_station: 'Fire station',
  school: 'School',
  community_center: 'Community center',
  other: 'Hub',
};

export const itemsText = (items) => items.map((i) => `${i.quantity} ${CATEGORY_LABELS[i.category] ?? i.category}`).join(', ');

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
