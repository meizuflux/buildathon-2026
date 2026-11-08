import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Page, Card, Row, Icon, Title, Body, Attribution, Button, Metadata, Empty, QueryState, date, useUI } from '../../components/common/ui';
import { type, type Palette } from '../../constants/theme';
import { useHousehold, usePlan, useAlerts, useReports } from '../../hooks/queries';
import { coordinate, distanceMiles } from '../../utils/shelter';
import ShelterMap from '../../components/maps/ShelterMap';
export default function Home() {
  const { c, s } = useUI(); const local = createLocal(c);
  const household = useHousehold(); const plan = usePlan(); const alerts = useAlerts(); const reports = useReports();
  const [expanded, setExpanded] = useState<string | null>(null);
  const feed = [...(alerts.data ?? [])].sort((a, b) => ({ warning: 0, watch: 1, info: 2 }[a.severity] - { warning: 0, watch: 1, info: 2 }[b.severity]) || b.updatedAt.localeCompare(a.updatedAt));
  const latestSafe = [...(reports.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lead = feed[0]; const shelter = plan.data?.shelterAssignment;
  const origin = coordinate(household.data?.location); const destination = coordinate(shelter?.coordinates);
  const miles = origin && destination ? distanceMiles(origin, destination) : null;
  return <Page title="Nearby" subtitle="Local information and nearby resources.">
    <QueryState query={household}><Pressable accessibilityRole="button" accessibilityLabel="Edit household location" onPress={() => router.push(household.data ? '/profile' : '/(onboarding)')} style={local.location}>
      <Icon name="map-pin" color={c.green} size={18} /><View style={{ flex: 1, gap: 2 }}><Text style={local.locationText}>{household.data?.location.label ?? 'Choose your location'}</Text><Text style={s.caption}>{household.data ? 'Household location' : 'Set up a household to personalize your plan'}</Text></View><Icon name="chevron-right" size={16} />
    </Pressable></QueryState>
    <QueryState query={plan}>{destination ? <Card style={local.mapCard}><ShelterMap origin={origin} destination={destination} name={shelter?.name ?? 'Assigned shelter'} height={144} /><View style={local.mapCaption}><Row style={{ flex: 1 }}><Icon name="map-pin" color={c.green} size={16} /><View style={{ flex: 1, gap: 2 }}><Text style={local.locationText}>{shelter?.name}</Text><Text style={s.caption}>{miles !== null ? `${miles.toFixed(1)} mi straight-line distance` : shelter?.address}</Text></View></Row><Icon name="chevron-right" size={16} /></View></Card> : <Empty title="Shelter map unavailable" message="A map will appear when your plan includes an assigned shelter with coordinates." action={<Button title="View my plan" href="/plan" variant="secondary" />} />}</QueryState>
    <QueryState query={alerts}>{lead ? <Card style={local.alertCard}>
      <Row style={{ alignItems: 'flex-start' }}><Icon name="alert-triangle" color={lead.severity === 'info' ? c.blue : c.red} size={20} /><View style={{ flex: 1, gap: 5 }}><Metadata>{lead.severity === 'info' ? 'Local update' : 'Local advisory'}</Metadata><Title small>{lead.title}</Title><Body>{lead.message}</Body><Text style={s.caption}>{lead.area}</Text><Attribution source={lead.source} timestamp={lead.updatedAt} /></View></Row>
      <Button title="View all updates" href="/updates" variant="ghost" icon="arrow-right" />
    </Card> : <Empty title="No local advisories" message="No alerts are available right now. Check official local information; the absence of an alert does not establish safety." />}
      {feed.length > 1 && <View style={{ gap: 8 }}><Title small>More nearby updates</Title>{feed.slice(1).map(alert => <Card key={alert.id}><Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === alert.id }} accessibilityLabel={`Details for ${alert.title}`} onPress={() => setExpanded(expanded === alert.id ? null : alert.id)}><Row><View style={{ flex: 1, gap: 4 }}><Metadata>{alert.disasterType} · {alert.severity}</Metadata><Title small>{alert.title}</Title></View><Icon name={expanded === alert.id ? 'minus' : 'plus'} size={18} /></Row></Pressable>{expanded === alert.id && <><Body>{alert.message}</Body><Text style={s.caption}>{alert.area}</Text><Attribution source={alert.source} timestamp={alert.updatedAt} /></>}</Card>)}</View>}
    </QueryState>
    {<Card style={local.safety}><Row style={{ alignItems: 'flex-start' }}><Icon name="check-circle" color={c.green} /><View style={{ flex: 1, gap: 6 }}><Title small>Your safety status</Title><Body muted>{latestSafe?.kind === 'I am safe' ? `Safe report received ${date(latestSafe.createdAt)}. This is your last submitted status.` : 'Let your coordination team know how you are doing.'}</Body></View></Row><Button title="Mark myself safe" href="/reports" /><Text style={s.caption}>This report goes to the coordination service, not emergency dispatch.</Text><Button title="I need assistance" href="/assistance" variant="secondary" /></Card>}
    {!household.data && !household.isPending && <Button title="Set up my household" href="/(onboarding)" variant="secondary" />}
  </Page>;
}
const createLocal = (c: Palette) => StyleSheet.create({
  location: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 50, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.white },
  locationText: { fontFamily: type.semibold, fontSize: 14, lineHeight: 18, color: c.ink },
  mapCard: { padding: 0, overflow: 'hidden', gap: 0 },
  mapCaption: { minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  alertCard: { backgroundColor: c.redLight, borderColor: c.redLight },
  safety: { gap: 12 },
});
