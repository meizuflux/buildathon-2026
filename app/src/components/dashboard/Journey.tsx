// Journey preview: text summary first (complete without the map), then an illustrative map and legend.
import React from 'react';
import { Text, View } from 'react-native';
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
        <View style={s.panel}><Text style={s.body}>No journey to show until a destination is available.</Text></View>
      </View>
    );
  }
  const relevant = closures.filter((x) => d.shelter.routes.some((r) => r.roads.includes(x.road)));
  const blocking = (x: Closure) => !d.route || d.route.roads.includes(x.road);

  return (
    <View style={s.section} nativeID="journey">
      <Heading>{rec.status === 'recommended' || rec.keptBecauseTravelling ? 'Journey to' : 'Journey to possible option:'} {d.shelter.name}</Heading>
      <View style={[s.panel, { gap: 16 }]}>
        <View style={{ gap: 8 }} accessibilityRole="list">
          <Leg icon="circle" title="Start" body={household.location.label} />
          {d.route
            ? <Leg icon="more-vertical" title={`About ${d.route.minutes} min by ${travelMode(household)} (estimated)`} body={`Via ${d.route.via}${d.rerouted ? ', avoiding a closed road' : ''}`} />
            : <Leg icon="x-octagon" title="No route currently available" body="Every known route to this shelter passes a closed road." tone={c.red} />}
          <Leg icon="map-pin" title={d.shelter.name} body={d.shelter.address} />
        </View>

        {relevant.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={s.strong}>Road closures on routes to this shelter</Text>
            {relevant.map((x) => (
              <View key={x.id} style={{ gap: 2 }}>
                <StatusLabel tone={blocking(x) ? 'critical' : 'attention'} icon="x-octagon">
                  {x.label}: closed ({x.reason.toLowerCase()}){blocking(x) ? '' : ' · route avoids it'}
                </StatusLabel>
                <Mono style={{ paddingLeft: 24 }}>Reported {clock(x.at)} by {x.authority}</Mono>
              </View>
            ))}
          </View>
        )}

        <JourneyMap
          origin={household.location}
          destination={{ lat: d.shelter.lat, lng: d.shelter.lng, name: d.shelter.name }}
          path={d.route?.path ?? null}
          closures={relevant.map((x) => ({ point: x.point, label: x.label }))}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }} aria-label="Map legend">
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.ink }} />} label="Start area" />
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.green }} />} label="Destination" />
          <Legend swatch={<View style={{ width: 22, borderTopWidth: 3, borderStyle: 'dashed', borderColor: c.green }} />} label="Illustrative route, not navigation" />
          <Legend swatch={<Text style={{ color: c.red, fontSize: 16, lineHeight: 16 }}>×</Text>} label="Road closed" />
        </View>
        <Text style={s.secondary}>Follow road signs and instructions from officials on the way. Times are estimates.</Text>

        {travelling ? (
          <StatusLabel tone="primary" icon="navigation">You marked that you have left. Your destination will not change automatically.</StatusLabel>
        ) : rec.status === 'recommended' && d.route ? (
          <View style={{ gap: 8 }}>
            <Action title="We’ve left" icon="log-out" variant="secondary" onPress={onLeft} disabled={!online} />
            <Text style={s.secondary}>{online ? 'Tells this app you are on the way so your destination is not swapped without asking you. It does not reserve a space.' : 'Unavailable while offline.'}</Text>
          </View>
        ) : null}
        {!d.route && <InlineNotice tone="critical" icon="alert-triangle" title="Route unavailable">Message a coordinator before travelling.</InlineNotice>}
      </View>
    </View>
  );
}

function Leg({ icon, title, body, tone }: { icon: 'circle' | 'more-vertical' | 'map-pin' | 'x-octagon'; title: string; body: string; tone?: string }) {
  const { c, s } = useDash();
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Icon name={icon} size={18} color={tone ?? c.ink} />
      <View style={{ flex: 1 }}>
        <Text style={[s.strong, tone ? { color: tone } : null]}>{title}</Text>
        <Text style={s.secondary}>{body}</Text>
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  const { s } = useDash();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 22, alignItems: 'center' }}>{swatch}</View>
      <Text style={s.secondary}>{label}</Text>
    </View>
  );
}
