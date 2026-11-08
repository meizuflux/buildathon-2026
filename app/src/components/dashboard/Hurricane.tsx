// Hurricane phase UI: the evacuation banner (active) and the "All clear" pane (peace).
// No animation here, so nothing needs reduced-motion handling.
import React from 'react';
import { Text, View } from 'react-native';
import { type } from '../../constants/theme';
import { hurricaneTitle, needsOnFile } from '../../demo/hurricane';
import type { HurricaneView } from '../../demo/live';
import type { DemoHousehold } from '../../demo/types';
import { Icon } from '../common/ui';
import { useDash } from './parts';

export function EvacuationBanner({ hurricane }: { hurricane?: HurricaneView }) {
  const { c } = useDash();
  const title = hurricane ? hurricaneTitle(hurricane) : 'Hurricane evacuation';
  return (
    <View accessibilityRole="alert" accessible accessibilityLabel={`${title}. Evacuation order in effect. Go to your assigned shelter.`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: c.red }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.onPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="wind" size={22} color={c.red} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.semibold, fontSize: 20, lineHeight: 26, color: c.onPrimary }}>{title}</Text>
        <Text style={{ fontFamily: type.medium, fontSize: 16, lineHeight: 22, color: c.onPrimary }}>Evacuation order in effect. Go to your assigned shelter.</Text>
      </View>
    </View>
  );
}

export function AllClearPane({ household, area }: { household: DemoHousehold; area: string }) {
  const { c, s } = useDash();
  const needs = needsOnFile(household);
  return (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 10, padding: 24, borderRadius: 16, backgroundColor: c.confirmedLight, borderWidth: 1, borderColor: c.confirmed }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.confirmed, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={30} color={c.onPrimary} />
        </View>
        <Text accessibilityRole="header" aria-level={1} style={{ fontFamily: type.semibold, fontSize: 32, lineHeight: 38, color: c.ink }}>All clear</Text>
        <Text style={{ fontFamily: type.medium, fontSize: 17, lineHeight: 24, color: c.ink, textAlign: 'center' }}>No active hurricane in {area}</Text>
        <Text style={{ fontFamily: type.family, fontSize: 15, lineHeight: 22, color: c.muted, textAlign: 'center' }}>
          There is nothing you need to do right now. You can use the Prepare tab to get ready.
        </Text>
      </View>
      <View style={[s.panel, { gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="shield" size={18} color={c.green} />
          <Text accessibilityRole="header" aria-level={2} style={s.h3}>Haven has your plan ready</Text>
        </View>
        <Text style={s.secondary}>Needs on file for your household</Text>
        <View accessibilityRole="list" style={{ gap: 8 }}>
          {needs.map((n) => (
            <View key={n} accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="check-circle" size={16} color={c.confirmed} />
              <Text style={s.body}>{n}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={s.body}>If an evacuation is ordered, your personalized shelter assignment appears here instantly.</Text>
    </View>
  );
}
