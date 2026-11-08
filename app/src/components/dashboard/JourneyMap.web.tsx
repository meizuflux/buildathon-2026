// Restrained web map for the journey preview. The route line is illustrative (dashed) and is never
// presented as navigable road geometry. The view is fitted only when the destination changes.
import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import 'leaflet/dist/leaflet.css';
import type { JourneyMapProps } from './JourneyMap';
import { useDash } from './parts';

export default function JourneyMap({ origin, destination, path, closures }: JourneyMapProps) {
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
      map.current = L.map(element.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' })
        .on('tileerror', () => { if (live) setFailed(true); }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; map.current?.remove(); map.current = null; };
  }, []);

  // Fit only when the destination changes, so the view never moves on its own otherwise.
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.fitBounds([[origin.lat, origin.lng], [destination.lat, destination.lng]], { padding: [40, 40], maxZoom: 14, animate: false });
  }, [ready, destination.lat, destination.lng, origin.lat, origin.lng]);

  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !layer.current) return;
    layer.current.clearLayers();
    if (path) {
      L.polyline(path, { color: c.green, weight: 4, opacity: 0.9, dashArray: '2 10', lineCap: 'round' })
        .bindTooltip('Illustrative route, not navigation').addTo(layer.current);
    }
    const dot = (lat: number, lng: number, fill: string, label: string) =>
      L.circleMarker([lat, lng], { radius: 9, color: '#FFFFFF', weight: 3, fillColor: fill, fillOpacity: 1 }).bindTooltip(label).addTo(layer.current!);
    dot(origin.lat, origin.lng, c.ink, 'Start: your household area');
    dot(destination.lat, destination.lng, c.green, `Destination: ${destination.name}`);
    for (const closure of closures) {
      L.marker(closure.point, {
        icon: L.divIcon({ className: 'journey-closure', html: '<span aria-hidden="true">×</span>', iconSize: [24, 24] }),
        title: `Road closed: ${closure.label}`,
        keyboard: false,
      }).bindTooltip(`Road closed: ${closure.label}`).addTo(layer.current);
    }
  }, [ready, path, closures, origin.lat, origin.lng, destination.lat, destination.lng, destination.name, c]);

  return (
    <>
      <div ref={element} role="img" aria-label={`Map preview: start area, ${destination.name}, an illustrative route line, and ${closures.length} road closure${closures.length === 1 ? '' : 's'}. The same information is listed in text below.`}
        className="journey-map" style={{ height: 260, width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${c.border}`, background: c.cream, zIndex: 0 }} />
      {failed && <Text style={s.secondary}>Map tiles could not load. The journey is described in text below.</Text>}
    </>
  );
}
