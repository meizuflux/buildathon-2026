import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { API_BASE, DEMO_CENTER, createRequest } from './api';
import { Button, ItemPicker, colors, itemsText, pickedItems } from './shared';

/**
 * Ask for supplies. A government worker picks a hub and either delivers or sets them aside for pickup.
 * Props: token (family login), lat, lng (where the citizen is), apiBase, onDone(request).
 */
export default function RequestForm({ token, lat = DEMO_CENTER.lat, lng = DEMO_CENTER.lng, apiBase = API_BASE, onDone }) {
  const [items, setItems] = useState({});
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState({ kind: 'idle' });
  const picked = pickedItems(items);

  const submit = async () => {
    setState({ kind: 'saving' });
    try {
      const created = await createRequest({ items: picked, latitude: lat, longitude: lng, address, notes }, { apiBase, token });
      setState({ kind: 'done', request: created });
      setItems({});
      setNotes('');
    } catch (e) {
      setState({ kind: 'error', message: e.status === 401 ? 'Please sign in to request supplies.' : e.message });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text style={styles.title}>Request supplies</Text>
      <Text style={styles.body}>
        Tell us what you need. A response worker will deliver it or set it aside at a nearby hub for you to pick up.
      </Text>
      {state.kind === 'done' && (
        <Text style={styles.success}>
          Request sent for {itemsText(state.request.items)}. Track it under My activity.
        </Text>
      )}
      <ItemPicker value={items} onChange={setItems} />
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="Address or where to find you (for delivery)"
        maxLength={200}
        style={styles.input}
      />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything we should know? e.g. infant, no car (optional)"
        maxLength={500}
        multiline
        style={[styles.input, styles.multiline]}
      />
      {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}
      <Button
        title={state.kind === 'saving' ? 'Sending…' : 'Send request'}
        onPress={submit}
        disabled={!picked.length || state.kind === 'saving'}
      />
      {state.kind === 'done' && onDone && <Button title="View my activity" variant="secondary" onPress={() => onDone(state.request)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted },
  success: { fontSize: 14, color: colors.ok, fontWeight: '600' },
  error: { fontSize: 14, color: colors.danger },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, color: colors.text },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
});
