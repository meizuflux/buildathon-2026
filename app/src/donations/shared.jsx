import { Pressable, StyleSheet, Text, View } from 'react-native';

// Citizen-requestable resource types, mirroring the server catalog (GET /api/resource-types).
// Clinical items (insulin, prescription refills, oxygen) are handled by operators, not citizens.
export const CITIZEN_RESOURCES = [
  ['water_bottled', 'Bottled water'],
  ['water_gallon', 'Water jugs'],
  ['food_mre', 'Ready-to-eat meals'],
  ['food_canned', 'Canned food'],
  ['baby_formula', 'Baby formula'],
  ['diapers', 'Diapers'],
  ['first_aid', 'First aid kits'],
  ['blankets', 'Blankets'],
  ['cots', 'Cots'],
  ['hygiene_kit', 'Hygiene kits'],
  ['clothing', 'Clothing bundles'],
  ['generator', 'Generators'],
  ['fuel', 'Fuel'],
];
export const LABELS = Object.fromEntries(CITIZEN_RESOURCES);
export const HUB_TYPES = {
  mosque: 'Mosque',
  church: 'Church',
  fire_station: 'Fire station',
  school: 'School',
  community_center: 'Community center',
  other: 'Hub',
};
export const FULL_PCT = 90;

export const colors = {
  text: '#111827',
  muted: '#4b5563',
  border: '#e5e7eb',
  primary: '#2563eb',
  danger: '#dc2626',
  warn: '#d97706',
  ok: '#16a34a',
  chip: '#dbeafe',
  chipText: '#1e40af',
};

export function itemsText(items) {
  return items.map((i) => `${i.quantity} ${i.name ?? LABELS[i.resource_type_id] ?? i.resource_type_id}`).join(', ');
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ title, onPress, disabled, variant = 'primary' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, styles[variant], (pressed || disabled) && styles.dim]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

/** One row per resource type with − / + controls. value: { [resource_type_id]: quantity }. */
export function ItemPicker({ value, onChange, step = 1 }) {
  const set = (key, quantity) => onChange({ ...value, [key]: Math.max(0, Math.min(10000, quantity)) });
  return (
    <View style={styles.picker}>
      {CITIZEN_RESOURCES.map(([key, label]) => (
        <View key={key} style={styles.pickerRow}>
          <Text style={styles.pickerLabel}>{label}</Text>
          <Pressable accessibilityLabel={`Fewer ${label}`} onPress={() => set(key, (value[key] ?? 0) - step)} style={styles.stepper}>
            <Text style={styles.stepperText}>−</Text>
          </Pressable>
          <Text style={styles.count}>{value[key] ?? 0}</Text>
          <Pressable accessibilityLabel={`More ${label}`} onPress={() => set(key, (value[key] ?? 0) + step)} style={styles.stepper}>
            <Text style={styles.stepperText}>+</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export function pickedItems(value) {
  return Object.entries(value)
    .filter(([, quantity]) => quantity > 0)
    .map(([resource_type_id, quantity]) => ({ resource_type_id, quantity }));
}

export const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: colors.text },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  button: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  primary: { backgroundColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  dim: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondaryText: { color: colors.text },
  picker: { gap: 6 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerLabel: { flex: 1, fontSize: 15, color: colors.text },
  stepper: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperText: { fontSize: 18, color: colors.text },
  count: { minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
});
