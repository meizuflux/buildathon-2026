import React, { useState } from 'react';
import { View, Text, Linking } from 'react-native';
import { Page, Card, Row, Title, Body, Badge, Attribution, QueryState, Empty, Button, Notice, date, useUI, Icon, Metadata } from '../../components/common/ui';
import { usePlan } from '../../hooks/queries';
import { useSyncContext } from '../../hooks/useSync';
import { type } from '../../constants/theme';
import { coordinate } from '../../utils/shelter';
export default function Plan() {
  const { c, s } = useUI(); const query = usePlan(); const sync = useSyncContext(); const [error, setError] = useState('');
  const plan = query.data; const shelter = plan?.shelterAssignment; const destination = coordinate(shelter?.coordinates);
  const available = shelter?.status === 'confirmed';
  async function openMap() {
    if (!shelter) return;
    const target = destination ? `${destination.latitude},${destination.longitude}` : shelter.address;
    if (!target) return;
    try { await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`); } catch { setError('Could not open your maps app. Use the address shown here.'); }
  }
  return <Page title="My Plan" subtitle="Your shelter allocation and next steps."><QueryState query={query}>{plan?.warnings?.map((warning, index) => <Notice key={index} danger={warning.severity === 'critical'}>{warning.message}</Notice>)}{shelter ? <>
    <Card><Row style={{ justifyContent: 'space-between' }}><Row><Icon name="home" color={c.green} /><Metadata>Assigned shelter</Metadata></Row><Badge value={shelter.status} /></Row><Text accessibilityRole="header" style={{ fontFamily: type.semibold, fontSize: 21, lineHeight: 27, letterSpacing: 0, color: c.ink }}>{shelter.name}</Text><Body>{shelter.address ?? shelter.description}</Body><Body muted>{shelter.description}</Body><View style={{ gap: 8 }}><Button title="Get directions" variant="accent" icon="navigation" onPress={() => void openMap()} disabled={!shelter.address && !destination} /><Button title="View nearby map" variant="secondary" icon="map" href="/" /></View><Text style={s.caption}>Plan updated {date(plan?.updatedAt)}</Text><Attribution source={shelter.source} /></Card>
    {plan?.officialInstructions?.length ? <Card><Title small>Official instructions</Title>{plan.officialInstructions.map((instruction, index) => <View key={index} style={{ gap: 6 }}><Body>{instruction.text}</Body><Attribution source={instruction.source} /></View>)}</Card> : null}
    {(!available || !sync.online || query.isError) && <Notice danger={shelter.status === 'unavailable' || shelter.status === 'cancelled'}>{!available ? 'This shelter is not confirmed as available. Contact your coordination team before travelling.' : 'Saved assignment. Reconfirm shelter availability before travelling.'}</Notice>}
    {plan?.actionSteps?.length ? <View style={{ gap: 8 }}><Title small>Next steps</Title>{plan.actionSteps.map(step => <Card key={step.id}><Row style={{ alignItems: 'flex-start' }}><Icon name="circle" color={c.blue} size={19} /><View style={{ flex: 1, gap: 3 }}><Title small>{step.title}</Title><Body muted>{step.detail}</Body></View></Row></Card>)}</View> : null}
    {plan?.transportationAssignment && <Card><Row style={{ justifyContent: 'space-between' }}><Title small>Transportation</Title><Badge value={plan.transportationAssignment.status} /></Row><Body>{plan.transportationAssignment.name}</Body><Body muted>{plan.transportationAssignment.description}</Body></Card>}
    {plan?.additionalResources?.length ? <View style={{ gap: 8 }}><Title small>Additional resources</Title>{plan.additionalResources.map((resource, index) => <Card key={`${resource.name}-${index}`}><Row style={{ justifyContent: 'space-between' }}><Title small>{resource.name}</Title><Badge value={resource.status} /></Row><Body muted>{resource.description}</Body></Card>)}</View> : null}
    <Button title="Ask about this assignment" href="/assistance" variant="secondary" icon="message-square" />
  </> : <Empty title="No shelter assigned yet" message="Your shelter and its location will appear here when the coordination team makes an assignment." action={<Button title="Household details" href="/profile" variant="secondary" />} />}</QueryState>{!!error && <Notice danger>{error}</Notice>}</Page>;
}
