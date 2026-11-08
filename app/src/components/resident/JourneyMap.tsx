// Native: the journey is fully described in text next to this, so no map is drawn here.
import React from 'react';
import { Text } from 'react-native';
import { useDash } from './parts';

export interface JourneyMapProps {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number; name: string };
}

export default function JourneyMap(_: JourneyMapProps) {
  const { s } = useDash();
  return <Text style={s.secondary}>Open the shelter address in your maps app for directions.</Text>;
}
