import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { API_BASE, createCustom } from './api';
import { LocationStatus } from './parts';
import { Button, Chip, colors } from './shared';
import useDeviceLocation from './useDeviceLocation';

const KINDS = [
  ['request', 'I need something'],
  ['donation', 'I want to donate something'],
];

/**
 * Donate or ask for something that isn't in the standard list (e.g. a wheelchair). A government
 * worker reviews it and replies with a hub and instructions.
 * Props: token (family login), apiBase, place (a useDeviceLocation() result; created here if omitted), onDone(item).
 */
export default function CustomForm({ token, apiBase = API_BASE, place: placeProp, onDone }) {
  const ownPlace = useDeviceLocation(undefined, { enabled: !placeProp });
  const place = placeProp ?? ownPlace;
  const [kind, setKind] = useState('request');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [state, setState] = useState({ kind: 'idle' });

  const submit = async () => {
    setState({ kind: 'saving' });
    try {
      const { lat, lng } = place.coords;
      const item = await createCustom(
        { kind, description: description.trim(), quantity, latitude: lat, longitude: lng, notes },
        { apiBase, token },
      );
      setState({ kind: 'done', item });
      setDescription('');
      setQuantity(1);
      setNotes('');
    } catch (e) {
      setState({ kind: 'error', message: e.status === 401 ? 'Please sign in first.' : e.message });
    }
  };

  if (state.kind === 'done') {
    return (
      <ScrollView contentContainerStyle={styles.box}>
        <Text style={styles.title}>Sent for review</Text>
        <View style={styles.reviewBox}>
          <Text style={styles.reviewText}>
            A response worker will review your {state.item.kind === 'donation' ? 'offer' : 'request'} for{' '}
            {state.item.quantity} × {state.item.description} and tell you which hub to use. Check My activity for their
            reply.
          </Text>
        </View>
        {onDone && <Button title="View my activity" variant="secondary" onPress={() => onDone(state.item)} />}
        <Button title="Send something else" variant="secondary" onPress={() => setState({ kind: 'idle' })} />
      </ScrollView>
    );
  }

  const valid = description.trim().length >= 2;
  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text style={styles.title}>Something else</Text>
      <Text style={styles.body}>
        Need or have something that isn't in the list, like a wheelchair, a crib, or phone chargers? Describe it and a
        response worker will review it.
      </Text>
      <View style={styles.row}>
        {KINDS.map(([key, label]) => (
          <Chip key={key} label={label} active={kind === key} onPress={() => setKind(key)} />
        ))}
      </View>
      <LocationStatus place={place} />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={kind === 'request' ? 'What do you need? e.g. Wheelchair' : 'What are you donating? e.g. Baby crib'}
        maxLength={200}
        style={styles.input}
      />
      <View style={styles.quantityRow}>
        <Text style={styles.label}>Quantity</Text>
        <Pressable accessibilityLabel="Less" onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={styles.stepper}>
          <Text style={styles.stepperText}>−</Text>
        </Pressable>
        <Text style={styles.count}>{quantity}</Text>
        <Pressable accessibilityLabel="More" onPress={() => setQuantity((q) => Math.min(10000, q + 1))} style={styles.stepper}>
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Details that help the reviewer (optional)"
        maxLength={500}
        multiline
        style={[styles.input, styles.multiline]}
      />
      {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}
      <Button
        title={state.kind === 'saving' ? 'Sending…' : 'Send for review'}
        onPress={submit}
        disabled={!valid || state.kind === 'saving' || place.status !== 'ready'}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted },
  label: { flex: 1, fontSize: 15, color: colors.text },
  error: { fontSize: 14, color: colors.danger },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 15, color: colors.text },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperText: { fontSize: 18, color: colors.text },
  count: { minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
  reviewBox: { backgroundColor: '#f5f3ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#ddd6fe' },
  reviewText: { fontSize: 14, color: '#4c1d95' },
});
