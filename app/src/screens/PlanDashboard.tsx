// The resident app shell: a top bar, one pane per tab, and a bottom tab bar. On a phone it fills the
// screen. On a wide browser window it sits in a phone frame, with the demo's presenter controls beside it.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HouseholdPane, MessagesPane, PlanPane, PreparePane, UpdatesPane } from '../components/dashboard/Panes';
import { useDash } from '../components/dashboard/parts';
import { PresenterPanel } from '../components/dashboard/PresenterPanel';
import { ConnectionBanner, DemoLabel, LiveLabel } from '../components/dashboard/Top';
import { Composer } from '../components/dashboard/Updates';
import { Icon, type IconName } from '../components/common/ui';
import { type } from '../constants/theme';
import { localMinute } from '../demo/live';
import { STALE_AFTER_MINUTES } from '../demo/scenario';
import { useDemo } from '../demo/store';
import { clock } from '../demo/time';

type Tab = 'plan' | 'prepare' | 'updates' | 'messages' | 'household';
type Badge = { count?: number; dot?: boolean; alert?: boolean };
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'plan', label: 'Plan', icon: 'map' },
  { id: 'prepare', label: 'Prepare', icon: 'check-square' },
  { id: 'updates', label: 'Updates', icon: 'bell' },
  { id: 'messages', label: 'Messages', icon: 'message-circle' },
  { id: 'household', label: 'Household', icon: 'users' },
];
const FRAME_MIN_WIDTH = 760;

function scrollTo(id: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const heading = el.querySelector<HTMLElement>('[role="heading"]');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}

export default function PlanDashboard() {
  const { c } = useDash();
  const { mode, live, state, view, steps, updating, dispatch, sendMessage, saveHousehold } = useDemo();
  const { width, height } = useWindowDimensions();
  const framed = width >= FRAME_MIN_WIDTH;
  const isLive = mode === 'live';
  const [tab, setTab] = useState<Tab>('plan');
  const [editing, setEditing] = useState(false);
  const [presenterOpen, setPresenterOpen] = useState(framed);
  const presenter = !isLive && presenterOpen;

  // Badges: unseen updates, a changed plan, failed messages, steps left.
  const updateIds = [...view.broadcasts.map((b) => b.id), ...state.notices.map((n) => n.id)];
  const [seen, setSeen] = useState<string[]>([]);
  const changeKey = view.lastChange.join('|');
  const [seenChange, setSeenChange] = useState(changeKey);
  useEffect(() => { if (tab === 'updates') setSeen(updateIds); }, [tab, updateIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'plan') setSeenChange(changeKey); }, [tab, changeKey]);
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
        instruction={view.instruction} closures={view.closures} travelling={!!state.travellingTo} online={state.online}
        onReviewJourney={() => scrollTo('journey')} onEditNeeds={editNeeds} onMessage={() => setTab('messages')}
        onLeft={() => dispatch({ type: 'startJourney' })} />
    ),
    prepare: <PreparePane steps={steps} checked={state.checked} onToggle={(id) => dispatch({ type: 'toggleStep', id })} />,
    updates: <UpdatesPane broadcasts={view.broadcasts} notices={state.notices} />,
    messages: <MessagesPane messages={state.messages} online={state.online} live={isLive} onSend={sendMessage} />,
    household: (
      <HouseholdPane household={state.household} rec={rec} online={state.online} editing={editing} onEditing={setEditing}
        onSave={saveHousehold} onViewPlan={() => setTab('plan')}
        account={isLive
          ? { label: 'Family account', detail: `Connected to Haven · ${live?.disasterName ?? ''}`, onSignOut: live?.signOut }
          : { label: state.household.name, detail: 'Demo household · simulated, stored on this device' }} />
    ),
  };

  const app = (
    <View style={{ flex: 1, backgroundColor: c.cream }}>
      <TopBar online={state.online} time={isLive ? (live?.lastSync ? `synced ${clock(localMinute(live.lastSync))}` : 'not synced') : clock(view.now)}
        label={isLive
          ? <LiveLabel name={live?.disasterName ?? ''} compact />
          : <DemoLabel now={view.now} open={presenter} onPress={() => setPresenterOpen(!presenterOpen)} compact />} />
      <View style={{ flex: 1 }}>
        {TABS.map((t) => (
          // Panes stay mounted so drafts, scroll position and the map survive tab switches.
          <View key={t.id} role="tabpanel" aria-label={t.label} style={{ flex: 1, display: tab === t.id ? 'flex' : 'none' }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled">
              <ConnectionBanner online={state.online} savedAt={state.saved?.now ?? view.now} stale={stale} staleSince={d?.shelter.spacesReportedAt ?? null} />
              {panes[t.id]}
            </ScrollView>
            {t.id === 'messages' && <Composer sending={state.messages.some((m) => m.state === 'sending')} onSend={(body) => sendMessage(body)} />}
          </View>
        ))}
      </View>
      <TabBar tab={tab} onTab={setTab} badges={badges} />
    </View>
  );

  const presenterPanel = presenter && (
    <PresenterPanel state={state} dispatch={dispatch} onEditNeeds={editNeeds} onClose={() => setPresenterOpen(false)} />
  );

  if (framed) {
    const frameHeight = Math.min(880, height - 48);
    return (
      <View style={{ flex: 1, backgroundColor: '#E4E9EF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40, padding: 24 }}>
        {presenter && <ScrollView style={{ maxWidth: 380, maxHeight: frameHeight }}>{presenterPanel}</ScrollView>}
        <View style={{ width: 400, height: frameHeight, borderRadius: 44, borderWidth: 10, borderColor: '#1B2733', overflow: 'hidden', backgroundColor: c.cream,
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, shadowOffset: { width: 0, height: 12 } }}>
          {app}
        </View>
      </View>
    );
  }
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.surface }}>
      {app}
      {presenter && (
        <View style={{ position: 'absolute', left: 8, right: 8, top: 64, maxHeight: '70%', borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16 }}>
          <ScrollView style={{ borderRadius: 14 }}>{presenterPanel}</ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

function TopBar({ online, time, label }: { online: boolean; time: string; label: React.ReactNode }) {
  const { c } = useDash();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View aria-hidden style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="home" size={16} color={c.onPrimary} />
        </View>
        <View>
          <Text style={{ fontFamily: type.semibold, fontSize: 17, lineHeight: 20, color: c.ink }}>Haven</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${online ? 'Connected' : 'Offline, showing saved information'}, ${time}`}>
            <Icon name={online ? 'wifi' : 'wifi-off'} size={11} color={online ? c.muted : c.amber} />
            <Text style={{ fontFamily: type.monoRegular, fontSize: 12, color: online ? c.muted : c.amber, fontVariant: ['tabular-nums'] }}>{online ? time : 'offline'}</Text>
          </View>
        </View>
      </View>
      {label}
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
