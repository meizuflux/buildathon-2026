// Connection status and the official instruction band.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import { clock } from '../../resident/time';
import type { OfficialInstruction } from '../../resident/types';
import { Icon } from './Icon';
import { Mono, useDash } from './parts';

export function ConnectionBanner({ online, savedAt, stale, staleSince }: { online: boolean; savedAt: number; stale: boolean; staleSince: number | null }) {
  const { c, s } = useDash();
  if (online && !stale) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: 12, backgroundColor: c.amberLight, borderLeftWidth: 4, borderLeftColor: c.amber }}>
      <Icon name={online ? 'clock' : 'wifi-off'} size={18} color={c.amber} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.strong}>{online ? 'Some information may be out of date' : 'You are offline'}</Text>
        <Text style={s.noticeBody}>
          {online
            ? 'Shelter availability has not been updated recently. Check again before you leave.'
            : 'This shows information saved before you lost connection. Current conditions may be different.'}
        </Text>
        <Mono>{online ? `Last shelter update ${clock(staleSince ?? savedAt)}` : `Saved ${clock(savedAt)}`}</Mono>
      </View>
    </View>
  );
}

/** Official instruction: issued by an authority, shown above and apart from the app's recommendation. */
export function OfficialInstructionBand({ instruction }: { instruction: OfficialInstruction }) {
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
