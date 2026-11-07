import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Body } from '../common/ui';
import type { ShelterMapProps } from '../../utils/shelter';
import 'leaflet/dist/leaflet.css';
export default function ShelterMap({ origin, destination, name }: ShelterMapProps) {
  const { dark, palette: c } = useTheme(); const element = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; let map: import('leaflet').Map | undefined;
    setFailed(false);
    void import('leaflet').then(L => {
      if (!live || !element.current) return;
      map = L.map(element.current, { zoomControl: true, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([destination.latitude, destination.longitude], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).on('tileerror', () => { if (live) setFailed(true); }).addTo(map);
      const marker = (point: { latitude: number; longitude: number }, text: string, color: string) => {
        const label = document.createElement('span'); label.textContent = text;
        L.circleMarker([point.latitude, point.longitude], { radius: 8, color: '#FFFFFF', weight: 3, fillColor: color, fillOpacity: 1 }).bindTooltip(label, { permanent: false, direction: 'top' }).addTo(map!);
      };
      marker(destination, name, '#246B68');
      if (origin) { marker(origin, 'Shared household location', '#355F79'); map.fitBounds([[origin.latitude, origin.longitude], [destination.latitude, destination.longitude]], { padding: [48, 48], maxZoom: 15, animate: false }); }
      map.invalidateSize({ animate: false });
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; map?.remove(); };
  }, [origin?.latitude, origin?.longitude, destination.latitude, destination.longitude, name]);
  return <View style={{ gap: 12 }}><div ref={element} role="region" aria-label={'Map of assigned shelter and shared household location'} className="shelter-map" data-night={dark ? 'true' : 'false'} style={{ height: 300, width: '100%', background: c.white, zIndex: 0 }} />{failed && <Body muted>Map tiles could not load. The shelter address remains available below.</Body>}</View>;
}
