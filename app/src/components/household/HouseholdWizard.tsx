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
import { AddressAutocomplete } from './AddressAutocomplete';
import { useSyncContext } from '../../hooks/useSync';
import { initialPets, petOptions, summarizePets, peopleError, type PetCounts } from '../../utils/household';
import { backendCapabilities, unsupportedLabels } from '../../constants/capabilities';
export const blankHousehold: HouseholdInput = { name: 'My household', adults: 1, children: 0, pets: 0, petTypes: '', needs: [], otherNeeds: '', hasCar: false, canDrive: false, seats: 0, needsTransport: false, needsShelter: false, needsFood: false, location: { label: '' }, locationMode: 'home', homeLocation: { label: '' } };
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
  const initialLocationMode = initial?.locationMode ?? (initial?.location.label.startsWith('Current location') ? 'current' : 'home');
  const [locationMode, setLocationMode] = useState<'home' | 'current'>(initialLocationMode);
  const [homeLocation, setHomeLocation] = useState<HouseholdInput['location']>(initial?.homeLocation ?? (initialLocationMode === 'home' ? initial?.location ?? { label: '' } : { label: '' }));
  const [step, setStep] = useState(0); const [error, setError] = useState(''); const [locating, setLocating] = useState(false);
  const sync = useSyncContext(); const client = useQueryClient();
  useEffect(() => { if (!form.disasterId && disasters.data?.length === 1) setForm(current => ({ ...current, disasterId: disasters.data![0]!.id })); }, [disasters.data, form.disasterId]);
  const set = <K extends keyof HouseholdInput>(key: K, value: HouseholdInput[K]) => setForm(f => ({ ...f, [key]: value }));
  function setHomeAddress(location: HouseholdInput['location']) { setHomeLocation(location); setLocationMode('home'); setForm(current => ({ ...current, location, locationMode: 'home', homeLocation: location })); }
  function useHomeAddress() { setLocationMode('home'); setForm(current => ({ ...current, location: homeLocation, locationMode: 'home', homeLocation })); }
  const mutation = useMutation({ mutationFn: (data: HouseholdInput) => initial ? adapter.updateHousehold(data) : adapter.createHousehold(data), onSuccess: async data => { client.setQueryData(['household'], data); await client.invalidateQueries({ queryKey: ['plan'] }); router.dismissAll(); router.navigate(initial ? '/profile' : '/plan'); } });
  const petTotal = Object.values(pets).reduce((total, count) => total + count, 0);
  function next() {
    setError('');
    if (step === 0) { const issue = peopleError(Number(people), children === '' ? NaN : Number(children)); if (issue) { setError(issue); return; } }
    if (step === 1 && (petTotal > 30 || Object.values(pets).some(count => !Number.isInteger(count) || count < 0))) { setError('Enter whole pet counts, up to 30 pets in total.'); return; }
    if (step === 1 && pets.Other > 0 && other.trim().length === 0) { setError('Tell us which other pets you have.'); return; }
    if (step === 3 && config.mode === 'api' && (!coordinate(form.location) || !form.disasterId)) { setError('Choose a disaster and select a suggested address or use your current location.'); return; }
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
      const location = { label: `Current location · ${address}`, latitude, longitude };
      setLocationMode('current'); setForm(current => ({ ...current, location, locationMode: 'current', homeLocation }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not find your location. Enter your address instead.'); } finally { setLocating(false); }
  }
  function save() {
    const issue = peopleError(Number(people), children === '' ? NaN : Number(children)); if (issue) { setError(issue); setStep(0); return; }
    if (config.mode === 'api' && !form.disasterId) { setError('Choose the disaster this household needs support for.'); return; }
    if (config.mode === 'api' && !coordinate(form.location)) { setError('Select a suggested address or use your current location before saving.'); return; }
    if (form.location.label.trim().length < 5) { setError('Enter your full street address or use your current location.'); return; }
    const parsed = householdInputSchema.safeParse({ ...form, locationMode, homeLocation: homeLocation.label.trim().length >= 2 ? homeLocation : undefined, name: initial?.name || 'My household', adults: Number(people) - Number(children), children: Number(children), needs: form.needs.filter(need => need !== 'Wheelchair accessibility'), ...summarizePets(pets, other) });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join('\n')); return; }
    if (!sync.online) { setError('Reconnect before submitting your household profile.'); return; }
    mutation.mutate(parsed.data);
  }
  return <View style={{ gap: 24 }}>{!editing && <><Row style={{ justifyContent: 'space-between' }}><Metadata>Step {step + 1} of {steps.length}</Metadata><Text style={s.caption}>{steps[step]}</Text></Row><Row style={{ gap: 4 }}>{steps.map((title, i) => <View key={title} style={{ flex: 1, height: 3, backgroundColor: i <= step ? c.green : c.border }} />)}</Row></>}<Card>{!editing && <Title>{steps[step]}</Title>}
    {(editing || step === 0) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>People</Title>}{editing ? <><Text style={s.caption}>Children are included in the household total.</Text><Row style={{ gap: 16 }}><View style={{ flex: 1, gap: 8 }}><Text style={s.fieldLabel}>Total people</Text><TextInput accessibilityLabel="Number of people in household" value={people} onChangeText={setPeople} keyboardType="number-pad" style={s.input} /></View><View style={{ flex: 1, gap: 8 }}><Text style={s.fieldLabel}>Children</Text><TextInput accessibilityLabel="Number of children" value={children} onChangeText={setChildren} keyboardType="number-pad" style={s.input} /></View></Row></> : <><Body muted>Count everyone who lives with you. Children are included in the total.</Body><Field title="Number of people in household" value={people} onChangeText={setPeople} numeric /><Field title="Number of children" value={children} onChangeText={setChildren} numeric /></>}</View>}
    {(editing || step === 1) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>Pets</Title>}{!editing && <Body muted>Choose your pets and adjust the number of each. Leave all counts at zero if you have none.</Body>}{petOptions.map(option => <View key={option} style={{ gap: 12, paddingVertical: editing ? 0 : 8 }}><Row style={{ justifyContent: 'space-between' }}>{option === 'Other' ? <Pressable accessibilityRole="button" accessibilityLabel="Other pets" onPress={() => { setOtherSelected(!otherSelected); if (otherSelected) setPets(p => ({ ...p, Other: 0 })); }} style={{ minHeight: 48, justifyContent: 'center', flex: 1 }}><Text style={{ fontFamily: type.medium, color: c.green, fontSize: 17 }}>Other pets {otherSelected ? '−' : '+'}</Text></Pressable> : <Text style={{ fontFamily: type.medium, fontSize: 17, color: c.ink, flex: 1 }}>{option}</Text>}{(option !== 'Other' || otherSelected) && <Row style={{ gap: 4 }}><Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${option.toLowerCase()}`} disabled={pets[option] === 0} onPress={() => setPets(p => ({ ...p, [option]: Math.max(0, p[option] - 1) }))} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pets[option] ? 1 : 0.35 }}><Icon name="minus" size={18} /></Pressable><Text accessibilityLabel={`${option} count`} style={{ fontFamily: type.medium, fontSize: 20, color: c.ink, minWidth: 24, textAlign: 'center' }}>{pets[option]}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Add one ${option.toLowerCase()}`} disabled={petTotal >= 30} onPress={() => setPets(p => ({ ...p, [option]: p[option] + 1 }))} style={{ width: 48, height: 48, backgroundColor: c.greenLight, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: petTotal >= 30 ? 0.35 : 1 }}><Icon name="plus" color={c.green} size={18} /></Pressable></Row>}</Row>{option === 'Other' && otherSelected && <Field title="What other pets do you have?" value={other} onChangeText={text => setOther(text.slice(0, 40))} placeholder="For example, turtles or guinea pigs" />}</View>)}<Text style={s.caption}>{petTotal} {petTotal === 1 ? 'pet' : 'pets'} in total{!backendCapabilities.detailedPets ? '. ' + unsupportedLabels.detailedPets : ''}</Text></View>}
    {(editing || step === 2) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>Support needs</Title>}{!editing && <Body muted>Select the practical help you need. No diagnoses or medical histories.</Body>}{needs.map(need => <Toggle key={need} title={need} selected={form.needs.includes(need)} onPress={() => set('needs', form.needs.includes(need) ? form.needs.filter(n => n !== need) : [...form.needs, need])} />)}<Field title="Other essential needs (optional)" value={form.otherNeeds} onChangeText={value => set('otherNeeds', value.slice(0, 300))} multiline /><Title small>Transportation</Title><Toggle title="We have access to a car" selected={form.hasCar} onPress={() => set('hasCar', !form.hasCar)} /><Toggle title="We need transportation assistance" detail={unsupportedLabels.transportationPreference} selected={form.needsTransport} disabled={!backendCapabilities.transportationPreference} onPress={() => set('needsTransport', !form.needsTransport)} /></View>}
    {(editing || step === 3) && <View style={{ gap: 16, marginTop: editing ? 16 : 0 }}>{editing && <Title small>Location</Title>}{!editing && <Body muted>Choose your home address or share your current location for shelter planning.</Body>}<Text style={s.fieldLabel}>Use location from</Text><View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden' }}><Pressable accessibilityRole="button" accessibilityLabel="Home address" accessibilityState={{ selected: locationMode === 'home' }} onPress={useHomeAddress} style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: locationMode === 'home' ? c.greenLight : c.white, opacity: pressed ? 0.75 : 1 })}><Icon name="home" size={16} color={locationMode === 'home' ? c.green : c.muted} /><Text style={{ color: locationMode === 'home' ? c.green : c.muted, fontFamily: type.medium, fontSize: 13 }}>Home address</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Current location" accessibilityState={{ selected: locationMode === 'current' }} onPress={() => void locate()} style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: locationMode === 'current' ? c.greenLight : c.white, borderLeftWidth: 1, borderLeftColor: c.border, opacity: pressed ? 0.75 : 1 })}><Icon name="navigation" size={16} color={locationMode === 'current' ? c.green : c.muted} /><Text style={{ color: locationMode === 'current' ? c.green : c.muted, fontFamily: type.medium, fontSize: 13 }}>Current location</Text></Pressable></View>{locationMode === 'home' ? <AddressAutocomplete value={homeLocation.label} onChangeText={value => setHomeAddress({ label: value })} onSelect={suggestion => setHomeAddress({ label: suggestion.label, latitude: suggestion.latitude, longitude: suggestion.longitude })} /> : <View style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.white }}><Row><Icon name="map-pin" color={c.green} /><Text style={{ flex: 1, color: c.ink, fontFamily: type.medium, fontSize: 14 }}>{form.location.label}</Text></Row><Button title="Update current location" variant="secondary" icon="refresh-cw" onPress={() => void locate()} busy={locating} /></View>}{config.mode === 'api' && <View style={{ gap: 12 }}><Title small>Disaster</Title>{disasters.isError && <Notice danger>{disasters.error.message}</Notice>}{!disasters.isPending && !disasters.data?.length && <Notice>No active disasters have been loaded by the coordination service.</Notice>}{disasters.data?.map(disaster => <Toggle key={disaster.id} title={disaster.name} detail={disaster.affectedArea} selected={form.disasterId === disaster.id} onPress={() => set('disasterId', disaster.id)} />)}<Text style={s.caption}>The full street address stays on this device. The selected map point and required household details are sent to the coordination service.</Text></View>}</View>}
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
