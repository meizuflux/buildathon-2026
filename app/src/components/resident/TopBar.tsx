import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type } from '../../constants/theme';
import { clock, localMinute } from '../../resident/time';
import { HavenLogo } from './HavenLogo';
import { Icon } from './Icon';
import { useDash } from './parts';

/** Phone-width column on the web; full screen on a device. */
export function Frame({ children }: { children: React.ReactNode }) {
  const { c } = useDash();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: c.cream }}>{children}</View>
    </SafeAreaView>
  );
}

/** The Haven header bar pinned at the top of the resident app. */
export function TopBar({ online, synced }: { online?: boolean; synced?: number | null }) {
  const { c } = useDash();
  const time = synced ? `updated ${clock(localMinute(synced))}` : 'not updated yet';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <HavenLogo />
      <Text style={{ flex: 1, fontFamily: type.semibold, fontSize: 17, lineHeight: 22, color: c.ink }}>Haven</Text>
      {online !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={online ? `Connected, ${time}` : 'Offline, showing saved information'}>
          <Icon name={online ? 'wifi' : 'wifi-off'} size={14} color={online ? c.muted : c.amber} />
          <Text style={{ fontFamily: type.monoRegular, fontSize: 12, color: online ? c.muted : c.amber, fontVariant: ['tabular-nums'] }}>{online ? time : 'offline'}</Text>
        </View>
      )}
    </View>
  );
}
