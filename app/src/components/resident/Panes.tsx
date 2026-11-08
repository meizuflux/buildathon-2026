// The app's tabs. Each pane is one task: where to go (Plan), getting ready (Prepare), official and
// plan news (Updates), talking to coordinators (Messages), and the household profile (Household).
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import type { Step } from '../../resident/checklist';
import type { Broadcast, Household, Message, OfficialInstruction, Recommendation as Rec, SystemNotice } from '../../resident/types';
import { Alternatives } from './Alternatives';
import { HouseholdFit, NeedsFields } from './Household';
import { Icon } from './Icon';
import { Journey } from './Journey';
import { NextSteps } from './NextSteps';
import { OfficialInstructionBand } from './Notices';
import { Action, InlineNotice, LinkButton, useDash } from './parts';
import { Recommendation } from './Recommendation';
import { Changes, Official, Thread } from './Updates';

/** Large tab title, like a native navigation title. */
export function PaneTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { c } = useDash();
  return (
    <View style={{ gap: 2, paddingTop: 4 }}>
      <Text accessibilityRole="header" aria-level={1} style={{ fontFamily: type.semibold, fontSize: 30, lineHeight: 36, color: c.ink }}>{title}</Text>
      {subtitle && <Text style={{ fontFamily: type.family, fontSize: 15, lineHeight: 22, color: c.muted }}>{subtitle}</Text>}
    </View>
  );
}

export function PlanPane({ rec, household, now, updating, lastChange, instruction, onEditNeeds, onMessage }: {
  rec: Rec; household: Household; now: number; updating: boolean; lastChange: string[]; instruction: OfficialInstruction | null;
  onEditNeeds: () => void; onMessage: () => void;
}) {
  return (
    <View style={{ gap: 24 }}>
      <PaneTitle title="Your assigned shelter" />
      {instruction && <OfficialInstructionBand instruction={instruction} />}
      <Recommendation rec={rec} household={household} now={now} updating={updating} lastChange={lastChange}
        onEditNeeds={onEditNeeds} onMessage={onMessage} />
      {!updating && <Journey rec={rec} household={household} />}
      {!updating && <Alternatives rec={rec} household={household} />}
    </View>
  );
}

export function PreparePane({ steps, checked, onToggle }: { steps: Step[]; checked: string[]; onToggle: (id: string) => void }) {
  const { s } = useDash();
  return (
    <View style={{ gap: 24 }}>
      <PaneTitle title="Prepare" subtitle="Tick things off as you go" />
      <NextSteps steps={steps} checked={checked} onToggle={onToggle} />
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

export function MessagesPane({ messages, online, onSend }: { messages: Message[]; online: boolean; onSend: (body: string, retryId?: string) => void }) {
  return (
    <View style={{ gap: 20 }}>
      <PaneTitle title="Messages" />
      <Thread messages={messages} online={online} onRetry={(m) => onSend(m.body, m.id)} />
    </View>
  );
}

export function HouseholdPane({ household, rec, online, editing, onEditing, onSave, onViewPlan, emergency, onSignOut }: {
  household: Household; rec: Rec; online: boolean; editing: boolean; onEditing: (on: boolean) => void;
  onSave: (h: Household) => Promise<void>; onViewPlan: () => void; emergency: string; onSignOut: () => void;
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
      await onSave(draft);
      onEditing(false);
      setSaved(true);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Something went wrong'}. Your answers are kept here; try again.`);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 24 }}>
      <PaneTitle title="Household" subtitle="Who’s with you and what you need" />
      <View style={[s.panel, { gap: 8 }]}>
        <Text accessibilityRole="header" aria-level={2} style={s.h3}>Account</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.greenLight, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user" size={20} color={c.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>Family account</Text>
            <Text style={s.secondary}>{emergency}</Text>
          </View>
        </View>
        <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={onSignOut} />
      </View>
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
    </View>
  );
}
