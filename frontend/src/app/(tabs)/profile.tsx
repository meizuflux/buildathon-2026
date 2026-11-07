import { type } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import React from 'react';
import { View, Text } from 'react-native';
import { Page, Card, Row, Icon, Title, Body, Button, Metadata, QueryState, Empty, Notice, date, useUI } from '../../components/common/ui';
import { useHousehold } from '../../hooks/queries';
export default function Profile() { const { c, s } = useUI(); const theme = useTheme();
  const query = useHousehold(); const household = query.data;
  return <Page title="Household" subtitle="Keep your needs and resources up to date as circumstances change." action={<Button title={household ? 'Edit household' : 'Set up household'} href="/(onboarding)" icon="edit-2" />}>
    <QueryState query={query}>{household ? <><Card><Row><View style={s.iconTile}><Icon name="users" size={25} /></View><View style={{ gap: 6 }}><Title>Your household</Title><Text style={s.caption}>Updated {date(household.updatedAt)}</Text></View></Row><View style={s.divider} /><Row style={{ gap: 36, flexWrap: 'wrap' }}>{[{ name: 'People', value: household.adults + household.children }, { name: 'Children', value: household.children }, { name: 'Pets', value: household.pets }].map(item => <View key={item.name} style={{ gap: 6, padding: 12 }}><Text style={{ fontFamily: type.semibold, fontSize: 32, lineHeight: 36, color: c.ink }}>{item.value}</Text><Body muted>{item.name}</Body></View>)}</Row>{household.pets > 0 && <Body muted>Pet types: {household.petTypes}</Body>}</Card>
    <Card><Title small>Essential needs</Title><Body>{[...household.needs.filter(need => need !== 'Wheelchair accessibility'), household.otherNeeds].filter(Boolean).join(', ') || 'No additional needs selected.'}</Body></Card>
    <Card><Title small>Transportation</Title><Body>{household.hasCar ? 'Car available' : 'No car available'}</Body><Body muted>{household.needsTransport ? 'Transportation assistance requested' : 'No transportation assistance requested'}</Body></Card>
    <Card><Title small>Home address or shared location</Title><Row><Icon name="map-pin" /><Title small>{household.location.label}</Title></Row><Body muted>{household.location.latitude !== undefined ? 'Optional coordinates are included in your profile.' : 'Address entered manually. No device coordinates shared.'}</Body></Card></> : <Empty title="No household profile" message="Add the people, resources, and essential needs your coordination team should know about." action={<Button title="Create household profile" href="/(onboarding)" />} />}</QueryState>
    <Card><Title small>Appearance</Title><Row style={{ flexWrap: 'wrap' }}>{(['system', 'light', 'dark'] as const).map(mode => <Button key={mode} title={mode === 'system' ? 'Use device setting' : mode === 'light' ? 'Day' : 'Night'} variant={theme.mode === mode ? 'primary' : 'ghost'} onPress={() => theme.setMode(mode)} />)}</Row></Card>
    <Notice>Household and emergency information is saved on this device for offline access. Use a trusted device and share only essential needs.</Notice>
  </Page>;
}
