import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, colors } from './shared';

/** Shows whether the device location is ready, with a retry when it isn't. */
export function LocationStatus({ place }) {
  if (place.status === 'locating') {
    return (
      <View style={[styles.locationBox, styles.row]}>
        <ActivityIndicator size="small" />
        <Text style={styles.body}>Finding your location…</Text>
      </View>
    );
  }
  if (place.status === 'ready') {
    const accuracy = place.coords.accuracy ? ` (±${Math.round(place.coords.accuracy)} m)` : '';
    return (
      <View style={styles.locationBox}>
        <Text style={styles.locationText}>📍 Using your current location{accuracy}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.locationBox, styles.errorBox]}>
      <Text style={styles.error}>{place.error}</Text>
      <Button title="Try again" variant="secondary" onPress={place.retry} />
    </View>
  );
}

export function directionsUrl(hub) {
  return `https://www.google.com/maps/dir/?api=1&destination=${hub.latitude},${hub.longitude}`;
}

/** The hub the system chose, why it chose it, and a directions link. */
export function MatchCard({ title, hub, match, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{title}</Text>
      <Text style={styles.hubName}>{hub.name}</Text>
      <Text style={styles.body}>{hub.address}</Text>
      {match?.reasons?.length > 0 && <Text style={styles.reasons}>Why this hub: {match.reasons.join(' · ')}</Text>}
      {children}
      {hub.latitude != null && (
        <Pressable onPress={() => Linking.openURL(directionsUrl(hub))}>
          <Text style={styles.link}>Get directions ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  locationBox: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, gap: 8 },
  locationText: { fontSize: 14, color: '#166534', fontWeight: '500' },
  errorBox: { backgroundColor: '#fef2f2' },
  card: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, gap: 4, borderWidth: 1, borderColor: '#bfdbfe' },
  cardLabel: { fontSize: 12, fontWeight: '700', color: colors.chipText, textTransform: 'uppercase', letterSpacing: 0.5 },
  hubName: { fontSize: 18, fontWeight: '700', color: colors.text },
  reasons: { fontSize: 13, color: colors.text, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14, marginTop: 6 },
});
