// Why the destination fits: the household's requirements in functional wording, each matched against
// the destination. Sensitive details are hidden by default. Also the edit-needs sheet.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import { householdNeeds, requirementLabel } from '../../demo/recommend';
import type { Answer, DemoHousehold, Recommendation } from '../../demo/types';
import { Icon } from '../common/ui';
import { Action, Heading, InlineNotice, LinkButton, StatusLabel, useDash } from './parts';

export function HouseholdFit({ household, rec, onEdit }: { household: DemoHousehold; rec: Recommendation; onEdit: () => void }) {
  const { c, s } = useDash();
  const [details, setDetails] = useState(false);
  const needs = householdNeeds(household);
  const checks = rec.destination?.checks ?? [];
  const people = household.adults + household.children;
  const name = rec.destination?.shelter.name;

  return (
    <View style={s.section}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Heading>Why it fits your household</Heading>
        <LinkButton title="Edit household needs" icon="edit-2" onPress={onEdit} />
      </View>
      <View style={[s.panel, { gap: 0, paddingVertical: 8 }]}>
        <Row label={`${people} ${people === 1 ? 'person' : 'people'}: ${household.adults} adults, ${household.children} children`}>
          {rec.destination?.spacesOk ? <StatusLabel tone="confirmed" icon="check-circle">Space reported</StatusLabel>
            : rec.destination?.spacesOk === false ? <StatusLabel tone="critical" icon="x-circle">Not enough space reported</StatusLabel>
            : <StatusLabel tone="attention" icon="help-circle">Space not confirmed</StatusLabel>}
        </Row>
        {needs.map(({ requirement, need }) => {
          const check = checks.find((x) => x.requirement === requirement);
          return (
            <Row key={requirement} label={need === 'possibly' ? `${requirementLabel(requirement)}: not sure` : requirementLabel(requirement)}>
              {!check ? <StatusLabel tone="neutral" icon="minus">No destination</StatusLabel>
                : check.state === 'confirmed' ? <StatusLabel tone="confirmed" icon="check-circle">Confirmed{name ? ` at ${name}` : ''}</StatusLabel>
                : check.state === 'unknown' ? <StatusLabel tone="attention" icon="help-circle">Not confirmed</StatusLabel>
                : <StatusLabel tone="critical" icon="x-circle">Not available</StatusLabel>}
            </Row>
          );
        })}
        <Row label={household.vehicle === 'yes' ? 'Has a vehicle' : household.transportHelp === 'yes' ? 'Needs transport help' : 'Transport not confirmed'} last>
          <Text style={s.secondary}>{household.vehicle === 'yes' ? 'Journey times are by car' : 'Ask a coordinator about transport'}</Text>
        </Row>
      </View>
      <Pressable accessibilityRole="button" aria-expanded={details} onPress={() => setDetails(!details)}
        style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
        <Icon name={details ? 'eye-off' : 'eye'} size={17} color={c.green} />
        <Text style={[s.linkText, { color: c.green }]}>{details ? 'Hide household details' : 'Show household details'}</Text>
      </Pressable>
      {details && (
        <View style={{ gap: 4, paddingLeft: 4 }}>
          <Text style={s.secondary}>Children’s ages: {household.childAges.join(' and ') || 'not given'}</Text>
          {household.dogs > 0 && <Text style={s.secondary}>Pet: {household.petNote || `${household.dogs} dog`}</Text>}
          <Text style={s.secondary}>Starting area: {household.location.label}</Text>
          <Text style={s.secondary}>Details are stored on this device for the demo only.</Text>
        </View>
      )}
    </View>
  );
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const { c, s } = useDash();
  return (
    <View style={{ paddingVertical: 12, gap: 4, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <Text style={s.strong}>{label}</Text>
      {children}
    </View>
  );
}

const ANSWERS: { value: Answer; label: string }[] = [
  { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Not sure' },
];

function Choice({ label, hint, value, onChange }: { label: string; hint?: string; value: Answer; onChange: (a: Answer) => void }) {
  const { c, s } = useDash();
  return (
    <View style={{ gap: 8 }} role="radiogroup" aria-label={label}>
      <Text style={s.strong}>{label}</Text>
      {hint && <Text style={s.secondary}>{hint}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ANSWERS.map((a) => {
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

function Count({ label, value, min = 0, max = 9, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (n: number) => void }) {
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

/** Household needs editor. Answers are kept in a draft until saved, and kept if saving fails. */
export function EditNeedsSheet({ visible, household, online, onSave, onClose }: {
  visible: boolean; household: DemoHousehold; online: boolean; onSave: (h: DemoHousehold) => void; onClose: () => void;
}) {
  const { c, s } = useDash();
  const [draft, setDraft] = useState(household);
  const [error, setError] = useState<string | null>(null);
  // Start from the saved household each time the sheet opens; keep the draft while it stays open.
  useEffect(() => { if (visible) { setDraft(household); setError(null); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof DemoHousehold>(key: K, value: DemoHousehold[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const save = () => {
    if (!online) { setError('Not saved: you are offline. Your answers are kept here. Try again when connected.'); return; }
    onSave({ ...draft, childAges: draft.childAges.slice(0, draft.children) });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,45,66,0.45)', alignItems: 'center', justifyContent: 'flex-end' }}>
        <View role="dialog" aria-modal aria-label="Edit household needs"
          style={{ width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderRadius: 16, marginBottom: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text accessibilityRole="header" aria-level={2} style={s.h2}>Edit household needs</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close without saving" onPress={onClose}
              style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
              <Icon name="x" size={22} color={c.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
            <Text style={s.secondary}>We use these answers to check which shelters can meet your household’s needs. Choose “Not sure” if you don’t know. We will show what that leaves unresolved.</Text>
            <Choice label="Does anyone need a wheelchair-accessible entrance?" hint="Step-free entrance and route inside." value={draft.wheelchairEntrance} onChange={(v) => set('wheelchairEntrance', v)} />
            <Choice label="Does anyone rely on powered essential equipment?" hint="For example, equipment that needs mains or backup power." value={draft.poweredEquipment} onChange={(v) => set('poweredEquipment', v)} />
            <View style={{ gap: 12 }}>
              <Count label="Adults" value={draft.adults} min={1} onChange={(n) => set('adults', n)} />
              <Count label="Children" value={draft.children} onChange={(n) => setDraft((d) => ({ ...d, children: n, childAges: d.childAges.slice(0, n) }))} />
              <Count label="Dogs" value={draft.dogs} onChange={(n) => set('dogs', n)} />
            </View>
            <Choice label="Do you have a vehicle you can use?" value={draft.vehicle} onChange={(v) => set('vehicle', v)} />
            <Choice label="Do you need help with transport?" value={draft.transportHelp} onChange={(v) => set('transportHelp', v)} />
            {error && <InlineNotice tone="critical" icon="alert-circle" title="Not saved">{error}</InlineNotice>}
          </ScrollView>
          <View style={{ padding: 20, paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: c.border }}>
            <Action title="Save and update recommendation" icon="check" onPress={save} />
            <LinkButton title="Cancel" onPress={onClose} tone="neutral" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
