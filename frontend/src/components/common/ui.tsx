import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors as c, shadow } from '../../constants/theme';
import { useSyncContext } from '../../hooks/useSync';
import { config } from '../../constants/config';
import type { Source } from '../../types/models';
export type IconName = React.ComponentProps<typeof Feather>['name'];
export const Icon = ({ name, size = 20, color = c.green }: { name: IconName; size?: number; color?: string }) => <Feather name={name} size={size} color={color} />;
export function date(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not yet synchronized'; }
export const label = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
export function Button({ title, onPress, href, variant = 'primary', icon, disabled, busy }: { title: string; onPress?: () => void; href?: Href; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; disabled?: boolean; busy?: boolean }) {
  const dark = variant === 'primary' || variant === 'danger';
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={href ? () => router.push(href) : onPress} style={({ pressed }) => [s.button, variant === 'primary' ? s.primary : variant === 'danger' ? { backgroundColor: c.red } : variant === 'secondary' ? s.secondary : { backgroundColor: 'transparent' }, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}>{busy ? <ActivityIndicator color={dark ? c.white : c.green} /> : icon ? <Icon name={icon} color={dark ? c.white : c.green} size={17} /> : null}<Text style={[s.buttonText, { color: dark ? c.white : c.green }]}>{title}</Text></Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: React.ComponentProps<typeof View>['style'] }) { return <View style={[s.card, style]}>{children}</View>; }
export function Row({ children, style }: { children: React.ReactNode; style?: React.ComponentProps<typeof View>['style'] }) { return <View style={[s.row, style]}>{children}</View>; }
export function Title({ children, small }: { children: React.ReactNode; small?: boolean }) { return <Text accessibilityRole="header" style={small ? s.h3 : s.h2}>{children}</Text>; }
export function Body({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) { return <Text style={[s.body, muted && { color: c.muted }]}>{children}</Text>; }
export function Eyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) { return <Text style={[s.eyebrow, light && { color: '#C9DFCF' }]}>{children}</Text>; }
export function Badge({ value }: { value: string }) {
  const good = ['confirmed', 'accepted', 'fulfilled', 'active', 'verified'].includes(value);
  const bad = ['unavailable', 'cancelled', 'unable_to_fulfill', 'warning'].includes(value);
  return <View style={[s.badge, { backgroundColor: good ? c.greenLight : bad ? c.redLight : c.amberLight }]}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: good ? c.green : bad ? c.red : c.amber }} /><Text style={{ color: good ? c.green : bad ? c.red : c.amber, fontSize: 11, fontWeight: '700' }}>{label(value)}</Text></View>;
}
export function Attribution({ source, timestamp }: { source: Source; timestamp?: string }) { return <Row style={{ gap: 6, marginTop: 12, alignItems: 'flex-start' }}><Icon name={source.verified ? 'shield' : 'alert-circle'} size={13} color={c.muted} /><Text style={s.caption}>{source.verified ? 'Verified' : 'Unverified'} {source.kind} · {source.name}{timestamp ? `\n${date(timestamp)}` : ''}{source.url ? `\n${source.url}` : ''}</Text></Row>; }
export function Notice({ children, danger }: { children: React.ReactNode; danger?: boolean }) { return <Row style={[s.notice, danger && { backgroundColor: c.redLight }]}><Icon name={danger ? 'alert-triangle' : 'info'} size={17} color={danger ? c.red : c.amber} /><Text style={{ color: danger ? c.red : c.amber, fontSize: 13, lineHeight: 20, flex: 1 }}>{children}</Text></Row>; }
export function Field({ title, value, onChangeText, multiline, numeric, placeholder }: { title: string; value: string; onChangeText: (text: string) => void; multiline?: boolean; numeric?: boolean; placeholder?: string }) { return <View style={{ gap: 8, marginBottom: 16 }}><Text style={s.fieldLabel}>{title}</Text><TextInput accessibilityLabel={title} style={[s.input, multiline && { minHeight: 100, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={numeric ? 'number-pad' : 'default'} placeholder={placeholder} placeholderTextColor={c.muted} maxLength={multiline ? 1000 : 150} /></View>; }
export function Toggle({ title, selected, onPress, detail }: { title: string; selected: boolean; onPress: () => void; detail?: string }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={title} onPress={onPress} style={[s.toggle, selected && { borderColor: c.green, backgroundColor: c.greenLight }]}><View style={{ flex: 1, gap: 4 }}><Text style={s.fieldLabel}>{title}</Text>{detail && <Text style={s.caption}>{detail}</Text>}</View><View style={[s.check, selected && { backgroundColor: c.green, borderColor: c.green }]}>{selected && <Icon name="check" size={14} color="white" />}</View></Pressable>; }
export function Empty({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) { return <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 35 }}><View style={s.iconTile}><Icon name="inbox" size={25} /></View><Title small>{title}</Title><Body muted>{message}</Body>{action}</Card>; }
export function QueryState({ query, children }: { query: { isPending: boolean; isError: boolean; error: Error | null; data: unknown; refetch: () => unknown }; children: React.ReactNode }) {
  const { online } = useSyncContext();
  if (query.isPending && !online) return <Notice>No saved information is available for this section. Reconnect to load it.</Notice>;
  if (query.isPending) return <Card><ActivityIndicator color={c.green} /><Body muted>Loading your information…</Body></Card>;
  return <>{query.isError && <Notice danger>{query.error?.message} {query.data !== undefined ? 'Saved information is shown below and may be outdated.' : ''}</Notice>}{query.isError && <Button title="Try again" variant="secondary" onPress={() => void query.refetch()} />}{children}</>;
}
export function Page({ title, subtitle, eyebrow, children, action }: { title: string; subtitle?: string; eyebrow?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const sync = useSyncContext();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.cream }}><View style={[s.topbar, { paddingHorizontal: width > 900 ? 36 : 20 }]}><Row><View style={[s.smallDot, { backgroundColor: sync.online && !sync.syncError ? c.green : c.amber }]} /><Text style={s.caption}>{!sync.online ? 'Offline · saved information' : sync.syncError ? 'Connection needs attention' : 'Connected'}{config.mode === 'mock' ? ' · Demo session' : ''}</Text></Row><Pressable accessibilityRole="button" accessibilityLabel="Refresh information" onPress={() => void sync.refresh()} style={{ paddingVertical: 10, paddingHorizontal: 4 }}><Row><Icon name="refresh-cw" size={14} /><Text style={[s.caption, { color: c.green }]}>{sync.syncing ? 'Refreshing…' : 'Refresh'}</Text></Row></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: width > 900 ? 36 : 20, gap: 22, width: '100%', maxWidth: 1320, alignSelf: 'center', paddingBottom: 44 }} refreshControl={<RefreshControl refreshing={sync.syncing} onRefresh={() => void sync.refresh()} tintColor={c.green} />}>
    {config.mode === 'mock' && <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Text style={s.demoLabel}>DEMONSTRATION · FICTIONAL ALERTS & ASSIGNMENTS</Text><Text style={s.caption}>Last refresh: {date(sync.lastSync)}</Text></Row>}
    {(!sync.online || sync.syncError) && <Notice>{!sync.online ? `You’re offline. Saved plans and assignments may be outdated. Last refresh: ${date(sync.lastSync)}. Verify availability with the provider.` : `${sync.syncError} Last full refresh: ${date(sync.lastSync)}.`}</Notice>}
    {sync.online && sync.syncing && <Notice>Refreshing saved information. Resource availability has not yet been reverified. Last full refresh: {date(sync.lastSync)}.</Notice>}
    {!!sync.storageError && <Notice danger>{sync.storageError}</Notice>}
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}><View style={{ gap: 8, flexShrink: 1 }}>{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}<Text accessibilityRole="header" style={[s.h1, width < 600 && { fontSize: 30 }]}>{title}</Text>{subtitle && <Body muted>{subtitle}</Body>}</View>{action}</Row>
    {children}
    <Row style={{ marginTop: 12, paddingTop: 18, borderTopWidth: 1, borderColor: c.border }}><Icon name="heart" size={14} color={c.muted} /><Text style={s.caption}>Here for your next step. In immediate danger, contact official emergency services. Haven is not an emergency dispatch service.</Text></Row>
  </ScrollView></SafeAreaView>;
}
export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { padding: 24, borderRadius: 18, backgroundColor: c.white, borderColor: c.border, borderWidth: 1, gap: 14, ...shadow },
  h1: { fontSize: 36, fontWeight: '600', color: c.ink, letterSpacing: -1.2 },
  h2: { fontSize: 21, fontWeight: '600', color: c.ink, letterSpacing: -0.4 },
  h3: { fontSize: 17, fontWeight: '600', color: c.ink },
  body: { color: c.text, fontSize: 14, lineHeight: 23 },
  caption: { color: c.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  eyebrow: { fontSize: 10, fontWeight: '700', color: c.green, letterSpacing: 1.7 },
  button: { minHeight: 46, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: c.green }, secondary: { backgroundColor: c.greenLight, borderWidth: 1, borderColor: c.border },
  buttonText: { fontSize: 13, fontWeight: '600' },
  badge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  notice: { padding: 15, borderRadius: 10, backgroundColor: c.amberLight, alignItems: 'flex-start' },
  input: { borderColor: c.border, borderWidth: 1, borderRadius: 10, backgroundColor: '#FCFDF9', padding: 14, minHeight: 48, fontSize: 15, color: c.ink },
  fieldLabel: { fontSize: 14, color: c.ink, fontWeight: '500' },
  toggle: { minHeight: 58, padding: 15, borderWidth: 1, borderColor: c.border, borderRadius: 10, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  check: { height: 22, width: 22, borderWidth: 1, borderColor: c.border, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 46, height: 46, borderRadius: 12, backgroundColor: c.greenLight, alignItems: 'center', justifyContent: 'center' },
  topbar: { minHeight: 64, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border, backgroundColor: '#FCFDF9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  smallDot: { width: 6, height: 6, borderRadius: 3 },
  demoLabel: { fontSize: 9, letterSpacing: 1.2, fontWeight: '700', color: c.amber },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 2 },
  grid: { flexDirection: 'row', gap: 20, alignItems: 'stretch' },
});
