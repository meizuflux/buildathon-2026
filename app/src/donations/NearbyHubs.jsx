import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_BASE, DEMO_CENTER, fetchNearbyHubs } from './api';
import { CATEGORIES, Chip, FULL_PCT, HUB_TYPES, LABELS, colors } from './shared';

function capacityColor(pct) {
  if (pct >= FULL_PCT) return colors.danger;
  if (pct >= 70) return colors.warn;
  return colors.ok;
}

function HubCard({ hub, onPress, actionLabel }) {
  const needs = hub.supplies.filter((s) => s.need > 0);
  const available = hub.supplies.filter((s) => s.available > 0);
  const full = hub.capacity_pct >= FULL_PCT;
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => onPress?.(hub)}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.name}>{hub.name}</Text>
          <Text style={styles.meta}>
            {HUB_TYPES[hub.type] ?? 'Hub'} · {hub.distance_km.toFixed(1)} km · {hub.address}
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
        {hub.capacity_pct}% storage used{full ? ' · not accepting drop-offs' : ''}
      </Text>

      {needs.length > 0 && (
        <View style={styles.chips}>
          <Text style={styles.label}>Needs:</Text>
          {needs.map((s) => (
            <View key={s.category} style={styles.needChip}>
              <Text style={styles.needText}>
                {LABELS[s.category] ?? s.category} ({s.need})
              </Text>
            </View>
          ))}
        </View>
      )}
      {available.length > 0 && (
        <Text style={styles.meta}>
          <Text style={styles.label}>Has: </Text>
          {available.map((s) => `${LABELS[s.category] ?? s.category} ${s.available}`).join(' · ')}
        </Text>
      )}
      {actionLabel && !full && <Text style={styles.action}>{actionLabel} ›</Text>}
    </Pressable>
  );
}

const MODES = [
  ['all', 'All hubs'],
  ['needs', 'I want to donate'],
  ['has', 'I need supplies'],
];

/**
 * Card stack of donation hubs near a point, nearest first, filterable by what hubs need or have.
 * Props: lat, lng (default: demo center), apiBase, radiusKm, onSelectHub(hub), actionLabel (card call to action).
 */
export default function NearbyHubs({
  lat = DEMO_CENTER.lat, lng = DEMO_CENTER.lng, apiBase = API_BASE, radiusKm = 25, onSelectHub, actionLabel,
}) {
  const [mode, setMode] = useState('all');
  const [category, setCategory] = useState('water');
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const filter = mode === 'all' ? {} : { [mode]: category };
      setHubs(await fetchNearbyHubs(lat, lng, { apiBase, radiusKm, ...filter }));
    } catch (e) {
      setError(e.message);
    }
  }, [lat, lng, apiBase, radiusKm, mode, category]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Donation hubs near you</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {MODES.map(([key, label]) => (
          <Chip key={key} label={label} active={mode === key} onPress={() => setMode(key)} />
        ))}
      </ScrollView>
      {mode !== 'all' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {CATEGORIES.map(([key, label]) => (
            <Chip key={key} label={label} active={category === key} onPress={() => setCategory(key)} />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <FlatList
      data={loading ? [] : hubs}
      keyExtractor={(hub) => hub.id}
      renderItem={({ item }) => <HubCard hub={item} onPress={onSelectHub} actionLabel={actionLabel} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <>
              <Text style={styles.meta}>
                {error
                  ? `Couldn't load hubs: ${error}`
                  : mode === 'all'
                    ? `No hubs within ${radiusKm} km.`
                    : `No nearby hubs ${mode === 'needs' ? 'need' : 'have'} ${LABELS[category].toLowerCase()} right now.`}
              </Text>
              {error && (
                <Pressable style={styles.retry} onPress={refresh}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  header: { gap: 10 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  filterRow: { gap: 8 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  fullBadge: { backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  fullText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  needChip: { backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  needText: { color: colors.chipText, fontSize: 12, fontWeight: '500' },
  action: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  retry: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});
