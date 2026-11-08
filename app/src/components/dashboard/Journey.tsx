// Journey preview: an illustrative map plus a compact route line. The text alone is complete without the map.
import React from 'react';
import { Text, View } from 'react-native';
import { type } from '../../constants/theme';
import { clock } from '../../demo/time';
import type { Closure, DemoHousehold, Recommendation } from '../../demo/types';
import { Icon } from '../common/ui';
import JourneyMap from './JourneyMap';
import { travelMode } from './Recommendation';
import { Action, Heading, InlineNotice, Mono, StatusLabel, useDash } from './parts';

export function Journey({ rec, household, closures, travelling, online, onLeft }: {
  rec: Recommendation; household: DemoHousehold; closures: Closure[]; travelling: boolean; online: boolean; onLeft: () => void;
}) {
  const { c, s } = useDash();
  const d = rec.destination;
  if (!d) {
    return (
      <View style={s.section} nativeID="journey">
        <Heading>Journey</Heading>
        <View style={s.panel}><Text style={s.body}>No journey until a destination is available.</Text></View>
      </View>
    );
  }
  const relevant = closures.filter((x) => d.shelter.routes.some((r) => r.roads.includes(x.road)));
  const blocking = (x: Closure) => !d.route || d.route.roads.includes(x.road);

  return (
    <View style={s.section} nativeID="journey">
      <Heading>{rec.status === 'recommended' || rec.keptBecauseTravelling ? 'Your journey' : 'Journey to possible option'}</Heading>
      <View style={[s.panel, { gap: 16 }]}>
        <JourneyMap
          origin={household.location}
          destination={{ lat: d.shelter.lat, lng: d.shelter.lng, name: d.shelter.name }}
          path={d.route?.path ?? null}
          closures={relevant.map((x) => ({ point: x.point, label: x.label }))}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }} aria-label="Map legend">
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.ink }} />} label="Home area" />
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.green }} />} label="Shelter" />
          <Legend swatch={<View style={{ width: 20, borderTopWidth: 3, borderStyle: 'dashed', borderColor: c.green }} />} label="Illustrative route, not navigation" />
          <Legend swatch={<Text style={{ color: c.red, fontFamily: type.semibold, fontSize: 16, lineHeight: 16 }}>×</Text>} label="Road closed" />
        </View>

        {/* Route line: start → time → destination */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible
          accessibilityLabel={d.route ? `From ${household.location.label} to ${d.shelter.name}, about ${d.route.minutes} minutes by ${travelMode(household)} via ${d.route.via}` : `No route to ${d.shelter.name} currently available`}>
          <Stop icon="home" color={c.ink} label="Home" />
          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ alignSelf: 'stretch', borderTopWidth: 3, borderStyle: 'dashed', borderColor: d.route ? c.green : c.red }} />
            <View style={{ position: 'absolute', top: -14, backgroundColor: d.route ? c.green : c.red, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontFamily: type.semibold, fontSize: 14, color: c.onPrimary, fontVariant: ['tabular-nums'] }}>{d.route ? `${d.route.minutes} min` : 'No route'}</Text>
            </View>
          </View>
          <Stop icon="map-pin" color={c.green} label={d.shelter.name.split(' ')[0] ?? d.shelter.name} />
        </View>
        <Text style={s.secondary}>
          {d.route ? `Via ${d.route.via} · by ${travelMode(household)} · estimated${d.rerouted ? ' · avoids a closure' : ''}` : 'Every known route passes a closed road.'}
        </Text>

        {relevant.map((x) => (
          <View key={x.id} style={{ gap: 2 }}>
            <StatusLabel tone={blocking(x) ? 'critical' : 'attention'} icon="x-octagon">
              {x.label} closed{blocking(x) ? '' : ' · avoided'}
            </StatusLabel>
            <Mono style={{ paddingLeft: 24 }}>{x.reason} · {clock(x.at)}</Mono>
          </View>
        ))}

        {travelling ? (
          <StatusLabel tone="primary" icon="navigation">You’re on your way. Destination won’t change automatically.</StatusLabel>
        ) : rec.status === 'recommended' && d.route ? (
          <View style={{ gap: 6 }}>
            <Action title="We’ve left" icon="log-out" variant="secondary" onPress={onLeft} disabled={!online} />
            <Text style={[s.secondary, { textAlign: 'center' }]}>{online ? 'Locks your destination. Doesn’t reserve a space.' : 'Unavailable offline.'}</Text>
          </View>
        ) : null}
        {!d.route && <InlineNotice tone="critical" icon="alert-triangle" title="Route unavailable">Message a coordinator before travelling.</InlineNotice>}
      </View>
    </View>
  );
}

function Stop({ icon, color, label }: { icon: 'home' | 'map-pin'; color: string; label: string }) {
  const { c } = useDash();
  return (
    <View style={{ alignItems: 'center', gap: 4, width: 72 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: icon === 'home' ? c.cream : c.greenLight, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color }}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: type.medium, fontSize: 13, color: c.text }}>{label}</Text>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  const { s } = useDash();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 20, alignItems: 'center' }}>{swatch}</View>
      <Text style={[s.secondary, { fontSize: 13 }]}>{label}</Text>
    </View>
  );
}
