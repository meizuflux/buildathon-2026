// Ordered preparation checklist. Checked items are retained (persisted with the demo state).
// Practical steps only; no medical treatment advice.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Step } from '../../demo/checklist';
import { Icon } from '../common/ui';
import { Heading, useDash } from './parts';

export function NextSteps({ steps, checked, onToggle }: { steps: Step[]; checked: string[]; onToggle: (id: string) => void }) {
  const { c, s } = useDash();
  const done = steps.filter((x) => checked.includes(x.id)).length;
  return (
    <View style={s.section}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Heading>Next steps</Heading>
        <Text style={s.secondary} aria-live="polite">{done} of {steps.length} done</Text>
      </View>
      <View style={[s.panel, { gap: 0, paddingVertical: 4 }]} accessibilityRole="list">
        {steps.map((step, i) => {
          const on = checked.includes(step.id);
          return (
            <Pressable key={step.id} role="checkbox" accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }}
              accessibilityLabel={`Step ${i + 1}: ${step.title}`} onPress={() => onToggle(step.id)}
              style={({ pressed }) => [{ flexDirection: 'row', gap: 12, paddingVertical: 14, minHeight: 48, alignItems: 'flex-start',
                borderBottomWidth: i === steps.length - 1 ? 0 : 1, borderBottomColor: c.border }, pressed && { opacity: 0.7 }]}>
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? c.confirmed : c.fieldBorder,
                backgroundColor: on ? c.confirmed : c.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                {on && <Icon name="check" size={16} color={c.onPrimary} />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.strong, on && { color: c.muted }]}>
                  <Text style={{ fontVariant: ['tabular-nums'] }}>{i + 1}. </Text>{step.title}
                </Text>
                {step.detail && <Text style={s.secondary}>{step.detail}</Text>}
                {on && <Text style={[s.secondary, { color: c.confirmed }]}>Done</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
