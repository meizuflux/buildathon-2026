import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { API_BASE, DEMO_CENTER, fetchNearbyHubs } from './api';

const LABELS = {
  water: 'Water',
  diapers: 'Diapers',
  formula: 'Formula',
  canned_goods: 'Canned goods',
  blankets: 'Blankets',
};
const TYPES = {
  church: 'Church',
  fire_station: 'Fire station',
  school: 'School',
  community_center: 'Community center',
  other: 'Hub',
};
const FULL = 90;

function capacityColor(pct) {
  if (pct >= FULL) return '#dc2626';
  if (pct >= 70) return '#d97706';
  return '#16a34a';
}

function HubCard({ hub, onPress }) {
  const needs = hub.supplies.filter((s) => s.need > 0);
  const full = hub.capacity_pct >= FULL;
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => onPress?.(hub)}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.name}>{hub.name}</Text>
          <Text style={styles.meta}>
            {TYPES[hub.type] ?? 'Hub'} · {hub.distance_km.toFixed(1)} km · {hub.address}
          </Text>
        </View>
        {full && (
          <View style={styles.fullBadge}>
            <Text style={styles.fullText}>Full</Text>
          </View>
        )}
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${hub.capacity_pct}%`, backgroundColor: capacityColor(hub.capacity_pct) }]} />
      </View>
      <Text style={styles.meta}>
        {hub.capacity_pct}% storage used
        {full ? ' · drop-offs paused, pick-ups welcome' : ''}
      </Text>

      {needs.length > 0 ? (
        <View style={styles.chips}>
          <Text style={styles.needsLabel}>Needs:</Text>
          {needs.map((s) => (
            <View key={s.category} style={styles.chip}>
              <Text style={styles.chipText}>
                {LABELS[s.category] ?? s.category} ({s.need})
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.meta}>No urgent needs right now.</Text>
      )}
    </Pressable>
  );
}

/**
 * Card stack of donation hubs near a point, nearest first.
 * Props: lat, lng (default: demo center), apiBase, radiusKm, onSelectHub(hub).
 */
export default function NearbyHubs({ lat = DEMO_CENTER.lat, lng = DEMO_CENTER.lng, apiBase = API_BASE, radiusKm = 25, onSelectHub }) {
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setHubs(await fetchNearbyHubs(lat, lng, { apiBase, radiusKm }));
    } catch (e) {
      setError(e.message);
    }
  }, [lat, lng, apiBase, radiusKm]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={hubs}
      keyExtractor={(hub) => hub.id}
      renderItem={({ item }) => <HubCard hub={item} onPress={onSelectHub} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={<Text style={styles.title}>Donation hubs near you</Text>}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.meta}>{error ? `Couldn't load hubs: ${error}` : `No hubs within ${radiusKm} km.`}</Text>
          {error && (
            <Pressable style={styles.retry} onPress={refresh}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4, color: '#111827' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 13, color: '#4b5563' },
  fullBadge: { backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  fullText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  needsLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
  chip: { backgroundColor: '#dbeafe', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { color: '#1e40af', fontSize: 12, fontWeight: '500' },
  retry: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});
