// Official broadcasts, the coordinator conversation, and system notices, each shown separately.
// Message states are sending / sent / failed only. We never claim delivered or read.
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { type } from '../../constants/theme';
import { clock } from '../../demo/time';
import type { Broadcast, Message, SystemNotice } from '../../demo/types';
import { Icon } from '../common/ui';
import { InlineNotice, LinkButton, Mono, StatusLabel, useDash } from './parts';

export function Official({ broadcasts }: { broadcasts: Broadcast[] }) {
  const { c, s } = useDash();
  if (!broadcasts.length) return <Text style={s.secondary}>No official broadcasts yet.</Text>;
  return (
    <>
      {broadcasts.map((b, i) => (
        <View key={b.id} style={{ gap: 4, paddingTop: i ? 16 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
          <StatusLabel tone={b.severity === 'critical' ? 'critical' : b.severity === 'attention' ? 'attention' : 'neutral'}
            icon={b.severity === 'info' ? 'info' : 'alert-triangle'}>
            {b.severity === 'critical' ? 'Urgent' : b.severity === 'attention' ? 'Important' : 'Information'}
          </StatusLabel>
          <Text style={s.h3}>{b.title}</Text>
          <Text style={s.body}>{b.body}</Text>
          <Text style={s.secondary}>From {b.authority}</Text>
          <Mono>{clock(b.at)} · {b.id}</Mono>
        </View>
      ))}
    </>
  );
}

/** The conversation with the coordination desk. */
export function Thread({ messages, online, live, onRetry }: { messages: Message[]; online: boolean; live: boolean; onRetry: (m: Message) => void }) {
  const { s } = useDash();
  return (
    <>
      {live && <Text style={[s.secondary, { textAlign: 'center' }]}>Messages go to the coordination team as help requests. Replies aren’t shown in this app yet.</Text>}
      {messages.length === 0 && <Text style={[s.secondary, { textAlign: 'center' }]}>No messages yet.</Text>}
      <View style={{ gap: 16 }} aria-live="polite">
        {messages.map((m) => <Bubble key={m.id} message={m} onRetry={() => onRetry(m)} />)}
      </View>
      {!online && <InlineNotice tone="attention" icon="wifi-off">Offline. Messages can’t send until you reconnect.</InlineNotice>}
    </>
  );
}

/** Chat composer: a text field and a send button. The draft is cleared only after it is handed off. */
export function Composer({ sending, onSend }: { sending: boolean; onSend: (body: string) => void }) {
  const { c } = useDash();
  const [draft, setDraft] = useState('');
  const ready = !!draft.trim() && !sending;
  const send = () => { const body = draft.trim(); if (!body || sending) return; onSend(body); setDraft(''); };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
      <TextInput value={draft} onChangeText={setDraft} multiline accessibilityLabel="Message a coordinator"
        placeholder="Message the coordination desk" placeholderTextColor={c.muted}
        style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: c.fieldBorder, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
          fontFamily: type.family, fontSize: 16, lineHeight: 22, color: c.text, backgroundColor: c.surface }} />
      <Pressable accessibilityRole="button" accessibilityLabel={sending ? 'Sending message' : 'Send message'} disabled={!ready} onPress={send}
        style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }, (!ready || pressed) && { opacity: ready ? 0.7 : 0.4 }]}>
        <Icon name="send" size={19} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}

function Bubble({ message: m, onRetry }: { message: Message; onRetry: () => void }) {
  const { c, s } = useDash();
  const mine = m.from === 'household';
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        <Text style={[s.secondary, { fontFamily: type.medium, color: c.text }]}>{m.author}</Text>
        <Text style={s.secondary}>· {m.role}</Text>
        {m.simulated && <Text style={{ fontFamily: type.medium, fontSize: 12, color: c.presenterText, backgroundColor: c.presenter, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>Simulated reply</Text>}
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4,
        backgroundColor: mine ? c.green : c.surface, borderWidth: 1, borderColor: m.state === 'failed' ? c.red : mine ? c.green : c.border }}>
        <Text style={[s.body, mine && { color: c.onPrimary }]}>{m.body}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
        <Mono>{clock(m.at)}</Mono>
        {m.state === 'sending' && <Text style={s.secondary}>Sending…</Text>}
        {m.state === 'sent' && <StatusLabel tone="neutral" icon="check">Sent</StatusLabel>}
        {m.state === 'failed' && <StatusLabel tone="critical" icon="alert-circle">Not sent. Your message is kept.</StatusLabel>}
      </View>
      {m.state === 'failed' && <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}><LinkButton title="Retry sending" icon="rotate-cw" onPress={onRetry} /></View>}
    </View>
  );
}

export function Changes({ notices }: { notices: SystemNotice[] }) {
  const { c, s } = useDash();
  if (!notices.length) return <Text style={s.secondary}>No changes yet.</Text>;
  return (
    <>
      {notices.map((n, i) => (
        <View key={n.id} style={{ gap: 4, paddingTop: i ? 16 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
          <Text style={s.h3}>{n.title}</Text>
          {n.lines.map((line) => <Text key={line} style={s.body}>{line}</Text>)}
          <Mono>{clock(n.at)} · Haven system notice</Mono>
        </View>
      ))}
    </>
  );
}
