import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle, Line, Text as MapText } from 'react-native-svg';
import { Page, Row, Icon, Title, Body, Attribution, Button, Metadata, Empty, QueryState, date, s, type IconName } from '../../components/common/ui';
import { colors as c, type } from '../../constants/theme';
import { useHousehold, usePlan, useAlerts, useReports } from '../../hooks/queries';
import { config } from '../../constants/config';

const hazards: { name: string; icon: IconName; matches: string[] }[] = [
  { name: 'All', icon: 'layers', matches: [] },
  { name: 'Storms', icon: 'wind', matches: ['storm', 'hurricane', 'tornado', 'cyclone'] },
  { name: 'Floods', icon: 'droplet', matches: ['flood'] },
  { name: 'Fire', icon: 'sun', matches: ['fire'] },
  { name: 'Quakes', icon: 'activity', matches: ['quake', 'seismic'] },
];
function AreaSurvey({ area }: { area: string }) {
  return <View style={local.map} accessibilityLabel={`Area schematic for ${area}. Not a geographic map. No live hazard boundaries or routes are shown.`}>
    <Svg width="100%" height={224} viewBox="0 0 360 224" accessible={false}>
      <Path d="M0 0H360V224H0Z" fill="#DFE7E5" />
      {[0, 1, 2, 3, 4, 5, 6].map(i => <Path key={i} d={`M${-110 + i * 23} -15 C${120 + i * 16} 10, ${-75 + i * 28} 110, ${140 + i * 20} 240`} stroke={c.silt} strokeWidth="0.7" opacity="0.65" fill="none" />)}
      <Path d="M275 -10 C220 42 301 78 251 124 S238 183 286 234 L360 234 L360 -10Z" fill="#C2D9D8" />
      <Path d="M275 -10 C220 42 301 78 251 124 S238 183 286 234" stroke="#8FB8B5" strokeWidth="1" fill="none" />
      <Path d="M-10 163 L98 143 L157 103 L238 80 M106 -10 L133 85 L157 103 L197 224 M-10 54 L133 85 L226 145 L267 173" stroke="#F5F7F7" strokeWidth="7" fill="none" />
      <Path d="M-10 163 L98 143 L157 103 L238 80 M106 -10 L133 85 L157 103 L197 224" stroke="#BAC8C9" strokeWidth="1" fill="none" />
      <Circle cx="157" cy="103" r="22" fill={c.green} opacity="0.09" />
      <Circle cx="157" cy="103" r="6" fill={c.green} stroke={c.white} strokeWidth="3" />
      <MapText x="18" y="28" fontSize="10" fill={c.muted}>AREA SCHEMATIC</MapText>
      <MapText x="278" y="28" fontSize="11" fill={c.ink}>N ↑</MapText>
      <Line x1="18" y1="200" x2="54" y2="200" stroke={c.muted} strokeWidth="2" />
      <MapText x="64" y="204" fontSize="10" fill={c.muted}>NOT TO SCALE</MapText>
    </Svg>
    <View style={{ padding: 12, gap: 4 }}><Text style={[s.caption, { color: c.ink }]}>{area}</Text><Text style={s.caption}>Illustrative terrain · no live boundaries or routes</Text></View>
  </View>;
}
export default function Home() {
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
      {hazards.map(item => <Pressable key={item.name} accessibilityRole="tab" accessibilityState={{ selected: filter === item.name }} accessibilityLabel={item.name} onPress={() => setFilter(item.name)} style={[local.filter, filter === item.name && { borderBottomColor: c.ink }]}><Text style={{ fontFamily: filter === item.name ? type.semibold : type.family, fontSize: 14, color: filter === item.name ? c.ink : c.muted }}>{item.name}</Text></Pressable>)}
    </Row>
    <QueryState query={alerts}>
      {lead ? <View style={{ gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}><Row><View style={{ width: 6, height: 6, backgroundColor: c.ember }} /><Text style={local.alertLabel}>{lead.severity.toUpperCase()} / {lead.disasterType.toUpperCase()}</Text></Row><Text style={local.count}>{feed.length.toString().padStart(2, '0')} alert{feed.length === 1 ? '' : 's'}</Text></Row>
        <Text accessibilityRole="header" style={local.headline}>{lead.title}</Text>
        <Body>{lead.message}</Body>
        <Text style={s.caption}>{lead.area}</Text>
        <Attribution source={lead.source} timestamp={lead.updatedAt} />
        <View style={local.next}><Metadata>Next step</Metadata><Title small>{plan.data?.actionSteps[0]?.title ?? 'Check the source before acting'}</Title><Body>{plan.data?.actionSteps[0]?.detail ?? 'Read the latest instructions from your local emergency authority. A watch or warning may change as conditions develop.'}</Body><Button title={plan.data ? 'Open my response plan' : 'Read source updates'} href={plan.data ? '/plan' : '/updates'} /></View>
        <AreaSurvey area={lead.area} />
      </View> : <Empty title={filter === 'All' ? 'No alerts available' : `No ${filter.toLowerCase()} alerts available`} message="The absence of an alert does not establish safety. Check local official information and refresh for updates." />}
      {feed.length > 1 && <View style={{ gap: 24, marginTop: 32 }}><Title small>Also in this area</Title>{feed.slice(1).map(alert => <View key={alert.id} style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === alert.id }} accessibilityLabel={`Details for ${alert.title}`} onPress={() => setExpanded(expanded === alert.id ? null : alert.id)} style={{ minHeight: 48, justifyContent: 'center' }}><Row><View style={{ flex: 1, gap: 4 }}><Metadata>{alert.disasterType} / {alert.severity}</Metadata><Title small>{alert.title}</Title></View><Icon name={expanded === alert.id ? 'minus' : 'plus'} size={18} /></Row></Pressable>{expanded === alert.id && <><Body>{alert.message}</Body><Text style={s.caption}>{alert.area}</Text><Attribution source={alert.source} timestamp={alert.updatedAt} /></>}</View>)}</View>}
    </QueryState>
    <View style={local.safety}><Row style={{ alignItems: 'flex-start' }}><Icon name="check-circle" color={c.green} /><View style={{ flex: 1, gap: 8 }}><Title small>Your safety status</Title><Body muted>{latestSafe?.kind === 'I am safe' ? `Safe report received ${date(latestSafe.createdAt)}. This is your last submitted status.` : 'Let your coordination team know how you are doing.'}</Body></View></Row><Button title="Mark myself safe" href="/reports" /><Text style={s.caption}>{config.mode === 'mock' ? 'Demo submission only. ' : ''}Review before sharing with the coordination service. This does not notify emergency dispatch.</Text><Button title="I need assistance" href="/assistance/new" variant="ghost" /></View>
    {!household.data && !household.isPending && <Button title="Set up my household" href="/(onboarding)" variant="secondary" />}
  </Page>;
}
const local = StyleSheet.create({
  location: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48, marginTop: -16 },
  locationText: { fontFamily: type.medium, fontSize: 15, lineHeight: 20, color: c.ink },
  filter: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  headline: { fontFamily: type.semibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, color: c.ink, maxWidth: 320 },
  alertLabel: { fontFamily: type.mono, fontSize: 11, lineHeight: 16, color: c.red, flexShrink: 1 },
  count: { fontFamily: type.mono, fontSize: 11, color: c.muted },
  next: { backgroundColor: c.greenLight, padding: 20, gap: 12, marginTop: 8 },
  map: { marginHorizontal: -24, marginTop: 8, backgroundColor: '#DFE7E5' },
  safety: { gap: 16, paddingTop: 8 },
});
