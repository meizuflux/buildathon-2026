// The dominant panel: where to go, why it fits, availability, unresolved items, and one next action.
// "Recommended", "availability reported", and "placement confirmed" are separate statements.
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { STALE_AFTER_MINUTES } from '../../demo/scenario';
import { ago, clock } from '../../demo/time';
import type { DemoHousehold, Recommendation as Rec, ShelterAssessment } from '../../demo/types';
import { Icon } from '../common/ui';
import { Action, Heading, InlineNotice, LinkButton, Mono, StatusLabel, useDash } from './parts';

export function travelMode(h: DemoHousehold) {
  return h.vehicle === 'yes' ? 'car' : 'assisted transport';
}

export function Recommendation({ rec, household, now, updating, lastChange, onReviewJourney, onEditNeeds, onMessage }: {
  rec: Rec; household: DemoHousehold; now: number; updating: boolean; lastChange: string[];
  onReviewJourney: () => void; onEditNeeds: () => void; onMessage: () => void;
}) {
  const { c, s } = useDash();

  if (updating) {
    return (
      <View style={[s.panel, { minHeight: 220, justifyContent: 'center' }]} accessibilityLiveRegion="polite" aria-live="polite">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={c.green} />
          <Text style={s.h3}>Updating recommendation…</Text>
        </View>
        <Text style={s.secondary}>Checking shelters against your household’s listed requirements and current road conditions.</Text>
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

  // After the household has left, keep showing their destination (with any advisory) instead of switching views.
  if (!rec.destination || (rec.status !== 'recommended' && !rec.keptBecauseTravelling)) {
    return <View style={{ gap: 16 }}>{changed}<NoVerifiedDestination rec={rec} household={household} onMessage={onMessage} onEditNeeds={onEditNeeds} /></View>;
  }

  const d = rec.destination;
  return (
    <View style={{ gap: 16 }} accessibilityLiveRegion="polite" aria-live="polite">
      {changed}
      {rec.advisory && <InlineNotice tone="critical" icon="alert-triangle" title="Conditions changed after you left">{rec.advisory}</InlineNotice>}
      <View style={[s.panel, { gap: 20 }]}>
        <View style={{ gap: 8 }}>
          <StatusLabel tone="primary" icon="compass">{rec.keptBecauseTravelling ? 'Your destination · you marked that you have left' : 'Recommended for your household'}</StatusLabel>
          <Text accessibilityRole="header" aria-level={2} style={s.destination}>{d.shelter.name}</Text>
          <Text style={s.secondary}>{d.shelter.address}</Text>
        </View>

        <Journey assessment={d} household={household} />

        <View style={{ gap: 12 }}>
          <Text style={s.instruction}>{rec.status === 'recommended'
            ? 'Recommended because it meets your household’s listed requirements.'
            : 'Chosen before you left. It no longer meets every listed requirement; see the notice above.'}</Text>
          <View style={{ gap: 8 }} accessibilityRole="list">
            {d.checks.filter((x) => x.state === 'confirmed').slice(0, 3).map((x) => (
              <StatusLabel key={x.requirement} tone="confirmed" icon="check-circle">{x.label}</StatusLabel>
            ))}
          </View>
        </View>

        <View style={{ gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border }}>
          <Availability assessment={d} now={now} household={household} />
          <StatusLabel tone="neutral" icon="info">Placement not confirmed. This app cannot reserve a space.</StatusLabel>
        </View>

        {(rec.householdUnknowns.length > 0 || d.unresolved.length > 0) && (
          <InlineNotice tone="attention" icon="help-circle" title="Not yet known">
            <View style={{ gap: 4 }}>
              {rec.householdUnknowns.map((u) => <Text key={u} style={s.noticeBody}>{u}. This affects which shelters fit your household.</Text>)}
              {d.unresolved.map((u) => <Text key={u} style={s.noticeBody}>{d.shelter.name}: {u.toLowerCase()}.</Text>)}
            </View>
            {rec.householdUnknowns.length > 0 && <LinkButton title="Answer in household needs" icon="edit-2" onPress={onEditNeeds} />}
          </InlineNotice>
        )}

        <Action title="Review journey" icon="map" onPress={onReviewJourney} />
      </View>
    </View>
  );
}

function Journey({ assessment, household }: { assessment: ShelterAssessment; household: DemoHousehold }) {
  const { c, s } = useDash();
  if (!assessment.route) return <StatusLabel tone="critical" icon="x-octagon">No route currently available</StatusLabel>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Icon name="navigation" size={20} color={c.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.strong}>
          About {assessment.route.minutes} min by {travelMode(household)}
          <Text style={s.secondary}> · estimated</Text>
        </Text>
        <Text style={s.secondary}>Via {assessment.route.via}{assessment.rerouted ? ' (avoiding a road closure)' : ''}</Text>
      </View>
    </View>
  );
}

export function Availability({ assessment, now, household }: { assessment: ShelterAssessment; now: number; household: DemoHousehold }) {
  const { s } = useDash();
  const { shelter } = assessment;
  const stale = now - shelter.spacesReportedAt > STALE_AFTER_MINUTES;
  const people = household.adults + household.children;
  return (
    <View style={{ gap: 2 }}>
      {shelter.spaces === null ? (
        <StatusLabel tone="attention" icon="help-circle">Available space not reported</StatusLabel>
      ) : shelter.spaces === 0 ? (
        <StatusLabel tone="critical" icon="x-circle">Reported full</StatusLabel>
      ) : (
        <StatusLabel tone={shelter.spaces < people ? 'critical' : 'neutral'} icon="users">
          Availability reported: {shelter.spaces} spaces{shelter.spaces < 10 ? ' (limited)' : ''}
        </StatusLabel>
      )}
      <Mono style={{ paddingLeft: 24 }}>Reported {clock(shelter.spacesReportedAt)} ({ago(now, shelter.spacesReportedAt)}){stale ? ' · may be out of date' : ''}</Mono>
      {stale && <Text style={[s.secondary, { paddingLeft: 24 }]}>This report is more than an hour old. Availability may have changed.</Text>}
    </View>
  );
}

function NoVerifiedDestination({ rec, household, onMessage, onEditNeeds }: { rec: Rec; household: DemoHousehold; onMessage: () => void; onEditNeeds: () => void }) {
  const { c, s } = useDash();
  const possible = rec.status === 'unverified' ? rec.destination : null;
  const all = [...(possible ? [{ assessment: possible, whyNot: '' }] : []), ...rec.alternatives];
  return (
    <View style={[s.panel, { gap: 20, borderColor: c.amber }]} accessibilityLiveRegion="polite" aria-live="polite">
      <View style={{ gap: 8 }}>
        <StatusLabel tone="attention" icon="help-circle">No verified suitable destination right now</StatusLabel>
        <Text accessibilityRole="header" aria-level={2} style={[s.destination, { fontSize: 24, lineHeight: 32 }]}>We could not confirm a destination that meets all of your household’s listed requirements.</Text>
      </View>

      {possible && (
        <View style={{ gap: 8, padding: 16, borderRadius: 12, backgroundColor: c.cream }}>
          <Text style={s.h3}>Possible option, not verified: {possible.shelter.name}</Text>
          {possible.checks.filter((x) => x.state === 'confirmed').map((x) => <StatusLabel key={x.requirement} tone="confirmed" icon="check-circle">{x.label}</StatusLabel>)}
          {possible.unresolved.map((u) => <StatusLabel key={u} tone="attention" icon="help-circle">{u}</StatusLabel>)}
          {possible.route && <Text style={s.secondary}>About {possible.route.minutes} min by {travelMode(household)} via {possible.route.via} · estimated</Text>}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Heading level={3}>What could not be confirmed</Heading>
        {all.map(({ assessment }) => (
          <View key={assessment.shelter.id} style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={[s.secondary, { color: c.text }]}>•</Text>
            <Text style={[s.secondary, { flex: 1, color: c.text }]}>
              <Text style={{ fontFamily: s.strong.fontFamily }}>{assessment.shelter.name}: </Text>
              {[...assessment.blockers, ...assessment.unresolved].join('. ') || 'No issues found'}.
            </Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 12 }}>
        <Heading level={3}>What you can do now</Heading>
        <Text style={s.instruction}>Message a coordinator to confirm whether a shelter can meet your household’s needs. Keep following the official instruction above.</Text>
        <Action title="Message a coordinator" icon="message-circle" onPress={onMessage} />
        <LinkButton title="Review household needs" icon="edit-2" onPress={onEditNeeds} />
      </View>
    </View>
  );
}
