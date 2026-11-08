// Other shelters that were considered: what they meet, what is unresolved, the journey, and why
// they were not selected. No scores.
import React from 'react';
import { Text, View } from 'react-native';
import type { DemoHousehold, Recommendation } from '../../demo/types';
import { travelMode } from './Recommendation';
import { Disclosure, StatusLabel, useDash } from './parts';

export function Alternatives({ rec, household }: { rec: Recommendation; household: DemoHousehold }) {
  const { c, s } = useDash();
  const alts = rec.alternatives;
  if (!alts.length) return null;
  return (
    <View style={[s.panel, { paddingVertical: 8 }]}>
      <Disclosure title={`Other options considered (${alts.length})`} summary="Why these shelters were not recommended">
        {alts.map(({ assessment: a, whyNot }, i) => (
          <View key={a.shelter.id} style={{ gap: 8, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <Text accessibilityRole="header" aria-level={3} style={s.h3}>{a.shelter.name}</Text>
            <Text style={s.secondary}>{a.shelter.address}</Text>
            <View style={{ gap: 2 }}>
              <Text style={s.strong}>Why not selected</Text>
              <Text style={s.body}>{whyNot}</Text>
            </View>
            {a.checks.filter((x) => x.state === 'confirmed').map((x) => <StatusLabel key={x.requirement} tone="confirmed" icon="check-circle">{x.label}</StatusLabel>)}
            {a.checks.filter((x) => x.state === 'not_available').map((x) => <StatusLabel key={x.requirement} tone="critical" icon="x-circle">{x.label}</StatusLabel>)}
            {a.unresolved.map((u) => <StatusLabel key={u} tone="attention" icon="help-circle">{u}</StatusLabel>)}
            <Text style={s.secondary}>
              {a.route ? `About ${a.route.minutes} min by ${travelMode(household)} via ${a.route.via} (estimated)` : 'No route currently available'}
              {a.shelter.spaces !== null ? ` · ${a.shelter.spaces === 0 ? 'reported full' : `${a.shelter.spaces} spaces reported`}` : ''}
            </Text>
          </View>
        ))}
      </Disclosure>
    </View>
  );
}
