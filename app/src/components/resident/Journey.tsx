// Journey: a map of home and the destination, and the straight-line distance.
// The service has no road or travel-time data, so no route is drawn or implied.
import React from 'react';
import { Text, View } from 'react-native';
import { type } from '../../constants/theme';
import type { Household, Recommendation } from '../../resident/types';
import { Icon } from './Icon';
import JourneyMap from './JourneyMap';
import { Heading, useDash } from './parts';
import { km } from './Recommendation';

export function Journey({ rec, household }: {
  rec: Recommendation; household: Household;
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
  const distance = km(household, d);
  return (
    <View style={s.section} nativeID="journey">
      <Heading>{rec.status === 'recommended' ? 'Your journey' : 'Journey to possible option'}</Heading>
      <View style={[s.panel, { gap: 16 }]}>
        <JourneyMap origin={household.location} destination={{ lat: d.shelter.lat, lng: d.shelter.lng, name: d.shelter.name }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }} aria-label="Map legend">
          <Legend color={c.ink} label="Home area" />
          <Legend color={c.green} label="Shelter" />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible
          accessibilityLabel={`${d.shelter.name} is ${distance} away in a straight line. Travel time is not available.`}>
          <Stop icon="home" color={c.ink} label="Home" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ alignSelf: 'stretch', borderTopWidth: 3, borderStyle: 'dashed', borderColor: c.green }} />
            <View style={{ position: 'absolute', top: -14, backgroundColor: c.green, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontFamily: type.semibold, fontSize: 14, color: c.onPrimary, fontVariant: ['tabular-nums'] }}>{distance}</Text>
            </View>
          </View>
          <Stop icon="map-pin" color={c.green} label="Shelter" />
        </View>
        <Text style={s.secondary}>Straight-line distance. Use your maps app for directions and follow official road guidance.</Text>

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

function Legend({ color, label }: { color: string; label: string }) {
  const { s } = useDash();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text style={[s.secondary, { fontSize: 13 }]}>{label}</Text>
    </View>
  );
}
