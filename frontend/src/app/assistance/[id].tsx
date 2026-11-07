import { colors as c } from '../../constants/theme';
import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Page, Card, Row, Title, Body, Button, Badge, QueryState, date, s } from '../../components/common/ui';
import { adapter } from '../../services/adapters';
import { useAssistance } from '../../hooks/queries';
import { useSyncContext } from '../../hooks/useSync';
import { categoryLabels } from '../../types/models';
export default function RequestDetails() { const { id } = useLocalSearchParams<{ id: string }>(); const summary = useAssistance(); const sync = useSyncContext(); const query = useQuery({ queryKey: ['requests', id], queryFn: () => adapter.getAssistanceRequestDetails(id), enabled: sync.ready && !!id, initialData: () => summary.data?.find(r => r.id === id), initialDataUpdatedAt: summary.dataUpdatedAt }); const request = query.data;
  return <Page title={request ? categoryLabels[request.category] : 'Request details'} action={<Button title="Back to requests" href="/assistance" variant="secondary" icon="arrow-left" />}><QueryState query={query}>{request && <><Card><Row style={{ justifyContent: 'space-between' }}><Title>Request progress</Title><Badge value={request.status} /></Row><Body>{request.people} people, {request.organization ?? 'No organization assigned yet'}</Body><Body>{request.description || 'No description added.'}</Body><Body muted>Requirements shared: {request.requirements.join(', ') || 'None'}</Body><Body muted>Location: {request.location?.label ?? 'Not included'}</Body><Text style={s.caption}>Submitted {date(request.createdAt)}, Updated {date(request.updatedAt)}</Text></Card><Card><Title>Status history</Title>{[...request.timeline].reverse().map((event, i) => <View key={`${event.timestamp}-${i}`} style={{ gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: c.border }}><Badge value={event.status} /><Body>{event.message}</Body><Text style={s.caption}>{date(event.timestamp)}</Text></View>)}</Card><Button title="Report a problem with this support" href="/reports" variant="secondary" /></>}</QueryState></Page>;
}
