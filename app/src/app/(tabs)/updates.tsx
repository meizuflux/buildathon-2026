import React, { useState } from 'react';
import { View } from 'react-native';
import { Page, Card, Row, Icon, Title, Body, Badge, Attribution, Button, Metadata, QueryState, Empty, label, useUI, type IconName } from '../../components/common/ui';
import { useUpdates } from '../../hooks/queries';
const icons: Record<string, IconName> = { warning: 'alert-triangle', government: 'info', organization: 'users', request: 'message-circle', resource: 'home', plan: 'map' };
export default function Updates() {
	const { c } = useUI(); const query = useUpdates(); const [filter, setFilter] = useState('all');
	const feed = [...(query.data ?? [])].filter(update => filter === 'all' || update.source.kind === filter).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
	const filters = [{ id: 'all', title: 'All updates' }, { id: 'government', title: 'Government' }, { id: 'organization', title: 'Relief organizations' }, { id: 'unverified', title: 'Unverified reports' }];
	return <Page title="Updates" subtitle="Latest information for your area.">
		<Row style={{ flexWrap: 'wrap', gap: 8 }}>{filters.map(item => <Button key={item.id} title={item.title} variant={filter === item.id ? 'primary' : 'secondary'} onPress={() => setFilter(item.id)} />)}</Row>
		<QueryState query={query}>{feed.length ? <View style={{ gap: 10 }}>{feed.map(update => <Card key={update.id} style={update.category === 'warning' ? { backgroundColor: c.redLight, borderColor: c.redLight } : undefined}>
			<Row style={{ alignItems: 'flex-start' }}><Icon name={icons[update.category] ?? 'info'} color={update.category === 'warning' ? c.red : c.blue} size={20} /><View style={{ flex: 1, gap: 6 }}>
				<Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Metadata>{label(update.category)}</Metadata><Badge value={update.source.verified ? 'verified' : 'unverified'} /></Row>
				<Title small>{update.title}</Title><Body>{update.message}</Body><Attribution source={update.source} timestamp={update.timestamp} />
				{update.requestId ? <Button title="View support request" href="/assistance" variant="ghost" icon="arrow-right" /> : update.planId ? <Button title="View current plan" href="/plan" variant="ghost" icon="arrow-right" /> : null}
			</View></Row>
		</Card>)}</View> : <Empty title="Nothing here yet" message="Updates from your coordination team will appear here. Refresh to check for new information." />}</QueryState>
	</Page>;
}
