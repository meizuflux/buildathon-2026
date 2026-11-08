// The resident app's tabs. Each pane is one task: where to go (Plan), getting ready (Prepare),
// official and system news (Updates), talking to coordinators (Messages), and the household profile.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import type { Step } from '../../demo/checklist';
import type { DemoHousehold, Broadcast, Closure, Message, OfficialInstruction, Recommendation as Rec, SystemNotice } from '../../demo/types';
import { Icon } from '../common/ui';
import { planMode } from '../../demo/hurricane';
import type { HurricaneView } from '../../demo/live';
import { Alternatives } from './Alternatives';
import { AllClearPane, EvacuationBanner } from './Hurricane';
import { HouseholdFit, NeedsFields } from './Household';
import { Journey } from './Journey';
import { NextSteps } from './NextSteps';
import { Action, InlineNotice, LinkButton, useDash } from './parts';
import { Recommendation } from './Recommendation';
import { OfficialInstructionBand } from './Top';
import { Changes, Official, Thread } from './Updates';

/** Large tab title, like a native app's navigation title. */
export function PaneTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { c } = useDash();
  return (
    <View style={{ gap: 2, paddingTop: 4 }}>
      <Text accessibilityRole="header" aria-level={1} style={{ fontFamily: type.semibold, fontSize: 30, lineHeight: 36, color: c.ink }}>{title}</Text>
      {subtitle && <Text style={{ fontFamily: type.family, fontSize: 15, lineHeight: 22, color: c.muted }}>{subtitle}</Text>}
    </View>
  );
}

export function PlanPane({ hurricane, area, rec, household, now, updating, lastChange, instruction, closures, travelling, online, onReviewJourney, onEditNeeds, onMessage, onLeft }: {
  hurricane?: HurricaneView; area: string;
  rec: Rec; household: DemoHousehold; now: number; updating: boolean; lastChange: string[]; instruction: OfficialInstruction | null;
  closures: Closure[]; travelling: boolean; online: boolean;
  onReviewJourney: () => void; onEditNeeds: () => void; onMessage: () => void; onLeft: () => void;
}) {
  if (planMode(hurricane) === 'all-clear') return <AllClearPane household={household} area={area} />;
  return (
    <View style={{ gap: 24 }}>
      <EvacuationBanner hurricane={hurricane} />
      <PaneTitle title="Your plan" subtitle="Where to go and how to get there" />
      {instruction && <OfficialInstructionBand instruction={instruction} now={now} />}
      <Recommendation rec={rec} household={household} now={now} updating={updating} lastChange={lastChange}
        onReviewJourney={onReviewJourney} onEditNeeds={onEditNeeds} onMessage={onMessage} />
      {!updating && <Journey rec={rec} household={household} closures={closures} travelling={travelling} online={online} onLeft={onLeft} />}
      {!updating && <Alternatives rec={rec} household={household} />}
    </View>
  );
}

export function PreparePane({ steps, checked, onToggle }: { steps: Step[]; checked: string[]; onToggle: (id: string) => void }) {
  const { s } = useDash();
  return (
    <View style={{ gap: 24 }}>
      <PaneTitle title="Prepare" subtitle="Tick things off as you go. Saved on this device." />
      <NextSteps steps={steps} checked={checked} onToggle={onToggle} heading="Checklist" />
      <Text style={s.secondary}>Practical steps only. For medical questions, follow the instructions you already have from your provider.</Text>
    </View>
  );
}

export function UpdatesPane({ broadcasts, notices }: { broadcasts: Broadcast[]; notices: SystemNotice[] }) {
  const { c, s } = useDash();
  const [view, setView] = useState<'official' | 'changes'>('official');
  const options = [
    { id: 'official' as const, label: 'Official', count: broadcasts.length },
    { id: 'changes' as const, label: 'Plan changes', count: notices.length },
  ];
  return (
    <View style={{ gap: 20 }}>
      <PaneTitle title="Updates" subtitle="Official broadcasts and changes to your plan" />
      <View role="tablist" aria-label="Update type" style={{ flexDirection: 'row', backgroundColor: c.border, borderRadius: 12, padding: 4, gap: 4 }}>
        {options.map((o) => {
          const on = view === o.id;
          return (
            <Pressable key={o.id} role="tab" accessibilityRole="tab" aria-selected={on} accessibilityState={{ selected: on }} onPress={() => setView(o.id)}
              style={({ pressed }) => [{ flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
                backgroundColor: on ? c.surface : 'transparent' }, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontFamily: on ? type.semibold : type.medium, fontSize: 15, color: on ? c.ink : c.muted }}>{o.label}</Text>
              <Text style={{ fontFamily: type.family, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums'] }}>{o.count}</Text>
            </Pressable>
          );
        })}
      </View>
      <View role="tabpanel" style={[s.panel, { gap: 16 }]}>
        {view === 'official' ? <Official broadcasts={broadcasts} /> : <Changes notices={notices} />}
      </View>
    </View>
  );
}

export function MessagesPane({ messages, online, live, onSend }: {
  messages: Message[]; online: boolean; live: boolean; onSend: (body: string, retryId?: string) => void;
}) {
  return (
    <View style={{ gap: 20 }}>
      <PaneTitle title="Messages" subtitle="Shelter coordination desk" />
      <Thread messages={messages} online={online} live={live} onRetry={(m) => onSend(m.body, m.id)} />
    </View>
  );
}

export function HouseholdPane({ household, rec, online, editing, onEditing, onSave, onViewPlan, account }: {
  household: DemoHousehold; rec: Rec; online: boolean; editing: boolean; onEditing: (on: boolean) => void;
  onSave: (h: DemoHousehold) => Promise<void>; onViewPlan: () => void;
  account: { label: string; detail: string; onSignOut?: () => void };
}) {
  const { c, s } = useDash();
  const [draft, setDraft] = useState(household);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = () => { setDraft(household); setError(null); setSaved(false); onEditing(true); };
  const save = async () => {
    if (!online) { setError('You are offline. Your answers are kept here. Save again when you reconnect.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, childAges: draft.childAges.slice(0, draft.children) });
      onEditing(false);
      setSaved(true);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Something went wrong'}. Your answers are kept here; try again.`);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 24 }}>
      <PaneTitle title="Household" subtitle="Who’s with you and what you need" />
      {saved && !editing && (
        <InlineNotice tone="confirmed" icon="check-circle" title="Saved"
          action={<LinkButton title="View plan" icon="map" onPress={() => { setSaved(false); onViewPlan(); }} />}>
          Your plan has been updated with these answers.
        </InlineNotice>
      )}
      {editing ? (
        <View style={[s.panel, { gap: 20 }]}>
          <Text accessibilityRole="header" aria-level={2} style={s.h2}>Edit household</Text>
          <NeedsFields draft={draft} setDraft={setDraft} />
          {error && <InlineNotice tone="critical" icon="alert-circle" title="Not saved">{error}</InlineNotice>}
          <View style={{ gap: 8 }}>
            <Action title="Save changes" icon="check" onPress={() => { void save(); }} busy={busy} />
            <LinkButton title="Cancel" tone="neutral" onPress={() => { setError(null); onEditing(false); }} />
          </View>
        </View>
      ) : (
        <HouseholdFit household={household} rec={rec} onEdit={start} heading="Members and needs" />
      )}
      <View style={[s.panel, { gap: 8 }]}>
        <Text accessibilityRole="header" aria-level={2} style={s.h3}>Account</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.greenLight, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user" size={20} color={c.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>{account.label}</Text>
            <Text style={s.secondary}>{account.detail}</Text>
          </View>
        </View>
        {account.onSignOut && <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={account.onSignOut} />}
      </View>
    </View>
  );
}
