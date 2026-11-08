// Other shelters considered: what they meet, what is unresolved, distance, and why they were not chosen.
import React from 'react';
import { Text, View } from 'react-native';
import type { Household, Recommendation } from '../../resident/types';
import { Disclosure, StatusLabel, useDash } from './parts';
import { km } from './Recommendation';

export function Alternatives({ rec, household }: { rec: Recommendation; household: Household }) {
  const { c, s } = useDash();
  if (!rec.alternatives.length) return null;
  return (
    <View style={[s.panel, { paddingVertical: 8 }]}>
      <Disclosure title={`Other shelters (${rec.alternatives.length})`} summary="Why these weren’t chosen for you">
        {rec.alternatives.map(({ assessment: a, whyNot }, i) => (
          <View key={a.shelter.id} style={{ gap: 8, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <Text accessibilityRole="header" aria-level={3} style={s.h3}>{a.shelter.name}</Text>
            <Text style={s.secondary}>{a.shelter.address}</Text>
            <Text style={s.body}>{whyNot}</Text>
            {a.checks.filter((x) => x.state === 'confirmed').map((x) => <StatusLabel key={x.requirement} tone="confirmed" icon="check-circle">{x.label}</StatusLabel>)}
            {a.checks.filter((x) => x.state === 'not_available').map((x) => <StatusLabel key={x.requirement} tone="critical" icon="x-circle">{x.label}</StatusLabel>)}
            {a.unresolved.map((u) => <StatusLabel key={u} tone="attention" icon="help-circle">{u}</StatusLabel>)}
            <Text style={s.secondary}>
              {km(household, a)} away (straight line)
              {a.shelter.spaces !== null ? ` · ${a.shelter.spaces === 0 ? 'reported full' : `${a.shelter.spaces} spaces reported`}` : ''}
            </Text>
          </View>
        ))}
      </Disclosure>
    </View>
  );
}
