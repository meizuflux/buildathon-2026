import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Card, Row, Button, Title, Body, Field, Toggle, Notice, Metadata, Icon, useUI } from '../common/ui';
import { type } from '../../constants/theme';
import { householdInputSchema, needs, type HouseholdInput, type Household } from '../../types/models';
import { config } from '../../constants/config';
import { useDisasters } from '../../hooks/queries';
import { coordinate } from '../../utils/shelter';
import { adapter } from '../../services/adapters';
import { useSyncContext } from '../../hooks/useSync';
import { initialPets, petOptions, summarizePets, peopleError, type PetCounts } from '../../utils/household';
export const blankHousehold: HouseholdInput = { name: 'My household', adults: 1, children: 0, pets: 0, petTypes: '', needs: [], otherNeeds: '', hasCar: false, canDrive: false, seats: 0, needsTransport: false, needsShelter: false, needsFood: false, location: { label: '' } };
const steps = ['Your household', 'Your pets', 'Support needs', 'Your address', 'Review & save'];
export function HouseholdWizard({ initial }: { initial?: Household | null }) {
  const { c, s } = useUI();
  const editing = Boolean(initial); const disasters = useDisasters();
  const [form, setForm] = useState<HouseholdInput>(initial ?? blankHousehold);
  const [people, setPeople] = useState(String(initial ? initial.adults + initial.children : 1));
  const [children, setChildren] = useState(String(initial?.children ?? 0));
  const [pets, setPets] = useState<PetCounts>(() => initialPets(initial).counts);
  const [other, setOther] = useState(() => initialPets(initial).other);
  const [otherSelected, setOtherSelected] = useState(() => initialPets(initial).counts.Other > 0);
  const [latitude, setLatitude] = useState(initial?.location.latitude === undefined ? '' : String(initial.location.latitude));
  const [longitude, setLongitude] = useState(initial?.location.longitude === undefined ? '' : String(initial.location.longitude));
  const [step, setStep] = useState(0); const [error, setError] = useState(''); const [locating, setLocating] = useState(false);
  const sync = useSyncContext(); const client = useQueryClient();
  useEffect(() => { if (!form.disasterId && disasters.data?.length === 1) setForm(current => ({ ...current, disasterId: disasters.data![0]!.id })); }, [disasters.data, form.disasterId]);
  const set = <K extends keyof HouseholdInput>(key: K, value: HouseholdInput[K]) => { setForm(f => ({ ...f, [key]: value })); if (key === 'location') { const location = value as HouseholdInput['location']; setLatitude(location.latitude === undefined ? '' : String(location.latitude)); setLongitude(location.longitude === undefined ? '' : String(location.longitude)); } };
  const mutation = useMutation({ mutationFn: (data: HouseholdInput) => initial ? adapter.updateHousehold(data) : adapter.createHousehold(data), onSuccess: async data => { client.setQueryData(['household'], data); await client.invalidateQueries({ queryKey: ['plan'] }); router.dismissAll(); router.navigate(initial ? '/profile' : '/plan'); } });
  const petTotal = Object.values(pets).reduce((total, count) => total + count, 0);
  function next() {
    setError('');
    if (step === 0) { const issue = peopleError(Number(people), children === '' ? NaN : Number(children)); if (issue) { setError(issue); return; } }
    if (step === 1 && (petTotal > 30 || Object.values(pets).some(count => !Number.isInteger(count) || count < 0))) { setError('Enter whole pet counts, up to 30 pets in total.'); return; }
    if (step === 1 && pets.Other > 0 && other.trim().length === 0) { setError('Tell us which other pets you have.'); return; }
    if (step === 3 && config.mode === 'api' && (!coordinate(form.location) || !form.disasterId)) { setError('Choose a disaster and add valid map coordinates or use current location.'); return; }
    if (step === 3 && form.location.label.trim().length < 5) { setError('Enter your full street address, including city and ZIP code, or use your current location.'); return; }
    setStep(step + 1);
  }
  async function locate() {
    setLocating(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission was not granted. You can enter your address instead.');
      const { coords: { latitude, longitude } } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let address = `Current location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
      if (Platform.OS !== 'web') { try { const [place] = await Location.reverseGeocodeAsync({ latitude, longitude }); if (place) address = [place.streetNumber, place.street, place.city, place.region, place.postalCode].filter(Boolean).join(' ') || address; } catch {} }
      set('location', { label: address, latitude, longitude });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not find your location. Enter your address instead.'); } finally { setLocating(false); }
  }
  function save() {
    const issue = peopleError(Number(people), children === '' ? NaN : Number(children)); if (issue) { setError(issue); setStep(0); return; }
    if (config.mode === 'api' && !form.disasterId) { setError('Choose the disaster this household needs support for.'); return; }
    if (config.mode === 'api' && !coordinate(form.location)) { setError('Add coordinates for your address, or use current location.'); return; }
    if (form.location.label.trim().length < 5) { setError('Enter your full street address or use your current location.'); return; }
    const parsed = householdInputSchema.safeParse({ ...form, name: initial?.name || 'My household', adults: Number(people) - Number(children), children: Number(children), needs: form.needs.filter(need => need !== 'Wheelchair accessibility'), ...summarizePets(pets, other) });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join('\n')); return; }
    if (!sync.online) { setError('Reconnect before submitting your household profile.'); return; }
    mutation.mutate(parsed.data);
  }
  return <View style={{ gap: 24 }}>{!editing && <><Row style={{ justifyContent: 'space-between' }}><Metadata>Step {step + 1} of {steps.length}</Metadata><Text style={s.caption}>{steps[step]}</Text></Row><Row style={{ gap: 4 }}>{steps.map((title, i) => <View key={title} style={{ flex: 1, height: 3, backgroundColor: i <= step ? c.green : c.border }} />)}</Row></>}<Card>{!editing && <Title>{steps[step]}</Title>}
    {(editing || step === 0) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>People</Title>}{editing ? <><Text style={s.caption}>Children are included in the household total.</Text><Row style={{ gap: 16 }}><View style={{ flex: 1, gap: 8 }}><Text style={s.fieldLabel}>Total people</Text><TextInput accessibilityLabel="Number of people in household" value={people} onChangeText={setPeople} keyboardType="number-pad" style={s.input} /></View><View style={{ flex: 1, gap: 8 }}><Text style={s.fieldLabel}>Children</Text><TextInput accessibilityLabel="Number of children" value={children} onChangeText={setChildren} keyboardType="number-pad" style={s.input} /></View></Row></> : <><Body muted>Count everyone who lives with you. Children are included in the total.</Body><Field title="Number of people in household" value={people} onChangeText={setPeople} numeric /><Field title="Number of children" value={children} onChangeText={setChildren} numeric /></>}</View>}
    {(editing || step === 1) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>Pets</Title>}{!editing && <Body muted>Choose your pets and adjust the number of each. Leave all counts at zero if you have none.</Body>}{petOptions.map(option => <View key={option} style={{ gap: 12, paddingVertical: editing ? 0 : 8 }}><Row style={{ justifyContent: 'space-between' }}>{option === 'Other' ? <Pressable accessibilityRole="button" accessibilityLabel="Other pets" onPress={() => { setOtherSelected(!otherSelected); if (otherSelected) setPets(p => ({ ...p, Other: 0 })); }} style={{ minHeight: 48, justifyContent: 'center', flex: 1 }}><Text style={{ fontFamily: type.medium, color: c.green, fontSize: 17 }}>Other pets {otherSelected ? '−' : '+'}</Text></Pressable> : <Text style={{ fontFamily: type.medium, fontSize: 17, color: c.ink, flex: 1 }}>{option}</Text>}{(option !== 'Other' || otherSelected) && <Row style={{ gap: 4 }}><Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${option.toLowerCase()}`} disabled={pets[option] === 0} onPress={() => setPets(p => ({ ...p, [option]: Math.max(0, p[option] - 1) }))} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pets[option] ? 1 : 0.35 }}><Icon name="minus" size={18} /></Pressable><Text accessibilityLabel={`${option} count`} style={{ fontFamily: type.medium, fontSize: 20, color: c.ink, minWidth: 24, textAlign: 'center' }}>{pets[option]}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Add one ${option.toLowerCase()}`} disabled={petTotal >= 30} onPress={() => setPets(p => ({ ...p, [option]: p[option] + 1 }))} style={{ width: 48, height: 48, backgroundColor: c.greenLight, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: petTotal >= 30 ? 0.35 : 1 }}><Icon name="plus" color={c.green} size={18} /></Pressable></Row>}</Row>{option === 'Other' && otherSelected && <Field title="What other pets do you have?" value={other} onChangeText={text => setOther(text.slice(0, 40))} placeholder="For example, turtles or guinea pigs" />}</View>)}<Text style={s.caption}>{petTotal} {petTotal === 1 ? 'pet' : 'pets'} in total</Text></View>}
    {(editing || step === 2) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>Support needs</Title>}{!editing && <Body muted>Select the practical help you need. No diagnoses or medical histories.</Body>}{needs.map(need => <Toggle key={need} title={need} selected={form.needs.includes(need)} onPress={() => set('needs', form.needs.includes(need) ? form.needs.filter(n => n !== need) : [...form.needs, need])} />)}<Field title="Other essential needs (optional)" value={form.otherNeeds} onChangeText={value => set('otherNeeds', value.slice(0, 300))} multiline /><Title small>Transportation</Title><Toggle title="We have access to a car" selected={form.hasCar} onPress={() => set('hasCar', !form.hasCar)} /><Toggle title="We need transportation assistance" detail={config.mode === 'api' ? 'Saved on this device. Message Support to ask the team for transportation.' : undefined} selected={form.needsTransport} onPress={() => set('needsTransport', !form.needsTransport)} /></View>}
    {(editing || step === 3) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>Home address</Title>}{!editing && <Body muted>Add your actual home address: street number, street, apartment or unit, city, state, and ZIP code.</Body>}<Field title="Full home address" value={form.location.label} onChangeText={value => set('location', { label: value })} placeholder="123 Main St, Apt 2, Wilmington, NC 28401" multiline />{config.mode === 'api' && <View style={{ gap: 12 }}><Title small>Disaster</Title>{disasters.isError && <Notice danger>{disasters.error.message}</Notice>}{!disasters.isPending && !disasters.data?.length && <Notice>No active disasters have been loaded by the coordination service.</Notice>}{disasters.data?.map(disaster => <Toggle key={disaster.id} title={disaster.name} detail={disaster.affectedArea} selected={form.disasterId === disaster.id} onPress={() => set('disasterId', disaster.id)} />)}<Text style={s.caption}>A map position is required for shelter allocation. Enter coordinates for your address or use current location.</Text><Row style={{ gap: 16 }}><View style={{ flex: 1 }}><Field title="Latitude" value={latitude} onChangeText={value => { setLatitude(value); setForm(f => ({ ...f, location: { ...f.location, latitude: value.trim() === '' ? undefined : Number(value) } })); }} placeholder="27.95" /></View><View style={{ flex: 1 }}><Field title="Longitude" value={longitude} onChangeText={value => { setLongitude(value); setForm(f => ({ ...f, location: { ...f.location, longitude: value.trim() === '' ? undefined : Number(value) } })); }} placeholder="-82.46" /></View></Row><Text style={s.caption}>Street address and detailed pet counts stay on this device. The service receives your map position, people counts, pet presence, care needs, and car availability.</Text></View>}<Text style={s.caption}>Or share your device location to compare distance to your shelter. Editing the address clears previously shared coordinates.</Text><Button title="Use my current location" icon="map-pin" variant="secondary" onPress={() => void locate()} busy={locating} />{form.location.latitude !== undefined && <><Body muted>Location attached: {form.location.latitude.toFixed(5)}, {form.location.longitude?.toFixed(5)}</Body><Button title="Remove shared coordinates" variant="ghost" onPress={() => set('location', { label: form.location.label })} /></>}</View>}
    {!editing && step === 4 && <><Notice>These details will be shared with Haven’s coordination service.</Notice>{[
      { title: 'People', detail: `${people} people, including ${children} children`, step: 0 },
      { title: 'Pets', detail: summarizePets(pets, other).petTypes || 'No pets', step: 1 },
      { title: 'Support', detail: [...form.needs.filter(need => need !== 'Wheelchair accessibility'), form.otherNeeds, form.hasCar ? 'Car available' : '', form.needsTransport ? 'Transportation requested' : ''].filter(Boolean).join(', ') || 'No additional support selected', step: 2 },
      { title: 'Address', detail: form.location.label, step: 3 },
    ].map(section => <View key={section.title} style={{ paddingVertical: 12, gap: 4 }}><Row style={{ justifyContent: 'space-between' }}><Title small>{section.title}</Title><Button title={`Edit ${section.title.toLowerCase()}`} variant="ghost" onPress={() => setStep(section.step)} /></Row><Body>{section.detail}</Body></View>)}</>}
    {!!error && <Notice danger>{error}</Notice>}{mutation.error && <Notice danger>{mutation.error.message}</Notice>}
    <Row style={{ justifyContent: 'space-between', marginTop: 16 }}><Button title={!editing && step > 0 ? 'Back' : 'Cancel'} variant="ghost" onPress={() => !editing && step > 0 ? setStep(step - 1) : router.replace('/profile')} />{!editing && step < steps.length - 1 ? <Button title="Continue" onPress={next} disabled={locating} /> : <Button title={editing ? "Save changes" : "Save household profile"} onPress={save} busy={mutation.isPending} disabled={!sync.online || locating} />}</Row>
  </Card><Text style={s.caption}>Saved on this device for offline access. Share only the details needed to arrange support.</Text></View>;
}
