// The resident app shell: a top bar, one pane per tab, and a bottom tab bar. On the web it is a
// phone-width column; on a device it fills the screen.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SetupSheet } from '../components/resident/Household';
import { HavenLogo } from '../components/resident/HavenLogo';
import { Icon, type IconName } from '../components/resident/Icon';
import { ConnectionBanner } from '../components/resident/Notices';
import { HouseholdPane, MessagesPane, PlanPane, PreparePane, UpdatesPane } from '../components/resident/Panes';
import { Action, LinkButton, useDash } from '../components/resident/parts';
import { Composer } from '../components/resident/Updates';
import { type } from '../constants/theme';
import { useResident } from '../resident/provider';
import { STALE_AFTER_MINUTES } from '../resident/rules';
import { clock, localMinute } from '../resident/time';
import type { Household } from '../resident/types';

type Tab = 'plan' | 'prepare' | 'updates' | 'messages' | 'household';
type Badge = { count?: number; dot?: boolean; alert?: boolean };
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'plan', label: 'Plan', icon: 'map' },
  { id: 'prepare', label: 'Prepare', icon: 'check-square' },
  { id: 'updates', label: 'Updates', icon: 'bell' },
  { id: 'messages', label: 'Messages', icon: 'message-circle' },
  { id: 'household', label: 'Household', icon: 'users' },
];

/** Phone-width column on the web; full screen on a device. */
function Frame({ children }: { children: React.ReactNode }) {
  const { c } = useDash();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: c.cream }}>{children}</View>
    </SafeAreaView>
  );
}

export default function ResidentApp() {
  const ctx = useResident();
  if (ctx.phase === 'ready') return <Frame><Main /></Frame>;
  if (ctx.phase === 'setup') return <Frame><Setup onCreate={ctx.createHousehold} onSignOut={ctx.signOut} /></Frame>;
  return <Frame><Status error={ctx.phase === 'error' ? ctx.error : null} onRetry={ctx.retry} onSignOut={ctx.signOut} /></Frame>;
}

function Main() {
  const { c } = useDash();
  const ctx = useResident();
  const [tab, setTab] = useState<Tab>('plan');
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const ready = ctx.phase === 'ready' ? ctx : null;
  const updateIds = ready ? [...ready.view.broadcasts.map((b) => b.id), ...ready.state.notices.map((n) => n.id)] : [];
  const changeKey = ready?.view.lastChange.join('|') ?? '';
  const [seenChange, setSeenChange] = useState(changeKey);
  useEffect(() => { if (tab === 'updates') setSeen(updateIds); }, [tab, updateIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'plan') setSeenChange(changeKey); }, [tab, changeKey]);
  if (!ready) return null;
  const { state, view, steps, updating } = ready;

  const badges: Record<Tab, Badge> = {
    plan: { dot: changeKey !== '' && changeKey !== seenChange },
    prepare: { count: steps.filter((x) => !state.checked.includes(x.id)).length },
    updates: { count: updateIds.filter((id) => !seen.includes(id)).length },
    messages: { count: state.messages.filter((m) => m.state === 'failed').length, alert: true },
    household: {},
  };
  const rec = view.recommendation;
  const d = rec.destination;
  const stale = state.online && !!d && view.now - d.shelter.spacesReportedAt > STALE_AFTER_MINUTES;
  const editNeeds = () => { setTab('household'); setEditing(true); };

  const panes: Record<Tab, React.ReactNode> = {
    plan: (
      <PlanPane rec={rec} household={view.household} now={view.now} updating={updating} lastChange={view.lastChange}
        instruction={view.instruction} onEditNeeds={editNeeds} onMessage={() => setTab('messages')} />
    ),
    prepare: <PreparePane steps={steps} checked={state.checked} onToggle={ready.toggleStep} />,
    updates: <UpdatesPane broadcasts={view.broadcasts} notices={state.notices} />,
    messages: <MessagesPane messages={state.messages} online={state.online} onSend={ready.sendMessage} />,
    household: (
      <HouseholdPane household={state.household} rec={rec} online={state.online} editing={editing} onEditing={setEditing}
        onSave={ready.saveHousehold} onViewPlan={() => setTab('plan')} emergency={ready.disasterName} onSignOut={ready.signOut} />
    ),
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <TopBar online={state.online} synced={ready.lastSync} />
      <View style={{ flex: 1 }}>
        {TABS.map((t) => (
          // Panes stay mounted so drafts, scroll position and the map survive tab switches.
          <View key={t.id} role="tabpanel" aria-label={t.label} style={{ flex: 1, display: tab === t.id ? 'flex' : 'none' }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled">
              <ConnectionBanner online={state.online} savedAt={state.saved?.now ?? view.now} stale={stale} staleSince={d?.shelter.spacesReportedAt ?? null} />
              {panes[t.id]}
            </ScrollView>
            {t.id === 'messages' && <Composer sending={state.messages.some((m) => m.state === 'sending')} onSend={(body) => ready.sendMessage(body)} />}
          </View>
        ))}
      </View>
      <TabBar tab={tab} onTab={setTab} badges={badges} />
    </View>
  );
}

function TopBar({ online, synced }: { online: boolean; synced: number | null }) {
  const { c } = useDash();
  const time = synced ? `updated ${clock(localMinute(synced))}` : 'not updated yet';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <HavenLogo />
      <Text style={{ flex: 1, fontFamily: type.semibold, fontSize: 17, lineHeight: 22, color: c.ink }}>Haven</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={online ? `Connected, ${time}` : 'Offline, showing saved information'}>
        <Icon name={online ? 'wifi' : 'wifi-off'} size={14} color={online ? c.muted : c.amber} />
        <Text style={{ fontFamily: type.monoRegular, fontSize: 12, color: online ? c.muted : c.amber, fontVariant: ['tabular-nums'] }}>{online ? time : 'offline'}</Text>
      </View>
    </View>
  );
}

function TabBar({ tab, onTab, badges }: { tab: Tab; onTab: (t: Tab) => void; badges: Record<Tab, Badge> }) {
  const { c } = useDash();
  return (
    <View role="tablist" aria-label="Sections" style={{ flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6, paddingBottom: 8 }}>
      {TABS.map((t) => {
        const on = tab === t.id;
        const b = badges[t.id];
        const count = b.count ?? 0;
        const extra = count ? `, ${count} ${t.id === 'prepare' ? 'to do' : t.id === 'messages' ? 'not sent' : 'new'}` : b.dot ? ', changed' : '';
        return (
          <Pressable key={t.id} role="tab" accessibilityRole="tab" aria-selected={on} accessibilityState={{ selected: on }} accessibilityLabel={t.label + extra}
            onPress={() => onTab(t.id)}
            style={({ pressed }) => [{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3 }, pressed && { opacity: 0.6 }]}>
            <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.greenLight : 'transparent' }}>
              <Icon name={t.icon} size={21} color={on ? c.green : c.muted} />
              {count > 0 && (
                <View style={{ position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: b.alert ? c.red : t.id === 'prepare' ? c.muted : c.green }}>
                  <Text style={{ fontFamily: type.semibold, fontSize: 11, color: c.onPrimary, fontVariant: ['tabular-nums'] }}>{count}</Text>
                </View>
              )}
              {!count && b.dot && <View style={{ position: 'absolute', top: 2, right: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: c.amber, borderWidth: 2, borderColor: c.surface }} />}
            </View>
            <Text style={{ fontFamily: on ? type.semibold : type.medium, fontSize: 12, color: on ? c.green : c.muted }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Status({ error, onRetry, onSignOut }: { error: string | null; onRetry: () => void; onSignOut: () => void }) {
  const { c, s } = useDash();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      {error ? (
        <View style={[s.panel, { width: '100%' }]}>
          <Text accessibilityRole="header" style={s.h2}>Can’t load your plan</Text>
          <Text style={s.body}>{error}</Text>
          <Action title="Try again" icon="refresh-cw" onPress={onRetry} />
          <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={onSignOut} />
        </View>
      ) : (
        <><ActivityIndicator color={c.green} size="large" /><Text style={s.secondary}>Loading your household plan…</Text></>
      )}
    </View>
  );
}

const NEW_HOUSEHOLD: Household = {
  id: 'new', adults: 1, children: 0, pets: false, wheelchairEntrance: 'no', poweredEquipment: 'no', vehicle: 'yes', transportHelp: 'no',
  location: { label: '', lat: 0, lng: 0 },
};

function Setup({ onCreate, onSignOut }: { onCreate: (h: Household) => Promise<void>; onSignOut: () => void }) {
  const { c, s } = useDash();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(NEW_HOUSEHOLD);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={[s.panel, { width: '100%' }]}>
        <Text accessibilityRole="header" style={s.h2}>Set up your household</Text>
        <Text style={s.body}>Tell us who’s with you and what you need to get a shelter recommendation.</Text>
        {busy && <ActivityIndicator color={c.green} />}
        <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={onSignOut} />
      </View>
      <SetupSheet visible={!busy} household={draft} error={error} onSignOut={onSignOut}
        onSave={(h) => { setDraft(h); setBusy(true); setError(null); onCreate(h).catch((e) => { setError(e instanceof Error ? e.message : 'Something went wrong'); setBusy(false); }); }} />
    </View>
  );
}
