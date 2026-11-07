import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { API_BASE, createDonation } from './api';
import { LocationStatus, MatchCard } from './parts';
import { Button, ItemPicker, colors, itemsText, pickedItems } from './shared';
import useDeviceLocation from './useDeviceLocation';

/**
 * Offer items to donate. The system picks the best drop-off hub: one nearby that needs them and
 * has storage space.
 * Props: token (family login), apiBase, place (a useDeviceLocation() result; created here if omitted), onDone(pledge).
 */
export default function DonateForm({ token, apiBase = API_BASE, place: placeProp, onDone }) {
  const ownPlace = useDeviceLocation(undefined, { enabled: !placeProp });
  const place = placeProp ?? ownPlace;
  const [items, setItems] = useState({});
  const [notes, setNotes] = useState('');
  const [state, setState] = useState({ kind: 'idle' });
  const picked = pickedItems(items);

  const submit = async () => {
    setState({ kind: 'saving' });
    try {
      const { lat, lng } = place.coords;
      const pledge = await createDonation({ items: picked, latitude: lat, longitude: lng, notes }, { apiBase, token });
      setState({ kind: 'done', pledge });
      setItems({});
      setNotes('');
    } catch (e) {
      setState({ kind: 'error', message: e.status === 401 ? 'Please sign in to donate.' : e.message });
    }
  };

  if (state.kind === 'done') {
    const { pledge } = state;
    return (
      <ScrollView contentContainerStyle={styles.box}>
        <Text style={styles.title}>Thank you!</Text>
        <MatchCard title="Drop off at" hub={pledge.hub} match={pledge.match}>
          <Text style={styles.body}>They're expecting {itemsText(pledge.items)}.</Text>
        </MatchCard>
        {onDone && <Button title="View my activity" variant="secondary" onPress={() => onDone(pledge)} />}
        <Button title="Donate something else" variant="secondary" onPress={() => setState({ kind: 'idle' })} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text style={styles.title}>Donate</Text>
      <Text style={styles.body}>
        Tell us what you can give. We'll send you to the nearby hub that needs it most and has room for it.
      </Text>
      <LocationStatus place={place} />
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
        title={state.kind === 'saving' ? 'Finding a hub…' : 'Find where to drop off'}
        onPress={submit}
        disabled={!picked.length || state.kind === 'saving' || place.status !== 'ready'}
      />
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
