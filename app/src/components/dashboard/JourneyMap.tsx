// Native fallback: the journey is fully described in text, so no map is drawn here.
import React from 'react';
import { Text } from 'react-native';
import { useDash } from './parts';

export interface JourneyMapProps {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number; name: string };
  path: [number, number][] | null;
  closures: { point: [number, number]; label: string }[];
}

export default function JourneyMap(_: JourneyMapProps) {
  const { s } = useDash();
  return <Text style={s.secondary}>Map preview is available in the web demo. The journey is described in text below.</Text>;
}
