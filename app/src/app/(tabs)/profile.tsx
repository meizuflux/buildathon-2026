import { type } from '../../constants/theme';
import { config } from '../../constants/config';
import { useAuth } from '../../hooks/useAuth';
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Page, Card, Row, Icon, Title, Body, Button, Metadata, QueryState, Empty, Notice, date, useUI } from '../../components/common/ui';
import { useHousehold } from '../../hooks/queries';
export default function Profile() { const { c, s } = useUI(); const auth = useAuth();
  const query = useHousehold(); const household = query.data;
  const people = household ? `${household.adults} adult${household.adults === 1 ? '' : 's'}, ${household.children} child${household.children === 1 ? '' : 'ren'}` : '';
  const careNeeds = household ? [...household.needs, household.otherNeeds].filter(Boolean).join(', ') || 'No care needs listed' : '';
  const details = household ? [
    { title: 'People', value: people, icon: 'users' as const },
    { title: 'Care Needs', value: careNeeds, icon: 'heart' as const },
    { title: 'Pets', value: `${household.pets} ${household.pets === 1 ? 'pet' : 'pets'}${household.petTypes ? ` · ${household.petTypes}` : ''}`, icon: 'heart' as const },
    { title: 'Transportation', value: household.hasCar ? 'Car available' : 'No car available', detail: household.needsTransport ? 'Transportation assistance requested' : undefined, icon: 'truck' as const },
    { title: 'Location', value: household.location.label, detail: household.locationMode === 'current' ? 'Using current device location' : 'Using home address', icon: 'map-pin' as const },
  ] : [];
  return <Page title="Household" subtitle="Your household details for shelter planning and support.">
    <QueryState query={query}>{household ? <>
      <Text style={s.caption}>Updated {date(household.updatedAt)}</Text>
      <View style={{ gap: 8 }}>{details.map(item => <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`Edit ${item.title.toLowerCase()}`} onPress={() => router.push('/(onboarding)')}><Card style={{ padding: 12 }}><Row><Icon name={item.icon} color={c.muted} size={19} /><View style={{ flex: 1, gap: 2 }}><Metadata>{item.title}</Metadata><Text style={{ fontFamily: type.medium, fontSize: 14, lineHeight: 19, color: c.ink }}>{item.value}</Text>{item.detail && <Text style={s.caption}>{item.detail}</Text>}</View><Icon name="chevron-right" size={17} /></Row></Card></Pressable>)}</View>
      <Button title="Edit Details" href="/(onboarding)" variant="secondary" icon="edit-2" />
    </> : <Empty title="No household profile" message="Add the people, resources, and essential needs your coordination team should know about." action={<Button title="Create household profile" href="/(onboarding)" />} />}</QueryState>
    {config.mode === 'api' && <Button title="Sign out" variant="ghost" onPress={() => void auth.signOut().catch(() => {})} />}
  </Page>;
}
