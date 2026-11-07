import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Linking } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Row, Icon, Title, Body, Button, Notice, QueryState, date, useUI } from '../../components/common/ui';
import { useMessages, useHousehold } from '../../hooks/queries';
import { useSyncContext } from '../../hooks/useSync';
import { adapter } from '../../services/adapters';
import { config } from '../../constants/config';
import { cache } from '../../storage/cache';
import { requestId } from '../../utils/id';
import { type } from '../../constants/theme';
import type { MessageInput, SupportMessage } from '../../types/models';
export default function Assistance() {
  const { c, s } = useUI(); const query = useMessages(); const household = useHousehold(); const sync = useSyncContext(); const client = useQueryClient();
  const [draft, setDraft] = useState<MessageInput>({ body: '', idempotencyKey: requestId() });
  const [loadedKey, setLoadedKey] = useState(''); const [storageError, setStorageError] = useState(''); const [callError, setCallError] = useState('');
  const draftKey = `message-draft:${config.mode}:${config.baseUrl}:${household.data?.id ?? 'unregistered'}`;
  const configured = config.mode === 'api' && Boolean(config.baseUrl);
  const draftReady = loadedKey === draftKey && !household.isPending;
  const writes = useRef(Promise.resolve());
  function persist(value: MessageInput, key: string) {
    writes.current = writes.current.then(() => cache.set(key, value)).catch(() => setStorageError('This draft could not be saved on your device. Keep this screen open.'));
  }
  useEffect(() => {
    if (household.isPending) return;
    let live = true;
    void cache.get<MessageInput>(draftKey).then(saved => { if (live) { setDraft(saved && typeof saved.body === 'string' && saved.body.length <= 2000 && typeof saved.idempotencyKey === 'string' ? saved : { body: '', idempotencyKey: requestId() }); setLoadedKey(draftKey); } }).catch(() => { if (live) { setStorageError('Saved drafts could not be loaded.'); setDraft({ body: '', idempotencyKey: requestId() }); setLoadedKey(draftKey); } });
    return () => { live = false; };
  }, [draftKey, household.isPending]);
  const mutation = useMutation({
    mutationFn: adapter.sendMessage,
    onSuccess: (message, input) => {
      client.setQueryData<SupportMessage[]>(['messages'], existing => [...(existing ?? []).filter(item => item.id !== message.id && item.idempotencyKey !== input.idempotencyKey), message]);
      const cleared = { body: '', idempotencyKey: requestId() }; setDraft(cleared); persist(cleared, draftKey);
      void client.invalidateQueries({ queryKey: ['messages'] });
    },
  });
  function changeMessage(body: string) { mutation.reset(); const next = { body, idempotencyKey: requestId() }; setDraft(next); persist(next, draftKey); }
  function send() { if (!configured || !sync.online || !draftReady || mutation.isPending || !draft.body.trim() || !household.data) return; mutation.mutate({ ...draft, body: draft.body.trim() }); }
  async function callEmergency() { setCallError(''); try { await Linking.openURL('tel:911'); } catch { setCallError('Unable to open a phone dialer. Dial 911 from a phone.'); } }
  const messages = [...(query.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const composer = (
      <View style={{ gap: 12 }}><Text style={s.fieldLabel}>Message support</Text><TextInput accessibilityLabel="Message support" value={draftReady ? draft.body : ''} onChangeText={changeMessage} editable={draftReady && !mutation.isPending} multiline maxLength={2000} placeholder="Write your message…" placeholderTextColor={c.muted} style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]} /><Row style={{ justifyContent: 'space-between', alignItems: 'center' }}><Text style={s.caption}>{draft.body.length}/2000{draft.body && !mutation.isPending ? ' · Draft on this device' : ''}</Text><Button title={mutation.isError ? 'Retry sending' : 'Send message'} onPress={send} icon="send" busy={mutation.isPending} disabled={!configured || !sync.online || !draftReady || !draft.body.trim() || !household.data} /></Row>
        {mutation.isError && <Notice danger>{mutation.error.message} Your message is kept here. Retry with the same message to avoid duplicates.</Notice>}
        {!sync.online && <Body muted>You’re offline. Your message has not been sent.</Body>}
        {!household.isPending && !household.data && <Button title="Add your household to send messages" href="/(onboarding)" variant="secondary" />}
        {!!storageError && <Notice danger>{storageError}</Notice>}
      </View>
  );
  return <Page title="Support" footer={composer}>
    <View style={{ padding: 16, borderLeftWidth: 4, borderLeftColor: c.red, backgroundColor: c.white, gap: 8 }}><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Title small>Immediate danger?</Title><Pressable accessibilityRole="button" accessibilityLabel="Call 911" onPress={() => void callEmergency()} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.65 : 1 })}><Icon name="phone" color={c.ink} size={18} /><Text style={{ fontFamily: type.semibold, fontSize: 19, color: c.ink }}>Call 911</Text></Pressable></Row><Text style={s.caption}>In the United States, call 911 for emergency help. Messages here go to your coordination team.</Text></View>
    {!!callError && <Notice danger>{callError}</Notice>}
    <View style={{ gap: 24 }}><Row><Icon name="message-square" color={c.green} /><Title small>Your conversation</Title></Row>
      {!configured && <Body muted>The support service is not connected. You can write a message and keep it here until sending is available.</Body>}
      <QueryState query={query}>{messages.length ? messages.map(message => <View key={message.id} style={{ alignSelf: message.sender === 'household' ? 'flex-end' : 'flex-start', maxWidth: '94%', gap: 8 }}><Text style={s.caption}>{message.sender === 'household' ? 'You' : 'Support team'}</Text><View style={{ backgroundColor: message.sender === 'household' ? c.greenLight : c.white, borderRadius: 8, padding: 16 }}><Body>{message.body}</Body></View><Text style={s.caption}>{date(message.createdAt)}{message.sender === 'household' ? ' · Sent' : ''}</Text></View>) : <View style={{ paddingVertical: 16, gap: 8 }}><Body>No messages yet.</Body><Text style={s.caption}>Tell the team what you need, or ask about your shelter.</Text></View>}</QueryState>

    </View>
  </Page>;
}
