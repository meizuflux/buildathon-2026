// Shared building blocks. Status is always icon + text (+ color), never color alone.
// IBM Plex Mono is used only for times and IDs.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { type Palette, type } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Icon, type IconName } from './Icon';

export type Tone = 'neutral' | 'primary' | 'attention' | 'critical' | 'confirmed';

const cache = new WeakMap<Palette, ReturnType<typeof makeStyles>>();
export function useDash() {
  const { palette: c } = useTheme();
  let s = cache.get(c);
  if (!s) { s = makeStyles(c); cache.set(c, s); }
  return { c, s };
}

export function toneColor(c: Palette, tone: Tone) {
  return { neutral: c.muted, primary: c.green, attention: c.amber, critical: c.red, confirmed: c.confirmed }[tone];
}
export function toneTint(c: Palette, tone: Tone) {
  return { neutral: c.cream, primary: c.greenLight, attention: c.amberLight, critical: c.redLight, confirmed: c.confirmedLight }[tone];
}

/** A section heading with a real heading level for screen readers. */
export function Heading({ children, level = 2, style }: { children: React.ReactNode; level?: 2 | 3; style?: StyleProp<TextStyle> }) {
  const { s } = useDash();
  return <Text accessibilityRole="header" aria-level={level} style={[level === 2 ? s.h2 : s.h3, style]}>{children}</Text>;
}

/** Monospace metadata: times and IDs. Tabular numerals. */
export function Mono({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { s } = useDash();
  return <Text style={[s.mono, style]}>{children}</Text>;
}

/** Icon + label status. The icon and words carry the meaning; color only reinforces it. */
export function StatusLabel({ tone, icon, children, style }: { tone: Tone; icon: IconName; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, s } = useDash();
  const color = toneColor(c, tone);
  return (
    <View style={[s.status, style]}>
      <Icon name={icon} size={16} color={color} />
      <Text style={[s.statusText, { color: tone === 'neutral' ? c.text : color }]}>{children}</Text>
    </View>
  );
}

/** A tinted inline notice with a leading icon. */
export function InlineNotice({ tone, icon, title, children, action }: { tone: Exclude<Tone, 'neutral'>; icon: IconName; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const { c, s } = useDash();
  return (
    <View style={[s.notice, { backgroundColor: toneTint(c, tone), borderColor: toneColor(c, tone) }]}>
      <Icon name={icon} size={18} color={toneColor(c, tone)} />
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        {title && <Text style={[s.noticeTitle, { color: c.text }]}>{title}</Text>}
        {typeof children === 'string' ? <Text style={s.noticeBody}>{children}</Text> : children}
        {action}
      </View>
    </View>
  );
}

/** Expandable region with aria-expanded; content is not rendered while collapsed. */
export function Disclosure({ title, summary, children, defaultOpen = false }: { title: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const { c, s } = useDash();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable accessibilityRole="button" aria-expanded={open} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={({ pressed }) => [s.disclosure, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.disclosureTitle}>{title}</Text>
          {summary && <Text style={s.secondary}>{summary}</Text>}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.green} />
      </Pressable>
      {open && <View style={{ gap: 12, paddingTop: 8 }}>{children}</View>}
    </View>
  );
}

/** Text button with an icon; 44 px minimum target. */
export function LinkButton({ title, icon, onPress, tone = 'primary', disabled }: { title: string; icon?: IconName; onPress: () => void; tone?: Tone; disabled?: boolean }) {
  const { c, s } = useDash();
  const color = toneColor(c, tone);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.link, (pressed || disabled) && { opacity: 0.6 }]}>
      {icon && <Icon name={icon} size={17} color={color} />}
      <Text style={[s.linkText, { color }]}>{title}</Text>
    </Pressable>
  );
}

/** Primary or secondary action. Only one primary action per screen state. */
export function Action({ title, icon, onPress, variant = 'primary', disabled, busy }: { title: string; icon?: IconName; onPress: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean; busy?: boolean }) {
  const { c, s } = useDash();
  const primary = variant === 'primary';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [s.action, primary ? { backgroundColor: c.green } : { backgroundColor: c.surface, borderColor: c.green, borderWidth: 1 }, (pressed || disabled) && { opacity: 0.7 }]}>
      {icon && <Icon name={icon} size={18} color={primary ? c.onPrimary : c.green} />}
      <Text style={[s.actionText, { color: primary ? c.onPrimary : c.green }]}>{busy ? 'Working…' : title}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    h1: { fontFamily: type.semibold, fontSize: type.pageTitle, lineHeight: 40, color: c.ink },
    h2: { fontFamily: type.semibold, fontSize: 20, lineHeight: 28, color: c.ink },
    h3: { fontFamily: type.semibold, fontSize: 17, lineHeight: 24, color: c.ink },
    destination: { fontFamily: type.semibold, fontSize: type.destination, lineHeight: 36, color: c.ink },
    instruction: { fontFamily: type.family, fontSize: type.instruction, lineHeight: 26, color: c.text },
    body: { fontFamily: type.family, fontSize: 16, lineHeight: 24, color: c.text },
    secondary: { fontFamily: type.family, fontSize: type.secondary, lineHeight: 22, color: c.muted },
    strong: { fontFamily: type.medium, fontSize: 16, lineHeight: 24, color: c.text },
    mono: { fontFamily: type.monoRegular, fontSize: type.meta, lineHeight: 20, color: c.muted, fontVariant: ['tabular-nums'] },
    status: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
    statusText: { fontFamily: type.medium, fontSize: type.secondary, lineHeight: 22, flexShrink: 1 },
    notice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 12, borderLeftWidth: 4, alignItems: 'flex-start' },
    noticeTitle: { fontFamily: type.semibold, fontSize: 16, lineHeight: 24 },
    noticeBody: { fontFamily: type.family, fontSize: type.secondary, lineHeight: 22, color: c.text },
    disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    disclosureTitle: { fontFamily: type.medium, fontSize: 16, lineHeight: 24, color: c.ink },
    link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, alignSelf: 'flex-start' },
    linkText: { fontFamily: type.medium, fontSize: type.button, lineHeight: 24 },
    action: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    actionText: { fontFamily: type.medium, fontSize: type.button, lineHeight: 22 },
    panel: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 20, gap: 16 },
    section: { gap: 12 },
    input: { minHeight: 48, borderWidth: 1, borderColor: c.fieldBorder, borderRadius: 10, paddingHorizontal: 14, fontFamily: type.family, fontSize: 16, color: c.text, backgroundColor: c.surface },
  });
}
