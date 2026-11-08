// Web map of home and the destination. The view is fitted only when the destination changes.
import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import 'leaflet/dist/leaflet.css';
import type { JourneyMapProps } from './JourneyMap';
import { useDash } from './parts';

export default function JourneyMap({ origin, destination }: JourneyMapProps) {
  const { c, s } = useDash();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const layer = useRef<import('leaflet').LayerGroup | null>(null);
  const lib = useRef<typeof import('leaflet') | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void import('leaflet').then((L) => {
      if (!live || !element.current) return;
      lib.current = L;
      map.current = L.map(element.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' })
        .on('tileerror', () => { if (live) setFailed(true); }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.fitBounds([[origin.lat, origin.lng], [destination.lat, destination.lng]], { padding: [40, 40], maxZoom: 14, animate: false });
  }, [ready, destination.lat, destination.lng, origin.lat, origin.lng]);

  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !layer.current) return;
    layer.current.clearLayers();
    const dot = (lat: number, lng: number, fill: string, label: string) =>
      L.circleMarker([lat, lng], { radius: 9, color: '#FFFFFF', weight: 3, fillColor: fill, fillOpacity: 1 }).bindTooltip(label).addTo(layer.current!);
    dot(origin.lat, origin.lng, c.ink, 'Home area');
    dot(destination.lat, destination.lng, c.green, destination.name);
  }, [ready, origin.lat, origin.lng, destination.lat, destination.lng, destination.name, c]);

  return (
    <>
      <div ref={element} role="img" aria-label={`Map of your home area and ${destination.name}. Distance is described below.`}
        style={{ height: 240, width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${c.border}`, background: c.cream, zIndex: 0 }} />
      {failed && <Text style={s.secondary}>Map tiles could not load. The distance is described below.</Text>}
    </>
  );
}
