import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Page, Row, Icon, Title, Body, Attribution, Button, Metadata, Empty, QueryState, date, useUI, type IconName } from '../../components/common/ui';
import { type, type Palette } from '../../constants/theme';
import { useHousehold, usePlan, useAlerts, useReports } from '../../hooks/queries';
import { showSafetyStatus } from '../../utils/shelter';
import { config } from '../../constants/config';
import { DemoProvider } from '../../demo/store';
import PlanDashboard from '../../screens/PlanDashboard';

const hazards: { name: string; icon: IconName; matches: string[] }[] = [
  { name: 'All', icon: 'layers', matches: [] },
  { name: 'Hurricanes', icon: 'wind', matches: ['hurricane'] },
  { name: 'Storms', icon: 'cloud-lightning', matches: ['storm', 'tornado', 'cyclone'] },
  { name: 'Floods', icon: 'droplet', matches: ['flood'] },
  { name: 'Fire', icon: 'sun', matches: ['fire'] },
  { name: 'Quakes', icon: 'activity', matches: ['quake', 'seismic'] },
];
export default function Index() {
  return config.mode === 'mock' ? <DemoProvider><PlanDashboard /></DemoProvider> : <Home />;
}
function Home() {
  const { c, s } = useUI(); const local = createLocal(c);
  const household = useHousehold(); const plan = usePlan(); const alerts = useAlerts(); const reports = useReports();
  const [filter, setFilter] = useState('All'); const [expanded, setExpanded] = useState<string | null>(null);
  const hazard = hazards.find(h => h.name === filter)!;
  const feed = [...(alerts.data ?? [])].filter(a => !hazard.matches.length || hazard.matches.some(term => a.disasterType.toLowerCase().includes(term)))
    .sort((a, b) => ({ warning: 0, watch: 1, info: 2 }[a.severity] - { warning: 0, watch: 1, info: 2 }[b.severity]) || b.updatedAt.localeCompare(a.updatedAt));
  const latestSafe = [...(reports.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lead = feed[0];
  return <Page title="Around you">
    <QueryState query={household}><Pressable accessibilityRole="button" accessibilityLabel="Edit monitored household location" onPress={() => router.push(household.data ? '/profile' : '/(onboarding)')} style={local.location}>
      <Icon name="map-pin" color={c.green} size={18} /><View style={{ flex: 1, gap: 4 }}><Text style={local.locationText}>{household.data?.location.label ?? 'Choose your location'}</Text><Text style={s.caption}>{household.data ? 'Household location · tap to manage' : 'Add a household to personalize your updates'}</Text></View><Icon name="chevron-down" size={16} />
    </Pressable></QueryState>
    <Row style={{ justifyContent: 'space-between', gap: 8, marginTop: -8 }}>
      {hazards.map(item => <Pressable key={item.name} role="tab" accessibilityRole="tab" aria-selected={filter === item.name} accessibilityState={{ selected: filter === item.name }} accessibilityLabel={item.name} onPress={() => setFilter(item.name)} style={[local.filter, filter === item.name && { borderBottomColor: c.ink }]}><Text style={{ fontFamily: filter === item.name ? type.semibold : type.family, fontSize: 14, color: filter === item.name ? c.ink : c.muted }}>{item.name}</Text></Pressable>)}
    </Row>
    <QueryState query={alerts}>
      {lead ? <View style={{ gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}><Row><View style={{ width: 4, height: 20, backgroundColor: lead.severity === 'warning' ? c.red : lead.severity === 'watch' ? c.amber : c.blue }} /><Text style={local.alertLabel}>{lead.disasterType} / {lead.severity}</Text></Row><Text style={local.count}>{feed.length.toString().padStart(2, '0')} alert{feed.length === 1 ? '' : 's'}</Text></Row>
        <Text accessibilityRole="header" style={local.headline}>{lead.title}</Text>
        <Body>{lead.message}</Body>
        <Text style={s.caption}>{lead.area}</Text>
        <Attribution source={lead.source} timestamp={lead.updatedAt} />
        <View style={local.next}><Metadata>Next step</Metadata><Title small>{plan.data?.shelterAssignment ? 'Check your shelter assignment' : 'Check the source before acting'}</Title><Body>{plan.data?.shelterAssignment ? 'Review the shelter availability and address before travelling.' : 'Read the latest instructions from your local emergency authority. Conditions can change.'}</Body><Button title={plan.data ? 'View my shelter' : 'Read source updates'} href={plan.data ? '/plan' : '/updates'} /></View>

      </View> : <Empty title={filter === 'All' ? 'No alerts available' : `No ${filter.toLowerCase()} alerts available`} message="The absence of an alert does not establish safety. Check local official information and refresh for updates." />}
      {feed.length > 1 && <View style={{ gap: 24, marginTop: 32 }}><Title small>Also in this area</Title>{feed.slice(1).map(alert => <View key={alert.id} style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === alert.id }} accessibilityLabel={`Details for ${alert.title}`} onPress={() => setExpanded(expanded === alert.id ? null : alert.id)} style={{ minHeight: 48, justifyContent: 'center' }}><Row><View style={{ flex: 1, gap: 4 }}><Metadata>{alert.disasterType} / {alert.severity}</Metadata><Title small>{alert.title}</Title></View><Icon name={expanded === alert.id ? 'minus' : 'plus'} size={18} /></Row></Pressable>{expanded === alert.id && <><Body>{alert.message}</Body><Text style={s.caption}>{alert.area}</Text><Attribution source={alert.source} timestamp={alert.updatedAt} /></>}</View>)}</View>}
    </QueryState>
    {showSafetyStatus(filter, lead?.disasterType) && <View style={local.safety}><Row style={{ alignItems: 'flex-start' }}><Icon name="check-circle" color={c.green} /><View style={{ flex: 1, gap: 8 }}><Title small>Your safety status</Title><Body muted>{latestSafe?.kind === 'I am safe' ? `Safe report received ${date(latestSafe.createdAt)}. This is your last submitted status.` : 'Let your coordination team know how you are doing.'}</Body></View></Row><Button title="Mark myself safe" href="/reports" /><Text style={s.caption}>Review before sharing with the coordination service. This does not notify emergency dispatch.</Text><Button title="I need assistance" href="/assistance" variant="ghost" /></View>}
    {!household.data && !household.isPending && <Button title="Set up my household" href="/(onboarding)" variant="secondary" />}
  </Page>;
}
const createLocal = (c: Palette) => StyleSheet.create({
  location: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48, marginTop: -16 },
  locationText: { fontFamily: type.medium, fontSize: 15, lineHeight: 20, color: c.ink },
  filter: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  headline: { fontFamily: type.semibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, color: c.ink, maxWidth: 320 },
  alertLabel: { fontFamily: type.medium, fontSize: 13, lineHeight: 18, color: c.ink, flexShrink: 1 },
  count: { fontFamily: type.mono, fontSize: 11, color: c.muted },
  next: { paddingTop: 16, gap: 12, marginTop: 8 },
  map: { marginHorizontal: -24, marginTop: 8, backgroundColor: '#DFE7E5' },
  safety: { gap: 16, paddingTop: 8 },
});
