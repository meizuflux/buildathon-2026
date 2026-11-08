// Presenter-only controls. Visually separate from the resident app (dark dock) and labelled as such.
// Every control either works or says why it is unavailable.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import * as scenario from '../../demo/scenario';
import type { Action as DemoAction, DemoState } from '../../demo/state';
import { clock } from '../../demo/time';
import type { Answer } from '../../demo/types';
import { Icon, type IconName } from '../common/ui';
import { useDash } from './parts';

export function PresenterPanel({ state, dispatch, onEditNeeds, onClose }: {
  state: DemoState; dispatch: (a: DemoAction) => void; onEditNeeds: () => void; onClose: () => void;
}) {
  const { c } = useDash();
  const nextClosure = scenario.closureScript[state.cursors.closure];
  const nextBroadcast = scenario.broadcastScript[state.cursors.broadcast];
  const nextAvailability = scenario.availabilityScript[state.cursors.availability];
  const availabilityName = nextAvailability && scenario.shelters.find((x) => x.id === nextAvailability.shelterId)?.name;
  const setWheelchair = (wheelchairEntrance: Answer) => {
    if (state.household.wheelchairEntrance !== wheelchairEntrance) dispatch({ type: 'setHousehold', household: { ...state.household, wheelchairEntrance } });
  };
  const text = { color: c.presenterText, fontFamily: type.family, fontSize: 14, lineHeight: 20 };
  const muted = { ...text, color: c.presenterMuted };

  return (
    <View role="region" aria-label="Presenter controls" style={{ backgroundColor: c.presenter, borderRadius: 14, padding: 16, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text accessibilityRole="header" aria-level={2} style={{ ...text, fontFamily: type.semibold, fontSize: 16 }}>Presenter controls — not part of the resident app</Text>
          <Text style={{ ...muted, fontFamily: type.mono, fontVariant: ['tabular-nums'] }}>Simulation time {clock(state.now)} · scripted and deterministic</Text>
        </View>
        <Control icon="x" title="Hide" onPress={onClose} compact />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={muted}>Household requirement: wheelchair-accessible entrance</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(['yes', 'unknown', 'no'] as Answer[]).map((a) => (
            <Control key={a} title={{ yes: 'Yes', unknown: 'Not sure', no: 'No' }[a]} selected={state.household.wheelchairEntrance === a} onPress={() => setWheelchair(a)} compact />
          ))}
          <Control icon="edit-2" title="Open full editor" onPress={onEditNeeds} compact />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Control icon="x-octagon" title="Trigger road closure" detail={nextClosure ? `Next: ${nextClosure.label}` : 'All scripted closures used'} disabled={!nextClosure} onPress={() => dispatch({ type: 'triggerClosure' })} />
        <Control icon="radio" title="Simulate broadcast" detail={nextBroadcast ? `Next: ${nextBroadcast.title}` : 'All scripted broadcasts sent'} disabled={!nextBroadcast} onPress={() => dispatch({ type: 'sendBroadcast' })} />
        <Control icon="users" title="Availability update" detail={nextAvailability ? `Next: ${availabilityName} reports ${nextAvailability.spaces} spaces` : 'All scripted updates used'} disabled={!nextAvailability} onPress={() => dispatch({ type: 'updateAvailability' })} />
        <Control icon={state.online ? 'wifi-off' : 'wifi'} title={state.online ? 'Go offline' : 'Reconnect'} detail={state.online ? 'Freeze the resident view as saved' : 'Show what changed while offline'} onPress={() => dispatch({ type: 'setOnline', online: !state.online })} />
        <Control icon="clock" title="Advance 45 min" detail="Shelter reports become out of date" onPress={() => dispatch({ type: 'advanceTime', minutes: 45 })} />
        <Control icon="alert-circle" title={state.failNextMessage ? 'Next message will fail' : 'Make next message fail'} detail={state.failNextMessage ? 'Press to cancel' : 'Simulates a send failure'} selected={state.failNextMessage} onPress={() => dispatch({ type: 'setFailNext', fail: !state.failNextMessage })} />
        <Control icon="rotate-ccw" title="Reset scenario" detail="Back to 13:40, nothing checked" onPress={() => dispatch({ type: 'reset' })} />
      </View>

      {state.notices.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={muted}>Event log</Text>
          {state.notices.slice(0, 4).map((n) => (
            <Text key={n.id} style={text}><Text style={{ fontFamily: type.mono, fontVariant: ['tabular-nums'], color: c.presenterMuted }}>{clock(n.at)}  </Text>{n.title}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Control({ icon, title, detail, onPress, disabled, selected, compact }: {
  icon?: IconName; title: string; detail?: string; onPress: () => void; disabled?: boolean; selected?: boolean; compact?: boolean;
}) {
  const { c } = useDash();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={detail ? `${title}. ${detail}` : title} aria-pressed={selected}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: selected ? c.presenterText : '#3A4A5A',
        backgroundColor: selected ? '#33475A' : '#243240', paddingHorizontal: 12, paddingVertical: compact ? 8 : 10, gap: 2, justifyContent: 'center',
        flexGrow: compact ? 0 : 1, flexBasis: compact ? 'auto' : 150 }, (pressed || disabled) && { opacity: disabled ? 0.5 : 0.75 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={16} color={c.presenterText} />}
        {selected && !icon && <Icon name="check" size={16} color={c.presenterText} />}
        <Text style={{ fontFamily: type.medium, fontSize: 15, color: c.presenterText }}>{title}</Text>
      </View>
      {detail && <Text style={{ fontFamily: type.family, fontSize: 13, lineHeight: 18, color: c.presenterMuted }}>{detail}</Text>}
    </Pressable>
  );
}
