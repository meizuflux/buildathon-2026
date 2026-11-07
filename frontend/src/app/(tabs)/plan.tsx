import React, { useState } from 'react';
import { View, Text, Linking } from 'react-native';
import * as Location from 'expo-location';
import { Page, Row, Title, Body, Badge, Attribution, QueryState, Empty, Button, Notice, date, useUI, Icon } from '../../components/common/ui';
import ShelterMap from '../../components/maps/ShelterMap';
import { usePlan, useHousehold } from '../../hooks/queries';
import { useSyncContext } from '../../hooks/useSync';
import { type } from '../../constants/theme';
import { coordinate, distanceMiles, type Coordinate } from '../../utils/shelter';
export default function Plan() {
  const { c, s } = useUI(); const query = usePlan(); const household = useHousehold(); const sync = useSyncContext();
  const [sharedPosition, setSharedPosition] = useState<Coordinate | null>(null); const [locating, setLocating] = useState(false); const [error, setError] = useState('');
  const plan = query.data; const shelter = plan?.shelterAssignment;
  const destination = coordinate(shelter?.coordinates);
  const origin = sharedPosition ?? coordinate(household.data?.location);
  const miles = origin && destination ? distanceMiles(origin, destination) : null;
  const available = shelter?.status === 'confirmed';
  async function locate() {
    setError(''); setLocating(true);
    try { const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') throw new Error('Location permission was not granted. You can still view the shelter address.'); const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); setSharedPosition(position.coords); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to get your location.'); } finally { setLocating(false); }
  }
  async function openMap() {
    if (!shelter) return;
    const target = destination ? `${destination.latitude},${destination.longitude}` : shelter.address;
    if (!target) return;
    try { await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`); } catch { setError('Could not open your maps app. Use the address shown here.'); }
  }
  return <Page title="Your shelter"><QueryState query={query}>{shelter ? <>
    <View style={{ gap: 12 }}><Row style={{ justifyContent: 'space-between' }}><Row><Icon name="home" color={c.green} /><Text style={s.sectionLabel}>Shelter assignment</Text></Row><Badge value={shelter.status} /></Row><Text accessibilityRole="header" style={{ fontFamily: type.semibold, fontSize: 26, lineHeight: 30, letterSpacing: -0.4, color: c.ink }}>{shelter.name}</Text><Body>{shelter.description}</Body><Text style={s.caption}>Updated {date(plan?.updatedAt)}</Text></View>
    {(!available || !sync.online || query.isError) && <Notice danger={shelter.status === 'unavailable' || shelter.status === 'cancelled'}>{!available ? 'This shelter is not confirmed as available. Contact your coordination team before travelling.' : 'Saved assignment. Reconfirm shelter availability before travelling.'}</Notice>}
    {destination ? <View style={{ gap: 12 }}><Row style={{ justifyContent: 'space-between' }}><Title small>Where to go</Title></Row><View style={{ marginHorizontal: -24 }}><ShelterMap origin={origin} destination={destination} name={shelter.name} /></View><Row style={{ gap: 24, flexWrap: 'wrap' }}><Row><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.blue }} /><Text style={s.caption}>Shared location</Text></Row><Row><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.green }} /><Text style={s.caption}>Shelter</Text></Row></Row><View style={{ paddingVertical: 12, gap: 4 }}>{miles !== null ? <><Text style={{ fontFamily: type.semibold, fontSize: 32, lineHeight: 36, color: c.ink }}>{miles < 0.1 ? '< 0.1' : miles.toFixed(1)} <Text style={{ fontSize: 16, fontFamily: type.family }}>mi away</Text></Text><Text style={s.caption}>Straight-line estimate, not road distance or a safe route.</Text></> : <Body muted>Share your current location to estimate the distance.</Body>}</View>{!origin && <Button title="Use current location for distance" variant="secondary" onPress={() => void locate()} busy={locating} />}{sharedPosition && <Button title="Clear current location" variant="ghost" onPress={() => setSharedPosition(null)} />}</View> : <Notice>Shelter map coordinates have not been provided. Use the address below and check with your coordination team.</Notice>}
    <View style={{ gap: 12 }}><Title small>Shelter address</Title><Body>{shelter.address ?? 'Awaiting the shelter’s street address.'}</Body>{(shelter.address || destination) && <Button title="View in maps" variant="secondary" icon="map-pin" onPress={() => void openMap()} />}<Attribution source={shelter.source} /></View>
    <Button title="Ask about this assignment" href="/assistance" variant="ghost" />
  </> : <Empty title="No shelter assigned yet" message="Your shelter and its location will appear here when the coordination team makes an assignment." action={<Button title="Household details" href="/profile" variant="secondary" />} />}</QueryState>{!!error && <Notice danger>{error}</Notice>}</Page>;
}
