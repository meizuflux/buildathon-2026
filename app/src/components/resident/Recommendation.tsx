// The main card: where to go, why it fits, availability, unresolved items, and one next action.
// "Recommended", "availability reported", and "placement confirmed" stay separate statements.
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { type } from '../../constants/theme';
import { distanceKm } from '../../resident/api';
import { STALE_AFTER_MINUTES } from '../../resident/rules';
import { ago, clock } from '../../resident/time';
import type { Household, Recommendation as Rec, ShelterAssessment } from '../../resident/types';
import { Icon } from './Icon';
import { Action, InlineNotice, LinkButton, Mono, StatusLabel, useDash } from './parts';
import { NEED_VISUAL, NeedBadge, ShelterArt, Stat } from './visuals';

export const km = (h: Household, a: ShelterAssessment) => `${distanceKm(h.location, a.shelter).toFixed(1)} km`;

export function Recommendation({ rec, household, now, updating, lastChange, onEditNeeds, onMessage }: {
  rec: Rec; household: Household; now: number; updating: boolean; lastChange: string[];
  onEditNeeds: () => void; onMessage: () => void;
}) {
  const { c, s } = useDash();

  if (updating) {
    return (
      <View style={[s.panel, { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 }]} accessibilityLiveRegion="polite" aria-live="polite">
        <ActivityIndicator color={c.green} size="large" />
        <Text style={s.h3}>Updating recommendation…</Text>
        <Text style={s.secondary}>Rechecking shelters for your household</Text>
      </View>
    );
  }

  const changed = lastChange.length > 0 && (
    <InlineNotice tone="primary" icon="refresh-cw" title="What changed">
      <View style={{ gap: 4 }}>
        {lastChange.map((line) => <Text key={line} style={s.noticeBody}>{line}</Text>)}
        <Mono>Updated {clock(now)}</Mono>
      </View>
    </InlineNotice>
  );

  if (!rec.destination || rec.status !== 'recommended') {
    return <View style={{ gap: 16 }}>{changed}<NoVerifiedDestination rec={rec} household={household} onMessage={onMessage} onEditNeeds={onEditNeeds} /></View>;
  }

  const d = rec.destination;
  const unknowns = [...rec.householdUnknowns, ...d.unresolved];
  return (
    <View style={{ gap: 16 }} accessibilityLiveRegion="polite" aria-live="polite">
      {changed}
      <View style={[s.panel, { padding: 0, gap: 0, overflow: 'hidden' }]}>
        <View style={{ backgroundColor: c.greenLight, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Icon name="compass" size={14} color={c.green} />
              <Text style={{ fontFamily: type.semibold, fontSize: 13, color: c.green }}>Recommended for you</Text>
            </View>
            <ShelterArt width={92} />
          </View>
          <Text accessibilityRole="header" aria-level={2} style={[s.destination, { fontSize: 26, lineHeight: 32 }]}>{d.shelter.name}</Text>
          <Text style={[s.secondary, { color: c.text }]}>{d.shelter.address}</Text>
        </View>

        <View style={{ padding: 20, gap: 20 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Stat icon="navigation" value={km(household, d)} label="straight-line distance" />
            <Spaces assessment={d} household={household} />
            <Stat icon="check-circle" value={`${d.checks.filter((x) => x.state === 'confirmed').length}/${d.checks.length}`} label="needs confirmed" tone={c.confirmed} />
          </View>

          <View style={{ gap: 12 }}>
            <Text style={s.secondary}>Recommended because it meets your household’s listed requirements.</Text>
            {d.checks.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="list">
                {d.checks.map((x) => <NeedBadge key={x.requirement} glyph={NEED_VISUAL[x.requirement].glyph} label={NEED_VISUAL[x.requirement].short} state={x.state} detail={x.label} />)}
              </View>
            )}
          </View>

          <Freshness assessment={d} now={now} reserved={rec.reserved} />

          {unknowns.length > 0 && (
            <InlineNotice tone="attention" icon="help-circle" title="Still unknown">
              <View style={{ gap: 2 }}>{unknowns.map((u) => <Text key={u} style={s.noticeBody}>{u}</Text>)}</View>
              {rec.householdUnknowns.length > 0 && <LinkButton title="Answer now" icon="edit-2" onPress={onEditNeeds} />}
            </InlineNotice>
          )}

        </View>
      </View>
    </View>
  );
}

function Spaces({ assessment, household }: { assessment: ShelterAssessment; household: Household }) {
  const { c } = useDash();
  const n = assessment.shelter.spaces;
  if (n === null) return <Stat icon="help-circle" value="?" label="spaces not reported" tone={c.amber} />;
  if (n === 0) return <Stat icon="x-circle" value="Full" label="reported" tone={c.red} />;
  const short = n < household.adults + household.children;
  return <Stat icon="users" value={String(n)} label={short ? 'spaces · too few' : n < 10 ? 'spaces · limited' : 'spaces reported'} tone={short ? c.red : n < 10 ? c.amber : c.green} />;
}

/** When availability was reported, and that nothing is a confirmed placement. */
function Freshness({ assessment, now, reserved }: { assessment: ShelterAssessment; now: number; reserved: boolean }) {
  const { s } = useDash();
  const at = assessment.shelter.spacesReportedAt;
  const stale = now - at > STALE_AFTER_MINUTES;
  return (
    <View style={{ gap: 4 }}>
      <StatusLabel tone={stale ? 'attention' : 'neutral'} icon="clock">
        Availability reported {clock(at)} ({ago(now, at)}){stale ? ' · may be out of date' : ''}
      </StatusLabel>
      {reserved
        ? <StatusLabel tone="neutral" icon="info">Space counted for you in the coordinators’ plan. Placement not confirmed.</StatusLabel>
        : <StatusLabel tone="neutral" icon="info">Placement not confirmed. No space is reserved.</StatusLabel>}
      {stale && <Text style={[s.secondary, { paddingLeft: 24 }]}>Check again before you leave.</Text>}
    </View>
  );
}

function NoVerifiedDestination({ rec, household, onMessage, onEditNeeds }: { rec: Rec; household: Household; onMessage: () => void; onEditNeeds: () => void }) {
  const { c, s } = useDash();
  const possible = rec.status === 'unverified' ? rec.destination : null;
  const all = [...(possible ? [possible] : []), ...rec.alternatives.map((a) => a.assessment)];
  return (
    <View style={[s.panel, { gap: 20, borderColor: c.amber }]} accessibilityLiveRegion="polite" aria-live="polite">
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.amberLight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="help-circle" size={28} color={c.amber} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" aria-level={2} style={[s.destination, { fontSize: 24, lineHeight: 30 }]}>No verified suitable destination right now</Text>
          <Text style={s.secondary}>No shelter is confirmed to meet all your needs.</Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {all.map((a) => {
          const blocked = a.blockers.length > 0;
          return (
            <View key={a.shelter.id} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, backgroundColor: c.cream }}>
              <Icon name={blocked ? 'x-circle' : 'help-circle'} size={20} color={blocked ? c.red : c.amber} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.strong}>{a.shelter.name}{a === possible ? ' · possible option' : ''}</Text>
                <Text style={s.secondary}>{[...a.blockers, ...a.unresolved].join(' · ') || 'Not chosen by the coordinators’ plan'}</Text>
                {a === possible && <Text style={s.secondary}>{km(household, a)} away (straight line)</Text>}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <Action title="Message the coordination desk" icon="message-circle" onPress={onMessage} />
        <LinkButton title="Review household needs" icon="edit-2" onPress={onEditNeeds} />
        <Text style={s.secondary}>Keep following official instructions.</Text>
      </View>
    </View>
  );
}
