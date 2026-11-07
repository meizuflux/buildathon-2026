import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Page, Card, Row, Title, Body, Badge, Attribution, Metadata, QueryState, Empty, Button, Toggle, Notice, date, s } from '../../components/common/ui';
import { AssignmentCard } from '../../components/plans/AssignmentCard';
import { usePlan } from '../../hooks/queries';
import { useSyncContext } from '../../hooks/useSync';
import { cache } from '../../storage/cache';
import { adapter } from '../../services/adapters';
import { colors as c } from '../../constants/theme';
import { config } from '../../constants/config';
export default function Plan() {
  const query = usePlan(); const plan = query.data; const sync = useSyncContext();
  const [checked, setChecked] = useState<string[]>([]); const [saved, setSaved] = useState(false); const [saveError, setSaveError] = useState(''); const [showHistory, setShowHistory] = useState(false);
  const wide = false;
  const key = `checklist:${config.mode}:${config.baseUrl}:${plan?.householdId}`;
  useEffect(() => { let live = true; setSaved(false); void cache.get<string[]>(key).then(value => { if (live) { setChecked(value ?? []); setSaved(true); } }).catch(() => { if (live) setSaveError('Your preparation checklist cannot be saved on this device.'); }); return () => { live = false; }; }, [key]);
  const history = useQuery({ queryKey: ['history'], queryFn: adapter.getPlanHistory, enabled: showHistory && sync.ready });
  async function toggle(id: string) { const next = checked.includes(id) ? checked.filter(x => x !== id) : [...checked, id]; setChecked(next); try { await cache.set(key, next); } catch { setSaveError('Checklist changes could not be saved.'); } }
  return <Page title="My plan" subtitle="Instructions and resource assignments from your coordination team." action={<Button title="Report a change" href="/reports" variant="secondary" icon="edit-3" />}><QueryState query={query}>{plan ? <>
    <Card><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><View style={{ gap: 8, flex: 1, minWidth: 0 }}><Metadata>{plan.disasterType}, version {plan.version}</Metadata><Title>{plan.summary}</Title><Text style={s.caption}>Updated {date(plan.updatedAt)}</Text></View><Badge value={plan.status} /></Row>{plan.changes.length > 0 && <View style={{ paddingTop: 16, gap: 5 }}><Title small>{plan.version > 1 ? `What changed in version ${plan.version}` : 'Your first plan'}</Title>{plan.changes.map((change, i) => <Body key={i}>{change}</Body>)}</View>}</Card>
    <Card><Title>Safety information</Title>{plan.officialInstructions.map((item, i) => <View key={i}><Body>{item.text}</Body><Attribution source={item.source} timestamp={plan.updatedAt} /></View>)}</Card>
    <Card><Row style={{ justifyContent: 'space-between' }}><Title>Preparation checklist</Title><Text style={s.caption}>{plan.actionSteps.filter(step => step.personalTask && checked.includes(step.id)).length}/{plan.actionSteps.filter(step => step.personalTask).length} personal tasks</Text></Row><Body muted>Your checklist is private to this device. Checking a task does not change official instructions or assignments.</Body>{saveError && <Notice danger>{saveError}</Notice>}{plan.actionSteps.map((step, i) => step.personalTask ? <Toggle key={step.id} selected={checked.includes(step.id)} title={`${i + 1}. ${step.title}`} detail={step.detail} onPress={() => { if (saved) void toggle(step.id); }} /> : <View key={step.id} style={{ padding: 16, gap: 8 }}><Title small>{i + 1}. {step.title}</Title><Body muted>{step.detail}</Body><Badge value="unverified" /></View>)}</Card>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}><AssignmentCard title="Shelter" icon="home" assignment={plan.shelterAssignment} stale={!sync.online || !!query.isError} /><AssignmentCard title="Transportation" icon="truck" assignment={plan.transportationAssignment} stale={!sync.online || !!query.isError} /></View>
    {plan.additionalResources.map((assignment, i) => <AssignmentCard key={i} title="Additional support" icon="package" assignment={assignment} stale={!sync.online || !!query.isError} />)}
    {plan.unmetNeeds.length > 0 && <Notice>Still awaiting support: {plan.unmetNeeds.join(', ')}. These needs have not been fulfilled.</Notice>}
    <Card><Title small>Information sources</Title>{plan.sources.map((source, i) => <Attribution key={i} source={source} />)}<Button title={showHistory ? 'Hide plan history' : 'View plan history'} variant="ghost" onPress={() => setShowHistory(!showHistory)} />{showHistory && <QueryState query={history}>{history.data?.map(version => <View key={`${version.id}-${version.version}`} style={{ gap: 6, paddingVertical: 12 }}><Title small>Version {version.version}, {date(version.updatedAt)}</Title><Body muted>{version.changes.join(' ')}</Body></View>)}</QueryState>}</Card>
  </> : <Empty title="Your plan is being prepared" message="Complete your household profile to get started. Plans are supplied by the coordination service." action={<Button title="Household profile" href="/profile" />} />}</QueryState></Page>;
}
