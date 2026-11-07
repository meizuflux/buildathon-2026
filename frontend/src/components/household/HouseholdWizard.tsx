import React, { useState } from 'react';
import { View, Text } from 'react-native';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Card, Row, Button, Title, Body, Field, Toggle, Notice, s, Eyebrow } from '../common/ui';
import { colors as c } from '../../constants/theme';
import { householdInputSchema, needs, type HouseholdInput, type Household } from '../../types/models';
import { adapter } from '../../services/adapters';
import { useSyncContext } from '../../hooks/useSync';
export const blankHousehold: HouseholdInput = { name: '', adults: 1, children: 0, pets: 0, petTypes: '', needs: [], otherNeeds: '', hasCar: false, canDrive: false, seats: 0, needsTransport: true, needsShelter: false, needsFood: false, location: { label: '' } };
const steps = ['Your family', 'Essential needs', 'Your resources', 'Your location', 'Review & save'];
export function HouseholdWizard({ initial }: { initial?: Household | null }) {
  const [form, setForm] = useState<HouseholdInput>(initial ?? blankHousehold); const [step, setStep] = useState(0); const [error, setError] = useState(''); const [locating, setLocating] = useState(false);
  const sync = useSyncContext(); const client = useQueryClient();
  const set = <K extends keyof HouseholdInput>(key: K, value: HouseholdInput[K]) => setForm(f => ({ ...f, [key]: value }));
  const mutation = useMutation({ mutationFn: (data: HouseholdInput) => initial ? adapter.updateHousehold(data) : adapter.createHousehold(data), onSuccess: async data => { client.setQueryData(['household'], data); await client.invalidateQueries({ queryKey: ['plan'] }); router.replace('/profile'); } });
  function next() {
    setError('');
    if (step === 0 && (!form.name.trim() || form.name.trim().length < 2 || form.adults < 1 || ![form.adults, form.children, form.pets].every(n => Number.isInteger(n) && n >= 0 && n <= 30) || (form.pets > 0 && !form.petTypes.trim()))) { setError('Add a household name, 1–30 adults, 0–30 children and pets, and your pet types when applicable.'); return; }
    if (step === 2 && form.hasCar && form.canDrive && (!Number.isInteger(form.seats) || form.seats < 1 || form.seats > 50)) { setError('Enter 1–50 available passenger seats.'); return; }
    if (step === 3 && form.location.label.trim().length < 2) { setError('Enter a town, neighborhood, or other useful location. Precise coordinates are optional.'); return; }
    setStep(step + 1);
  }
  async function locate() {
    setLocating(true); setError('');
    try { const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') throw new Error('Location permission was not granted. You can enter your location manually.'); const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); const { latitude, longitude } = position.coords; const places = await Location.reverseGeocodeAsync({ latitude, longitude }); const place = places[0]; set('location', { label: place ? [place.city, place.region].filter(Boolean).join(', ') || 'Shared location' : 'Shared location', latitude, longitude }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not find your location. Please enter it manually.'); } finally { setLocating(false); }
  }
  function save() {
    const parsed = householdInputSchema.safeParse({ ...form, name: form.name.trim(), petTypes: form.pets > 0 ? form.petTypes : '', canDrive: form.hasCar && form.canDrive, seats: form.hasCar && form.canDrive ? form.seats : 0 });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n')); return; }
    if (!sync.online) { setError('Reconnect before submitting your household profile.'); return; } mutation.mutate(parsed.data);
  }
  return <View style={{ gap: 20, maxWidth: 760, width: '100%', alignSelf: 'center' }}><Row style={{ gap: 6 }}>{steps.map((title, i) => <View key={title} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.green : c.border }} />)}</Row><Card><Eyebrow>STEP {step + 1} OF 5</Eyebrow><Title>{steps[step]}</Title><Body muted>Share only what your coordination team needs to arrange support.</Body>
    {step === 0 && <><Field title="Household name" value={form.name} onChangeText={value => set('name', value)} placeholder="e.g. The Morgan household" />{(['adults', 'children', 'pets'] as const).map(key => <Field key={key} title={key === 'adults' ? 'Adults (at least 1)' : key === 'children' ? 'Children' : 'Pets'} value={String(form[key])} numeric onChangeText={value => set(key, value === '' ? 0 : Number(value))} />)}{form.pets > 0 && <Field title="Pet types" value={form.petTypes} onChangeText={value => set('petTypes', value)} placeholder="e.g. 1 dog, 1 cat" />}</>}
    {step === 1 && <><Notice>We don’t need diagnoses or medication histories. Select only the practical support you need.</Notice>{needs.map(need => <Toggle key={need} title={need} selected={form.needs.includes(need)} onPress={() => set('needs', form.needs.includes(need) ? form.needs.filter(n => n !== need) : [...form.needs, need])} />)}<Field title="Other essential needs (optional, up to 300 characters)" value={form.otherNeeds} onChangeText={value => set('otherNeeds', value.slice(0, 300))} multiline /></>}
    {step === 2 && <><Toggle title="We have access to a car" selected={form.hasCar} onPress={() => setForm(f => ({ ...f, hasCar: !f.hasCar, canDrive: false, seats: 0 }))} />{form.hasCar && <><Toggle title="Someone in our household can drive" selected={form.canDrive} onPress={() => set('canDrive', !form.canDrive)} />{form.canDrive && <Field title="Available passenger seats" value={String(form.seats)} onChangeText={value => set('seats', Number(value))} numeric />}</>}{([{ key: 'needsTransport', title: 'We need transportation assistance' }, { key: 'needsShelter', title: 'We need free temporary shelter' }, { key: 'needsFood', title: 'We need food or water assistance' }] as const).map(item => <Toggle key={item.key} title={item.title} selected={form[item.key]} onPress={() => set(item.key, !form[item.key])} />)}</>}
    {step === 3 && <><Body>Enter a location manually or choose to share your current location. Precise location access is optional.</Body><Field title="Town, neighborhood, or address" value={form.location.label} onChangeText={value => set('location', { ...form.location, label: value })} placeholder="e.g. Wilmington, NC · Zone A" /><Button title="Use my current location" icon="map-pin" variant="secondary" onPress={() => void locate()} busy={locating} />{form.location.latitude !== undefined && <><Body muted>Coordinates included: {form.location.latitude.toFixed(3)}, {form.location.longitude?.toFixed(3)}</Body><Button title="Remove coordinates" variant="ghost" onPress={() => set('location', { label: form.location.label })} /></>}</>}
    {step === 4 && <><Notice>This profile will be shared with Haven’s coordination service. Review the details before saving.</Notice>{[
      { title: 'Family', detail: `${form.name}\n${form.adults} adults · ${form.children} children · ${form.pets} pets${form.pets ? ` (${form.petTypes})` : ''}`, step: 0 },
      { title: 'Essential needs', detail: [...form.needs, form.otherNeeds].filter(Boolean).join(' · ') || 'No additional needs selected', step: 1 },
      { title: 'Resources', detail: `${form.hasCar ? 'Car available' : 'No car'} · ${form.canDrive ? `${form.seats} passenger seats` : 'No driver indicated'}\nAssistance: ${[form.needsTransport && 'transportation', form.needsShelter && 'free shelter', form.needsFood && 'food & water'].filter(Boolean).join(', ') || 'None selected'}`, step: 2 },
      { title: 'Location', detail: `${form.location.label}${form.location.latitude !== undefined ? '\nCoordinates included' : '\nManual location only'}`, step: 3 },
    ].map(section => <View key={section.title} style={{ borderBottomWidth: 1, borderColor: c.border, paddingVertical: 14, gap: 8 }}><Row style={{ justifyContent: 'space-between' }}><Title small>{section.title}</Title><Button title="Edit" variant="ghost" onPress={() => setStep(section.step)} /></Row><Body>{section.detail}</Body></View>)}</>}
    {!!error && <Notice danger>{error}</Notice>}{mutation.error && <Notice danger>{mutation.error.message}</Notice>}
    <Row style={{ justifyContent: 'space-between', marginTop: 10 }}><Button title={step > 0 ? 'Back' : 'Cancel'} variant="ghost" onPress={() => step > 0 ? setStep(step - 1) : router.replace('/profile')} />{step < 4 ? <Button title="Continue" onPress={next} icon="arrow-right" /> : <Button title="Save household profile" onPress={save} busy={mutation.isPending} disabled={!sync.online} icon="check" />}</Row>
  </Card><Text style={s.caption}>Your profile is cached on this device for offline access. Avoid sharing unnecessary medical details.</Text></View>;
}
