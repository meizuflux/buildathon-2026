import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { API_BASE, createPledge } from './api';
import { Button, FULL_PCT, ItemPicker, LABELS, colors, itemsText, pickedItems } from './shared';

/**
 * Pledge a drop-off at one hub. Starts with the hub's open needs prefilled.
 * Props: hub (from fetchNearbyHubs), token (family login), apiBase, onDone(pledge), onCancel().
 */
export default function PledgeForm({ hub, token, apiBase = API_BASE, onDone, onCancel }) {
  const [items, setItems] = useState(() =>
    Object.fromEntries(hub.supplies.filter((s) => s.need > 0).map((s) => [s.category, Math.min(s.need, 10)])),
  );
  const [notes, setNotes] = useState('');
  const [state, setState] = useState({ kind: 'idle' });
  const full = hub.capacity_pct >= FULL_PCT;
  const picked = pickedItems(items);

  const submit = async () => {
    setState({ kind: 'saving' });
    try {
      const pledge = await createPledge(hub.id, { items: picked, notes }, { apiBase, token });
      setState({ kind: 'done', pledge });
    } catch (e) {
      setState({ kind: 'error', message: e.status === 401 ? 'Please sign in to pledge.' : e.message });
    }
  };

  if (state.kind === 'done') {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Thank you!</Text>
        <Text style={styles.body}>
          {hub.name} is expecting {itemsText(state.pledge.items)}. Drop off at {hub.address}.
        </Text>
        <Button title="Done" onPress={() => onDone?.(state.pledge)} />
      </View>
    );
  }

  const needs = hub.supplies.filter((s) => s.need > 0);
  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text style={styles.title}>Drop off at {hub.name}</Text>
      <Text style={styles.body}>{hub.address}</Text>
      {full ? (
        <Text style={styles.error}>This hub is full and isn't taking drop-offs right now. Try a hub that needs your items.</Text>
      ) : (
        <>
          <Text style={styles.body}>
            {needs.length ? `Most needed: ${needs.map((s) => `${LABELS[s.category]} (${s.need})`).join(', ')}` : 'No urgent needs; any of these help.'}
          </Text>
          <ItemPicker value={items} onChange={setItems} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="When will you drop off? (optional)"
            maxLength={500}
            style={styles.input}
          />
          {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}
          <Button
            title={state.kind === 'saving' ? 'Sending…' : `Pledge ${picked.reduce((n, i) => n + i.quantity, 0)} items`}
            onPress={submit}
            disabled={!picked.length || state.kind === 'saving'}
          />
        </>
      )}
      {onCancel && <Button title="Back" variant="secondary" onPress={onCancel} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, color: colors.text },
});
