// The household: members and needs as icon tiles, matched against the destination, plus the form
// used to edit them (inline on the Household tab, or in a sheet for first-time setup).
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import type { Answer, Household, Recommendation, Requirement } from '../../resident/types';
import { Icon } from './Icon';
import { Action, Heading, InlineNotice, LinkButton, useDash } from './parts';
import { Glyph, type GlyphName } from './visuals';

export function HouseholdFit({ household, rec, onEdit, heading }: { household: Household; rec: Recommendation; onEdit: () => void; heading: string }) {
  const { c, s } = useDash();
  const checks = rec.destination?.checks ?? [];
  const answer = (a: Answer) => (a === 'yes' ? 'Needed' : 'Not sure');
  const tiles: { key: string; glyph: GlyphName; value: string; label: string; requirement?: Requirement }[] = [
    { key: 'adults', glyph: 'adult', value: String(household.adults), label: household.adults === 1 ? 'Adult' : 'Adults' },
    ...(household.children > 0 ? [{ key: 'children', glyph: 'child' as const, value: String(household.children), label: household.children === 1 ? 'Child' : 'Children', requirement: 'children' as const }] : []),
    ...(household.pets ? [{ key: 'pets', glyph: 'paw' as const, value: 'Yes', label: 'Pets', requirement: 'pets' as const }] : []),
    ...(household.wheelchairEntrance !== 'no' ? [{ key: 'wheel', glyph: 'wheelchair' as const, value: answer(household.wheelchairEntrance), label: 'Step-free entry', requirement: 'wheelchairEntrance' as const }] : []),
    ...(household.poweredEquipment !== 'no' ? [{ key: 'power', glyph: 'power' as const, value: answer(household.poweredEquipment), label: 'Backup power', requirement: 'poweredEquipment' as const }] : []),
    { key: 'car', glyph: 'car', value: household.vehicle === 'yes' ? 'Yes' : household.vehicle === 'no' ? 'No' : 'Not sure', label: 'Vehicle' },
  ];

  return (
    <View style={s.section}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Heading>{heading}</Heading>
        <LinkButton title="Edit" icon="edit-2" onPress={onEdit} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="list">
        {tiles.map((tile) => {
          const check = tile.requirement ? checks.find((x) => x.requirement === tile.requirement) : undefined;
          const tone = !check ? null : check.state === 'confirmed' ? c.confirmed : check.state === 'unknown' ? c.amber : c.red;
          const word = !check ? null : check.state === 'confirmed' ? 'Confirmed' : check.state === 'unknown' ? 'Unconfirmed' : 'Not available';
          return (
            <View key={tile.key} accessible accessibilityLabel={`${tile.label}: ${tile.value}${check ? `. ${check.label}` : ''}`}
              style={{ flexGrow: 1, flexBasis: 100, padding: 12, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 6 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.greenLight, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={tile.glyph} size={22} color={c.green} />
              </View>
              <Text style={{ fontFamily: type.semibold, fontSize: 18, lineHeight: 24, color: c.ink }}>{tile.value}</Text>
              <Text style={[s.secondary, { fontSize: 14, lineHeight: 18 }]}>{tile.label}</Text>
              {check && tone && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name={check.state === 'confirmed' ? 'check-circle' : check.state === 'unknown' ? 'help-circle' : 'x-circle'} size={14} color={tone} />
                  <Text style={{ fontFamily: type.medium, fontSize: 13, color: tone }}>{word}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Text style={s.secondary}>{household.location.label}</Text>
    </View>
  );
}

const ANSWERS: { value: Answer; label: string }[] = [
  { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Not sure' },
];

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (a: T) => void; options: { value: T; label: string }[] }) {
  const { c, s } = useDash();
  return (
    <View style={{ gap: 8 }} role="radiogroup" aria-label={label}>
      <Text style={s.strong}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((a) => {
          const on = a.value === value;
          return (
            <Pressable key={a.value} role="radio" accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }}
              accessibilityLabel={`${label}: ${a.label}`} onPress={() => onChange(a.value)}
              style={({ pressed }) => [{ flex: 1, minHeight: 44, borderRadius: 10, borderWidth: on ? 2 : 1, borderColor: on ? c.green : c.fieldBorder,
                backgroundColor: on ? c.greenLight : c.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, pressed && { opacity: 0.7 }]}>
              {on && <Icon name="check" size={16} color={c.green} />}
              <Text style={{ fontFamily: on ? type.semibold : type.medium, fontSize: 15, color: on ? c.green : c.text }}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Count({ label, value, min = 0, max = 20, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (n: number) => void }) {
  const { c, s } = useDash();
  const button = (delta: number, icon: 'minus' | 'plus', disabled: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${delta < 0 ? 'Fewer' : 'More'} ${label.toLowerCase()}`} disabled={disabled}
      onPress={() => onChange(value + delta)}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: c.fieldBorder, alignItems: 'center', justifyContent: 'center' }, (pressed || disabled) && { opacity: 0.4 }]}>
      <Icon name={icon} size={18} color={c.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={s.strong}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {button(-1, 'minus', value <= min)}
        <Text style={[s.strong, { minWidth: 20, textAlign: 'center', fontVariant: ['tabular-nums'] }]} aria-live="polite">{value}</Text>
        {button(1, 'plus', value >= max)}
      </View>
    </View>
  );
}

/** The household questions. The caller owns the draft, so answers survive a failed save. */
export function NeedsFields({ draft, setDraft }: { draft: Household; setDraft: React.Dispatch<React.SetStateAction<Household>> }) {
  const { s } = useDash();
  const set = <K extends keyof Household>(key: K, value: Household[K]) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <>
      <Text style={s.secondary}>Not sure? That’s fine. We’ll show what’s still unknown.</Text>
      <View style={{ gap: 12 }}>
        <Count label="Adults" value={draft.adults} min={1} onChange={(n) => set('adults', n)} />
        <Count label="Children" value={draft.children} onChange={(n) => set('children', n)} />
      </View>
      <Choice label="Are pets coming with you?" value={draft.pets ? 'yes' : 'no'} onChange={(v) => set('pets', v === 'yes')}
        options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
      <Choice label="Does anyone need a wheelchair-accessible entrance?" value={draft.wheelchairEntrance} onChange={(v) => set('wheelchairEntrance', v)} options={ANSWERS} />
      <Choice label="Does anyone rely on powered essential equipment?" value={draft.poweredEquipment} onChange={(v) => set('poweredEquipment', v)} options={ANSWERS} />
      <Choice label="Do you have a vehicle you can use?" value={draft.vehicle} onChange={(v) => set('vehicle', v)} options={ANSWERS} />
      <Choice label="Do you need help with transport?" value={draft.transportHelp} onChange={(v) => set('transportHelp', v)} options={ANSWERS} />
    </>
  );
}

/** First-time household setup in a sheet. Answers are kept if saving fails. */
export function SetupSheet({ visible, household, onSave, onSignOut, error }: { visible: boolean; household: Household; onSave: (h: Household) => void; onSignOut: () => void; error: string | null }) {
  const { c, s } = useDash();
  const [draft, setDraft] = useState(household);
  useEffect(() => { if (visible) setDraft(household); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(20,45,66,0.45)', alignItems: 'center', justifyContent: 'flex-end' }}>
        <View role="dialog" aria-modal aria-label="Set up your household"
          style={{ width: '100%', maxWidth: 480, maxHeight: '92%', backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <View style={{ padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text accessibilityRole="header" aria-level={2} style={s.h2}>Set up your household</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
            <NeedsFields draft={draft} setDraft={setDraft} />
            {error && <InlineNotice tone="critical" icon="alert-circle" title="Not saved">{error}</InlineNotice>}
          </ScrollView>
          <View style={{ padding: 20, paddingTop: 12, gap: 4, borderTopWidth: 1, borderTopColor: c.border }}>
            <Action title="Create household" icon="check" onPress={() => onSave(draft)} />
            <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={onSignOut} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
