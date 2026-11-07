import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { API_BASE, createRequest, requestLimits } from './api';
import { Button, ItemPicker, LABELS, colors, itemsText, pickedItems } from './shared';
import useDeviceLocation from './useDeviceLocation';

function LocationStatus({ place }) {
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
    <View style={[styles.locationBox, styles.locationError]}>
      <Text style={styles.error}>{place.error}</Text>
      <Button title="Try again" variant="secondary" onPress={place.retry} />
    </View>
  );
}

/** The cap that applies to the picked items (their scarcest resource type) and how many requests are left. */
function limitFor(limits, picked) {
  if (!limits) return null;
  const caps = limits.resource_types;
  const relevant = picked.length ? picked.map((i) => i.resource_type_id) : Object.keys(caps);
  const scarcest = relevant.reduce((a, b) => ((caps[b]?.cap ?? 0) < (caps[a]?.cap ?? 0) ? b : a));
  const { cap, level } = caps[scarcest] ?? { cap: 0, level: 'critical' };
  return { cap, level, scarcest, remaining: Math.max(cap - limits.active, 0) };
}

/** How many requests this person may open right now, given demand for the items picked. */
function LimitNotice({ limits, picked }) {
  const limit = limitFor(limits, picked);
  if (!limit) return null;
  const { cap, level, scarcest, remaining } = limit;
  const tight = cap < limits.base_cap;
  return (
    <View style={[styles.limitBox, remaining === 0 && styles.locationError]}>
      <Text style={styles.body}>
        {remaining === 0
          ? `You have ${limits.active} active request${limits.active === 1 ? '' : 's'}, the most allowed right now. `
          : `You can open ${remaining} more request${remaining === 1 ? '' : 's'} (${limits.active} active, limit ${cap}). `}
        {tight && picked.length > 0 && `${LABELS[scarcest]} is in ${level} demand, so limits are lower to share it fairly.`}
      </Text>
    </View>
  );
}

/**
 * Ask for supplies, sent with the device's GPS position. A government worker picks a hub and
 * either delivers or sets the items aside for pickup.
 * Props: token (family login), apiBase, place (a useDeviceLocation() result; created here if omitted), onDone(request).
 */
export default function RequestForm({ token, apiBase = API_BASE, place: placeProp, onDone }) {
  const ownPlace = useDeviceLocation(undefined, { enabled: !placeProp });
  const place = placeProp ?? ownPlace;
  const [items, setItems] = useState({});
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState({ kind: 'idle' });
  const [limits, setLimits] = useState(null);
  const picked = pickedItems(items);

  const loadLimits = useCallback(() => {
    requestLimits({ apiBase, token }).then(setLimits, () => setLimits(null));
  }, [apiBase, token]);

  useEffect(() => {
    loadLimits();
  }, [loadLimits]);

  const submit = async () => {
    setState({ kind: 'saving' });
    try {
      const { lat, lng } = place.coords;
      const created = await createRequest({ items: picked, latitude: lat, longitude: lng, address, notes }, { apiBase, token });
      setState({ kind: 'done', request: created });
      setItems({});
      setNotes('');
    } catch (e) {
      setState({ kind: 'error', message: e.status === 401 ? 'Please sign in to request supplies.' : e.message });
    }
    loadLimits();
  };

  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text style={styles.title}>Request supplies</Text>
      <Text style={styles.body}>
        Tell us what you need. A response worker will deliver it or set it aside at a nearby hub for you to pick up.
      </Text>
      <LocationStatus place={place} />
      {state.kind === 'done' && (
        <Text style={styles.success}>Request sent for {itemsText(state.request.items)}. Track it under My activity.</Text>
      )}
      <ItemPicker value={items} onChange={setItems} />
      <LimitNotice limits={limits} picked={picked} />
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="Landmark or unit to help workers find you (optional)"
        maxLength={200}
        style={styles.input}
      />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything we should know? e.g. infant, no vehicle (optional)"
        maxLength={500}
        multiline
        style={[styles.input, styles.multiline]}
      />
      {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}
      <Button
        title={state.kind === 'saving' ? 'Sending…' : 'Send request'}
        onPress={submit}
        disabled={!picked.length || state.kind === 'saving' || place.status !== 'ready' || limitFor(limits, picked)?.remaining === 0}
      />
      {state.kind === 'done' && onDone && <Button title="View my activity" variant="secondary" onPress={() => onDone(state.request)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted },
  success: { fontSize: 14, color: colors.ok, fontWeight: '600' },
  error: { fontSize: 14, color: colors.danger },
  locationBox: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, gap: 8 },
  locationText: { fontSize: 14, color: '#166534', fontWeight: '500' },
  locationError: { backgroundColor: '#fef2f2' },
  limitBox: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, color: colors.text },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
});
