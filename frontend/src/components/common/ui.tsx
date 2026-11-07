import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors as c, type } from '../../constants/theme';
import { useSyncContext } from '../../hooks/useSync';
import { config } from '../../constants/config';
import type { Source } from '../../types/models';
export type IconName = React.ComponentProps<typeof Feather>['name'];
export const Icon = ({ name, size = 20, color = c.muted }: { name: IconName; size?: number; color?: string }) => <Feather name={name} size={size} color={color} accessible={false} aria-hidden />;
export function date(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not yet synchronized'; }
export const label = (value: string) => { const text = value.replace(/_/g, ' '); return text.charAt(0).toUpperCase() + text.slice(1); };
export function Button({ title, onPress, href, variant = 'primary', icon, disabled, busy }: { title: string; onPress?: () => void; href?: Href; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; disabled?: boolean; busy?: boolean }) {
  const dark = variant === 'primary' || variant === 'danger';
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={href ? () => router.push(href) : onPress} style={({ pressed }) => [s.button, variant === 'primary' ? s.primary : variant === 'danger' ? { backgroundColor: c.red } : variant === 'secondary' ? s.secondary : { backgroundColor: c.transparent }, (disabled || busy) && { opacity: 0.55 }, pressed && { opacity: 0.75 }]}>{busy ? <ActivityIndicator color={dark ? c.white : c.green} /> : icon && !['arrow-right', 'chevron-right'].includes(icon) ? <Icon name={icon} color={dark ? c.white : c.green} size={17} /> : null}<Text style={[s.buttonText, { color: dark ? c.white : c.green }]}>{title}</Text></Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: React.ComponentProps<typeof View>['style'] }) { return <View style={[s.card, style]}>{children}</View>; }
export function Row({ children, style }: { children: React.ReactNode; style?: React.ComponentProps<typeof View>['style'] }) { return <View style={[s.row, style]}>{children}</View>; }
export function Title({ children, small }: { children: React.ReactNode; small?: boolean }) { return <Text accessibilityRole="header" aria-level={2} style={small ? s.h3 : s.h2}>{children}</Text>; }
export function Body({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) { return <Text style={[s.body, muted && { color: c.muted }]}>{children}</Text>; }
// Metadata carries data such as plan versions and onboarding progress.
export function Metadata({ children, light }: { children: React.ReactNode; light?: boolean }) { return <Text style={[s.sectionLabel, light && { color: c.white }]}>{children}</Text>; }
export function Badge({ value }: { value: string }) {
  const good = ['confirmed', 'accepted', 'fulfilled', 'active', 'verified'].includes(value);
  const bad = ['unavailable', 'cancelled', 'unable_to_fulfill', 'warning'].includes(value);
  return <View style={[s.badge, { backgroundColor: good ? c.greenLight : bad ? c.redLight : c.amberLight }]}><Text style={{ color: good ? c.green : bad ? c.red : c.amber, fontFamily: type.family, fontSize: type.caption, fontWeight: '600' }}>{label(value)}</Text></View>;
}
export function Attribution({ source, timestamp }: { source: Source; timestamp?: string }) { return <View style={{ gap: 3, marginTop: 10 }}><Text style={s.caption}>{source.name}</Text><Text style={s.caption}>{source.verified ? 'Verified' : 'Unverified'} {source.kind} source</Text>{timestamp && <Text style={s.caption}>Updated {date(timestamp)}</Text>}{source.url && <Text style={s.caption}>{source.url}</Text>}</View>; }
export function Notice({ children, danger }: { children: React.ReactNode; danger?: boolean }) { return <Row style={[s.notice, danger && { backgroundColor: c.redLight }]}><Icon name={danger ? 'alert-triangle' : 'info'} size={17} color={danger ? c.red : c.amber} /><Text style={{ color: danger ? c.red : c.amber, fontFamily: type.family, fontSize: type.label, lineHeight: 22, flex: 1 }}>{children}</Text></Row>; }
export function Field({ title, value, onChangeText, multiline, numeric, placeholder }: { title: string; value: string; onChangeText: (text: string) => void; multiline?: boolean; numeric?: boolean; placeholder?: string }) { return <View style={{ gap: 8, marginBottom: 16 }}><Text style={s.fieldLabel}>{title}</Text><TextInput accessibilityLabel={title} style={[s.input, multiline && { minHeight: 100, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={numeric ? 'number-pad' : 'default'} placeholder={placeholder} placeholderTextColor={c.muted} maxLength={multiline ? 1000 : 150} /></View>; }
export function Toggle({ title, selected, onPress, detail }: { title: string; selected: boolean; onPress: () => void; detail?: string }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.toggle, selected && { borderColor: c.green, backgroundColor: c.greenLight }, pressed && { opacity: 0.75 }]}><View style={{ flex: 1, gap: 4 }}><Text style={s.fieldLabel}>{title}</Text>{detail && <Text style={s.caption}>{detail}</Text>}</View><View style={[s.check, selected && { backgroundColor: c.green, borderColor: c.green }]}>{selected && <Icon name="check" size={14} color={c.white} />}</View></Pressable>; }
export function Empty({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) { return <Card style={{ alignItems: 'flex-start', gap: 12 }}><Title small>{title}</Title><Body muted>{message}</Body>{action}</Card>; }
export function QueryState({ query, children }: { query: { isPending: boolean; isError: boolean; error: Error | null; data: unknown; refetch: () => unknown }; children: React.ReactNode }) {
  const { online } = useSyncContext();
  if (query.isPending && !online) return <Notice>No saved information is available for this section. Reconnect to load it.</Notice>;
  if (query.isPending) return <Card><ActivityIndicator color={c.green} /><Body muted>Loading your information…</Body></Card>;
  return <>{query.isError && <Notice danger>{query.error?.message} {query.data !== undefined ? 'Saved information is shown below and may be outdated.' : ''}</Notice>}{query.isError && <Button title="Try again" variant="secondary" onPress={() => void query.refetch()} />}{children}</>;
}
export function Page({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const sync = useSyncContext();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.cream }}><View style={s.topbar}><Row style={{ width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'space-between' }}><Text style={s.caption}>{!sync.online ? 'Offline. Saved information' : sync.syncError ? 'Connection needs attention' : 'Connected'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh information" onPress={() => void sync.refresh()} style={{ paddingVertical: 10, paddingHorizontal: 4, minHeight: 44 }}><Row><Icon name="refresh-cw" size={14} /><Text style={[s.caption, { color: c.green }]}>{sync.syncing ? 'Refreshing…' : 'Refresh'}</Text></Row></Pressable></Row></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 32, width: '100%', maxWidth: 480, alignSelf: 'center', paddingBottom: 44 }} refreshControl={<RefreshControl refreshing={sync.syncing} onRefresh={() => void sync.refresh()} tintColor={c.green} />}>
    <View style={{ gap: 4 }}>{config.mode === 'mock' && <Text style={s.demoLabel}>Demo data. All alerts and assignments are fictional.</Text>}<Text style={s.caption}>Last full refresh: {date(sync.lastSync)}</Text></View>
    {(!sync.online || sync.syncError) && <Notice>{!sync.online ? `You’re offline. Saved plans and assignments may be outdated. Last refresh: ${date(sync.lastSync)}. Verify availability with the provider.` : `${sync.syncError} Last full refresh: ${date(sync.lastSync)}.`}</Notice>}
    {sync.online && sync.syncing && <Notice>Refreshing saved information. Resource availability has not yet been reverified. Last full refresh: {date(sync.lastSync)}.</Notice>}
    {!!sync.storageError && <Notice danger>{sync.storageError}</Notice>}
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}><View style={{ gap: 8, flexShrink: 1, minWidth: 0 }}><Text accessibilityRole="header" aria-level={1} style={s.h1}>{title}</Text>{subtitle && <Body muted>{subtitle}</Body>}</View>{action}</Row>
    {children}
    <View style={{ marginTop: 16, paddingTop: 16 }}><Text style={s.caption}>In immediate danger, contact official emergency services. Haven is not an emergency dispatch service.</Text></View>
  </ScrollView></SafeAreaView>;
}
export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { paddingVertical: 8, borderRadius: 0, backgroundColor: c.transparent, gap: 16, minWidth: 0 },
  h1: { fontFamily: type.semibold, fontSize: type.heading, color: c.ink, lineHeight: 32, minWidth: 0 },
  h2: { fontFamily: type.semibold, fontSize: type.section, color: c.ink, lineHeight: 28, minWidth: 0, flexShrink: 1 },
  h3: { fontFamily: type.semibold, fontSize: type.title, color: c.ink, lineHeight: 24, minWidth: 0, flexShrink: 1 },
  body: { fontFamily: type.family, color: c.text, fontSize: type.body, lineHeight: 24 },
  caption: { fontFamily: type.family, color: c.muted, fontSize: type.caption, lineHeight: 20, flexShrink: 1 },
  sectionLabel: { fontFamily: type.mono, fontSize: 12, color: c.muted, lineHeight: 22 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: '100%' },
  primary: { backgroundColor: c.green }, secondary: { backgroundColor: c.greenLight },
  buttonText: { fontFamily: type.semibold, fontSize: type.label, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', flexShrink: 0 },
  notice: { padding: 14, borderRadius: 8, backgroundColor: c.amberLight, alignItems: 'flex-start' },
  input: { fontFamily: type.family, borderColor: c.fieldBorder, borderWidth: 1, borderRadius: 8, backgroundColor: c.white, padding: 12, minHeight: 48, fontSize: type.body, color: c.ink },
  fieldLabel: { fontFamily: type.family, fontSize: type.label, lineHeight: 22, color: c.ink, fontWeight: '500' },
  toggle: { minHeight: 54, paddingVertical: 14, paddingHorizontal: 0, borderWidth: 0, borderColor: c.fieldBorder, borderRadius: 8, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 8 },
  check: { height: 22, width: 22, borderWidth: 1, borderColor: c.fieldBorder, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  topbar: { minHeight: 48, paddingVertical: 0, backgroundColor: c.chrome, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  demoLabel: { fontFamily: type.family, fontSize: type.caption, color: c.amber, lineHeight: 20 },
  divider: { height: 16, backgroundColor: c.transparent },
  grid: { flexDirection: 'row', gap: 20, alignItems: 'stretch' },
});
