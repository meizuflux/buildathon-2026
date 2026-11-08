// Updates: official broadcasts, the coordinator conversation, and system notices, kept separate.
// Message states are sending / sent / failed only. We never claim delivered or read.
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { type } from '../../constants/theme';
import { clock } from '../../demo/time';
import type { Broadcast, Message, SystemNotice } from '../../demo/types';
import { Icon, type IconName } from '../common/ui';
import { Action, Heading, InlineNotice, LinkButton, Mono, StatusLabel, useDash } from './parts';

type Tab = 'official' | 'coordinator' | 'changes';

export function Updates({ broadcasts, messages, notices, online, tab, onTab, onSend, onComposerFocus }: {
  broadcasts: Broadcast[]; messages: Message[]; notices: SystemNotice[]; online: boolean;
  tab: Tab; onTab: (t: Tab) => void; onSend: (body: string, retryId?: string) => void; onComposerFocus: (focused: boolean) => void;
}) {
  const { c, s } = useDash();
  const tabs: { id: Tab; label: string; icon: IconName; count: number }[] = [
    { id: 'official', label: 'Official', icon: 'radio', count: broadcasts.length },
    { id: 'coordinator', label: 'Coordinator', icon: 'message-circle', count: messages.length },
    { id: 'changes', label: 'Changes', icon: 'refresh-cw', count: notices.length },
  ];
  return (
    <View style={s.section} nativeID="updates">
      <Heading>Updates</Heading>
      <View style={[s.panel, { padding: 0, gap: 0, overflow: 'hidden' }]}>
        <View role="tablist" aria-label="Update type" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border }}>
          {tabs.map((t) => {
            const on = t.id === tab;
            return (
              <Pressable key={t.id} role="tab" accessibilityRole="tab" aria-selected={on} accessibilityState={{ selected: on }} onPress={() => onTab(t.id)}
                style={({ pressed }) => [{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
                  borderBottomWidth: 3, borderBottomColor: on ? c.green : 'transparent', paddingHorizontal: 4 }, pressed && { opacity: 0.7 }]}>
                <Icon name={t.icon} size={16} color={on ? c.green : c.muted} />
                <Text style={{ fontFamily: on ? type.semibold : type.medium, fontSize: 15, color: on ? c.green : c.muted }}>{t.label}</Text>
                <Text style={{ fontFamily: type.family, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums'] }}>{t.count}</Text>
              </Pressable>
            );
          })}
        </View>
        <View role="tabpanel" style={{ padding: 20, gap: 16 }}>
          {tab === 'official' && <Official broadcasts={broadcasts} />}
          {tab === 'coordinator' && <Coordinator messages={messages} online={online} onSend={onSend} onFocus={onComposerFocus} />}
          {tab === 'changes' && <Changes notices={notices} />}
        </View>
      </View>
    </View>
  );
}

function Official({ broadcasts }: { broadcasts: Broadcast[] }) {
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

function Coordinator({ messages, online, onSend, onFocus }: { messages: Message[]; online: boolean; onSend: (body: string, retryId?: string) => void; onFocus: (f: boolean) => void }) {
  const { c, s } = useDash();
  const [draft, setDraft] = useState('');
  const sending = messages.some((m) => m.state === 'sending');
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  };
  return (
    <>
      <View style={{ gap: 12 }} aria-live="polite">
        {messages.map((m) => <Bubble key={m.id} message={m} onRetry={() => onSend(m.body, m.id)} />)}
      </View>
      {!online && <InlineNotice tone="attention" icon="wifi-off">Offline. Messages can’t send until you reconnect.</InlineNotice>}
      <View style={{ gap: 8 }}>
                <TextInput value={draft} onChangeText={setDraft} multiline accessibilityLabel="Message a coordinator"
          placeholder="Ask about access, space, or transport" placeholderTextColor={c.muted}
          onFocus={() => onFocus(true)} onBlur={() => onFocus(false)}
          style={{ minHeight: 88, borderWidth: 1, borderColor: c.fieldBorder, borderRadius: 10, padding: 12, fontFamily: type.family, fontSize: 16, lineHeight: 24, color: c.text, backgroundColor: c.surface, textAlignVertical: 'top' }} />
        <Action title={sending ? 'Sending…' : 'Send message'} icon="send" onPress={send} disabled={!draft.trim() || sending} />
      </View>
    </>
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
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: mine ? c.greenLight : c.cream, borderWidth: 1, borderColor: m.state === 'failed' ? c.red : mine ? c.greenLight : c.border }}>
        <Text style={s.body}>{m.body}</Text>
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

function Changes({ notices }: { notices: SystemNotice[] }) {
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
