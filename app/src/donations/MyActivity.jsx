import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_BASE, cancelPledge, cancelRequest, myPledges, myRequests } from './api';
import { Button, colors, itemsText } from './shared';

const REQUEST_STATUS = {
  open: ['Waiting for supplies', colors.warn],
  matched: ['Matched', colors.primary],
  assigned: ['On the way', colors.primary],
  fulfilled: ['Done', colors.ok],
  cancelled: ['Cancelled', colors.muted],
};
const PLEDGE_STATUS = {
  pending: ['Expected', colors.warn],
  received: ['Received, thank you', colors.ok],
  no_show: ['Not dropped off', colors.muted],
  cancelled: ['Cancelled', colors.muted],
};

function Status({ map, status }) {
  const [label, color] = map[status] ?? [status, colors.muted];
  return <Text style={[styles.status, { color }]}>{label}</Text>;
}

function requestDetail(r) {
  if (r.status === 'open') return "No hub has these right now. You'll be matched as soon as one does.";
  if (r.status === 'matched') return `Set aside at ${r.hub.name}. A worker will contact you to deliver or arrange pickup.`;
  if (r.status === 'assigned' && r.method === 'delivery') return `${r.hub.name} is delivering to you.`;
  if (r.status === 'assigned' && r.method === 'pickup') return `Ready for pickup at ${r.hub.name}, ${r.hub.address}.`;
  if (r.status === 'fulfilled' && r.hub) return `From ${r.hub.name}.`;
  return null;
}

/** The signed-in citizen's supply requests and drop-off pledges. Props: token, apiBase. */
export default function MyActivity({ token, apiBase = API_BASE }) {
  const [requests, setRequests] = useState([]);
  const [pledges, setPledges] = useState([]);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([myRequests({ apiBase, token }), myPledges({ apiBase, token })]);
      setRequests(r);
      setPledges(p);
      setError(null);
    } catch (e) {
      setError(e.status === 401 ? 'Please sign in to see your activity.' : e.message);
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const act = async (fn) => {
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    load();
  };

  return (
    <ScrollView contentContainerStyle={styles.box} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.title}>My requests</Text>
      {requests.length === 0 && <Text style={styles.meta}>No requests yet.</Text>}
      {requests.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.items}>{itemsText(r.items)}</Text>
            <Status map={REQUEST_STATUS} status={r.status} />
          </View>
          {requestDetail(r) && <Text style={styles.meta}>{requestDetail(r)}</Text>}
          <Text style={styles.meta}>{new Date(r.created_at).toLocaleString()}</Text>
          {['open', 'matched', 'assigned'].includes(r.status) && (
            <Button title="Cancel request" variant="secondary" onPress={() => act(() => cancelRequest(r.id, { apiBase, token }))} />
          )}
        </View>
      ))}

      <Text style={styles.title}>My drop-offs</Text>
      {pledges.length === 0 && <Text style={styles.meta}>No pledges yet.</Text>}
      {pledges.map((p) => (
        <View key={p.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.items}>{itemsText(p.items)}</Text>
            <Status map={PLEDGE_STATUS} status={p.status} />
          </View>
          <Text style={styles.meta}>
            {p.hub.name}, {p.hub.address}
          </Text>
          {p.status === 'pending' && (
            <Button title="Cancel pledge" variant="secondary" onPress={() => act(() => cancelPledge(p.id, { apiBase, token }))} />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  items: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  status: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
});
