// Header, connection status, and the official instruction band.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import { clock } from '../../demo/time';
import { localMinute } from '../../demo/live';
import type { OfficialInstruction } from '../../demo/types';
import { Icon } from '../common/ui';
import { Mono, useDash } from './parts';
import { Countdown } from './visuals';

export function Header({ household, online, now, onHousehold, onPresenter, presenterOpen, live }: {
  household: string; online: boolean; now: number; onHousehold: () => void; onPresenter: () => void; presenterOpen: boolean;
  live?: { name: string; syncedAt: number | null; onSignOut: () => void } | false;
}) {
  const { c, s } = useDash();
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View accessibilityElementsHidden aria-hidden style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="home" size={15} color={c.onPrimary} />
          </View>
          <Text style={{ fontFamily: type.semibold, fontSize: 17, color: c.ink }}>Haven</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 1 }}>
          {live ? <LiveLabel name={live.name} /> : <DemoLabel now={now} onPress={onPresenter} open={presenterOpen} />}
          <Pressable accessibilityRole="button" accessibilityLabel={`Household: ${household}. Edit household needs`} onPress={onHousehold}
            style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }, pressed && { opacity: 0.7 }]}>
            <Icon name="users" size={17} color={c.green} />
            <Text style={{ fontFamily: type.medium, fontSize: 15, color: c.ink }}>{household}</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" aria-level={1} style={s.h1}>Your household plan</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={online ? 'wifi' : 'wifi-off'} size={15} color={online ? c.muted : c.amber} />
          <Text style={[s.secondary, !online && { color: c.amber }]}>{online ? 'Connected' : 'Offline: showing saved information'}</Text>
          <Mono>· {live ? (live.syncedAt ? `synced ${clock(localMinute(live.syncedAt))}` : 'not synced yet') : clock(now)}</Mono>
          {live && <Pressable accessibilityRole="button" onPress={live.onSignOut} style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, pressed && { opacity: 0.6 }]}><Text style={[s.secondary, { textDecorationLine: 'underline' }]}>Sign out</Text></Pressable>}
        </View>
      </View>
    </View>
  );
}

/** Persistent label that this is a demo with simulated conditions. Also opens presenter controls. */
export function DemoLabel({ now, onPress, open }: { now: number; onPress: () => void; open: boolean }) {
  const { c } = useDash();
  return (
    <Pressable accessibilityRole="button" aria-expanded={open} accessibilityLabel={`Demo, simulated conditions. Simulation time ${clock(now)}. ${open ? 'Hide' : 'Show'} presenter controls`}
      onPress={onPress}
      style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.presenter, flexDirection: 'row', alignItems: 'center', gap: 8 }, pressed && { opacity: 0.8 }]}>
      <Icon name="sliders" size={15} color={c.presenterText} />
      <Text style={{ fontFamily: type.medium, fontSize: 14, color: c.presenterText }}>Demo — simulated conditions</Text>
    </Pressable>
  );
}

/** Live mode: data comes from the Haven service, whose demo records are fictional. */
export function LiveLabel({ name }: { name: string }) {
  const { c } = useDash();
  return (
    <View accessible accessibilityLabel={`Connected to Haven service. ${name}. Demo data, fictional records.`}
      style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.presenter, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="database" size={15} color={c.presenterText} />
      <Text style={{ fontFamily: type.medium, fontSize: 14, color: c.presenterText }}>Live service · demo data</Text>
    </View>
  );
}

export function ConnectionBanner({ online, savedAt, stale, staleSince }: { online: boolean; savedAt: number; stale: boolean; staleSince: number | null }) {
  const { c, s } = useDash();
  if (online && !stale) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: 12, backgroundColor: c.amberLight, borderLeftWidth: 4, borderLeftColor: c.amber }}>
      <Icon name={online ? 'clock' : 'wifi-off'} size={18} color={c.amber} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.strong]}>{online ? 'Some information may be out of date' : 'You are offline'}</Text>
        <Text style={s.noticeBody}>
          {online
            ? 'Shelter availability has not been updated recently. Check again before you leave.'
            : 'This page shows information saved before you lost connection. Current conditions may be different.'}
        </Text>
        <Mono>{online ? `Last shelter update ${clock(staleSince ?? savedAt)}` : `Saved ${clock(savedAt)}`}</Mono>
      </View>
    </View>
  );
}

/** Official instruction: issued by an authority, shown above and apart from the app's recommendation. */
export function OfficialInstructionBand({ instruction, now }: { instruction: OfficialInstruction; now: number }) {
  const { c, s } = useDash();
  const [open, setOpen] = useState(false);
  const critical = instruction.level === 'mandatory';
  const tone = critical ? c.red : c.amber;
  return (
    <View accessibilityRole="summary" style={{ borderRadius: 14, borderWidth: 1, borderColor: tone, backgroundColor: critical ? c.redLight : c.amberLight, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="alert-octagon" size={20} color={c.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: type.semibold, fontSize: 13, color: tone, letterSpacing: 0.3 }}>OFFICIAL INSTRUCTION · {critical ? 'MANDATORY' : 'ADVISORY'}</Text>
          <Text style={{ fontFamily: type.semibold, fontSize: 19, lineHeight: 26, color: c.ink }}>{instruction.headline}</Text>
        </View>
      </View>
      {instruction.leaveBy !== undefined && <Countdown now={now} from={instruction.issuedAt} until={instruction.leaveBy} color={tone} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <Mono>{instruction.authority} · {clock(instruction.issuedAt)}</Mono>
        <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => setOpen(!open)}
          style={({ pressed }) => [{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed && { opacity: 0.7 }]}>
          <Text style={{ fontFamily: type.medium, fontSize: 15, color: c.ink, textDecorationLine: 'underline' }}>{open ? 'Hide details' : 'Details'}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.ink} />
        </Pressable>
      </View>
      {open && <Text style={s.instruction}>{instruction.details}</Text>}
    </View>
  );
}
