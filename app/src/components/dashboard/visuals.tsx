// Visual building blocks: line glyphs drawn to match Feather (24 grid, 2px round strokes) for things
// Feather lacks, need badges, a progress ring, a leave-by countdown, and a small shelter illustration.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { type } from '../../constants/theme';
import { clock } from '../../demo/time';
import type { CapabilityState, Requirement } from '../../demo/types';
import { Icon, type IconName } from '../common/ui';
import { useDash } from './parts';

export type GlyphName = 'wheelchair' | 'paw' | 'child' | 'adult' | 'car' | 'power';

export function Glyph({ name, size = 24, color }: { name: GlyphName; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (name === 'power') return <Icon name="zap" size={size} color={color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden aria-hidden>
      {name === 'wheelchair' && <>
        <Circle cx="11" cy="4" r="1.5" {...p} />
        <Path d="M11 7.5v5.5h5l2 5.5" {...p} />
        <Path d="M11 10h4" {...p} />
        <Path d="M14.2 17.5a5 5 0 1 1-6.7-6" {...p} />
      </>}
      {name === 'paw' && <>
        <Circle cx="6.5" cy="10" r="1.6" {...p} />
        <Circle cx="10" cy="6" r="1.6" {...p} />
        <Circle cx="14" cy="6" r="1.6" {...p} />
        <Circle cx="17.5" cy="10" r="1.6" {...p} />
        <Path d="M12 12.5c-2.5 0-5 3-5 5.2 0 1.6 1.3 2.3 2.6 2 1-.2 1.6-.6 2.4-.6s1.4.4 2.4.6c1.3.3 2.6-.4 2.6-2 0-2.2-2.5-5.2-5-5.2z" {...p} />
      </>}
      {name === 'adult' && <>
        <Circle cx="12" cy="7" r="4" {...p} />
        <Path d="M4 21v-1a7 7 0 0 1 16 0v1" {...p} />
      </>}
      {name === 'child' && <>
        <Circle cx="12" cy="10" r="3" {...p} />
        <Path d="M7 21v-.5a5 5 0 0 1 10 0v.5" {...p} />
        <Path d="M10 4.5c.6-.6 1.3-1 2-1" {...p} />
      </>}
      {name === 'car' && <>
        <Path d="M3 17v-4l2.5-5.5h13L21 13v4z" {...p} />
        <Line x1="3" y1="13" x2="21" y2="13" {...p} />
        <Circle cx="7.5" cy="17.5" r="1.8" {...p} />
        <Circle cx="16.5" cy="17.5" r="1.8" {...p} />
      </>}
    </Svg>
  );
}

export const NEED_VISUAL: Record<Requirement, { glyph: GlyphName; short: string }> = {
  wheelchairEntrance: { glyph: 'wheelchair', short: 'Step-free entry' },
  dogs: { glyph: 'paw', short: 'Dogs welcome' },
  children: { glyph: 'child', short: 'Families' },
  poweredEquipment: { glyph: 'power', short: 'Backup power' },
};

const BADGE: Record<CapabilityState, { icon: IconName; word: string }> = {
  confirmed: { icon: 'check', word: 'Confirmed' },
  unknown: { icon: 'help-circle', word: 'Unconfirmed' },
  not_available: { icon: 'x', word: 'Not available' },
};

/** A circular glyph with a status badge (check / ? / ×). Shape and word carry meaning, not just color. */
export function NeedBadge({ glyph, label, state, detail }: { glyph: GlyphName; label: string; state: CapabilityState; detail: string }) {
  const { c, s } = useDash();
  const tone = state === 'confirmed' ? c.confirmed : state === 'unknown' ? c.amber : c.red;
  const tint = state === 'confirmed' ? c.confirmedLight : state === 'unknown' ? c.amberLight : c.redLight;
  return (
    <View accessible accessibilityLabel={detail} style={{ alignItems: 'center', gap: 6, width: 92 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name={glyph} size={26} color={c.ink} />
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: tone, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={BADGE[state].icon} size={12} color={c.onPrimary} />
        </View>
      </View>
      <Text style={[s.secondary, { fontFamily: type.medium, color: c.text, textAlign: 'center', fontSize: 14, lineHeight: 18 }]}>{label}</Text>
      {state !== 'confirmed' && <Text style={{ fontFamily: type.medium, fontSize: 12, color: tone, textAlign: 'center' }}>{BADGE[state].word}</Text>}
    </View>
  );
}

/** A compact stat: icon, big value, small label. */
export function Stat({ icon, glyph, value, label, tone }: { icon?: IconName; glyph?: GlyphName; value: string; label: string; tone?: string }) {
  const { c } = useDash();
  const color = tone ?? c.green;
  return (
    <View style={{ flex: 1, minWidth: 84, padding: 12, borderRadius: 12, backgroundColor: c.cream, gap: 6 }}>
      {glyph ? <Glyph name={glyph} size={20} color={color} /> : icon && <Icon name={icon} size={20} color={color} />}
      <Text style={{ fontFamily: type.semibold, fontSize: 22, lineHeight: 28, color: c.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontFamily: type.family, fontSize: 13, lineHeight: 18, color: c.muted }}>{label}</Text>
    </View>
  );
}

export function ProgressRing({ done, total, size = 56 }: { done: number; total: number; size?: number }) {
  const { c } = useDash();
  const r = (size - 8) / 2;
  const length = 2 * Math.PI * r;
  const fraction = total ? done / total : 0;
  return (
    <View accessible accessibilityLabel={`${done} of ${total} done`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }} aria-hidden>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={6} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.confirmed} strokeWidth={6} fill="none" strokeLinecap="round"
          strokeDasharray={`${length * fraction} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ fontFamily: type.semibold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums'] }}>{done}/{total}</Text>
    </View>
  );
}

/** Time left until the official leave-by time, as text plus a bar. */
export function Countdown({ now, from, until, color }: { now: number; from: number; until: number; color: string }) {
  const { c } = useDash();
  const left = Math.max(0, until - now);
  const fraction = Math.min(1, Math.max(0, (now - from) / Math.max(1, until - from)));
  const words = left === 0 ? 'Leave-by time has passed' : `${Math.floor(left / 60)}h ${left % 60}m left`;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: type.semibold, fontSize: 26, lineHeight: 32, color: c.ink }}>Leave by <Text style={{ fontVariant: ['tabular-nums'] }}>{clock(until)}</Text></Text>
        <Text style={{ fontFamily: type.medium, fontSize: 15, color, fontVariant: ['tabular-nums'] }}>{words}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface, overflow: 'hidden' }} aria-hidden>
        <View style={{ width: `${fraction * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** Small decorative illustration of a shelter building with a dotted path to its door. */
export function ShelterArt({ width = 132 }: { width?: number }) {
  const { c } = useDash();
  const h = (width * 84) / 132;
  return (
    <Svg width={width} height={h} viewBox="0 0 132 84" accessibilityElementsHidden aria-hidden>
      <Circle cx="108" cy="18" r="10" fill={c.surface} opacity={0.9} />
      <Path d="M48 34 L80 14 L112 34 Z" fill={c.green} />
      <Rect x="54" y="34" width="52" height="40" rx="2" fill={c.surface} />
      <Rect x="74" y="50" width="12" height="24" rx="2" fill={c.green} />
      <Rect x="60" y="42" width="9" height="9" rx="1.5" fill={c.greenLight} stroke={c.green} strokeWidth={1.5} />
      <Rect x="91" y="42" width="9" height="9" rx="1.5" fill={c.greenLight} stroke={c.green} strokeWidth={1.5} />
      <Line x1="4" y1="74" x2="128" y2="74" stroke={c.green} strokeWidth={2} strokeLinecap="round" opacity={0.35} />
      <Path d="M8 66 C 24 56, 40 70, 56 66 S 70 72, 78 72" stroke={c.green} strokeWidth={2.5} strokeDasharray="1 6" strokeLinecap="round" fill="none" />
      <Circle cx="8" cy="66" r="4" fill={c.ink} />
    </Svg>
  );
}
