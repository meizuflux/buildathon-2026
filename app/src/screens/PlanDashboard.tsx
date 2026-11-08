// Resident dashboard: "Your household plan". Mobile is one column in priority order; desktop (≥ 960 px)
// is two columns with the recommendation dominant. Presenter controls sit apart in a dark dock.
import React, { useState } from 'react';
import { Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alternatives } from '../components/dashboard/Alternatives';
import { EditNeedsSheet, HouseholdFit } from '../components/dashboard/Household';
import { Journey } from '../components/dashboard/Journey';
import { NextSteps } from '../components/dashboard/NextSteps';
import { Action, useDash } from '../components/dashboard/parts';
import { PresenterPanel } from '../components/dashboard/PresenterPanel';
import { Recommendation } from '../components/dashboard/Recommendation';
import { ConnectionBanner, Header, OfficialInstructionBand } from '../components/dashboard/Top';
import { Updates } from '../components/dashboard/Updates';
import { STALE_AFTER_MINUTES } from '../demo/scenario';
import { useDemo } from '../demo/store';

const WIDE = 960;

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
  const { state, view, steps, updating, dispatch, sendMessage } = useDemo();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [editing, setEditing] = useState(false);
  const [presenter, setPresenter] = useState(() => width >= WIDE);
  const [tab, setTab] = useState<'official' | 'coordinator' | 'changes'>('official');
  const [composing, setComposing] = useState(false);
  const [dock, setDock] = useState(0);

  const rec = view.recommendation;
  const d = rec.destination;
  const stale = state.online && !!d && view.now - d.shelter.spacesReportedAt > STALE_AFTER_MINUTES;
  const message = () => { setTab('coordinator'); setTimeout(() => scrollTo('updates'), 0); };
  const reviewJourney = () => scrollTo('journey');
  const showSticky = !wide && !presenter && !composing && !editing && !updating && rec.status === 'recommended' && !!d?.route;

  const instruction = view.instruction && <OfficialInstructionBand instruction={view.instruction} />;
  const recommendation = (
    <Recommendation rec={rec} household={view.household} now={view.now} updating={updating} lastChange={view.lastChange}
      onReviewJourney={reviewJourney} onEditNeeds={() => setEditing(true)} onMessage={message} />
  );
  const fit = <HouseholdFit household={view.household} rec={rec} onEdit={() => setEditing(true)} />;
  const checklist = <NextSteps steps={steps} checked={state.checked} onToggle={(id) => dispatch({ type: 'toggleStep', id })} />;
  const journey = (
    <Journey rec={rec} household={view.household} closures={view.closures} travelling={!!state.travellingTo}
      online={state.online} onLeft={() => dispatch({ type: 'startJourney' })} />
  );
  const updates = (
    <Updates broadcasts={view.broadcasts} messages={state.messages} notices={state.notices} online={state.online}
      tab={tab} onTab={setTab} onSend={sendMessage} onComposerFocus={setComposing} />
  );
  const alternatives = <Alternatives rec={rec} household={view.household} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.cream }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 32 : 16, paddingTop: 16, paddingBottom: presenter ? dock + 24 : showSticky ? 112 : 48 }}>
        <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 24 }}>
          <View role="main" style={{ gap: 24 }}>
            <Header household={view.household.name} online={state.online} now={view.now}
              onHousehold={() => setEditing(true)} onPresenter={() => setPresenter(!presenter)} presenterOpen={presenter} />
            <ConnectionBanner online={state.online} savedAt={state.saved?.now ?? view.now} stale={stale} staleSince={d?.shelter.spacesReportedAt ?? null} />
            {wide ? (
              <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
                <View style={{ flex: 62, minWidth: 0, gap: 32 }}>{instruction}{recommendation}{fit}{checklist}{alternatives}</View>
                <View style={{ flex: 38, minWidth: 0, gap: 32 }}>{journey}{updates}</View>
              </View>
            ) : (
              <View style={{ gap: 32 }}>{instruction}{recommendation}{fit}{checklist}{journey}{updates}{alternatives}</View>
            )}
          </View>
        </View>
      </ScrollView>
      {showSticky && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <Action title="Review journey" icon="map" onPress={reviewJourney} />
        </View>
      )}
      {presenter && (
        // Floating dock, apart from the resident layout. Hidden with its own button or the demo label.
        <View onLayout={(e) => setDock(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 8, right: 8, bottom: 8, maxHeight: wide ? '42%' : '55%', borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
          <ScrollView style={{ borderRadius: 14 }}>
            <PresenterPanel state={state} dispatch={dispatch} onEditNeeds={() => setEditing(true)} onClose={() => setPresenter(false)} />
          </ScrollView>
        </View>
      )}
      <EditNeedsSheet visible={editing} household={state.household} online={state.online}
        onClose={() => setEditing(false)}
        onSave={(household) => { setEditing(false); dispatch({ type: 'setHousehold', household }); }} />
    </SafeAreaView>
  );
}
