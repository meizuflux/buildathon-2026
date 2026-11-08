import { useCallback, useEffect, useState } from 'react';
import { getCurrentLocation } from './location';

/**
 * The device's GPS position. Pass `override` ({ lat, lng }) to skip GPS, e.g. for a simulated demo location.
 * Pass `enabled: false` when a parent already supplies the location.
 * Returns { status: 'locating' | 'ready' | 'denied' | 'unavailable', coords, error, retry }.
 */
export default function useDeviceLocation(override, { enabled = true } = {}) {
  const [state, setState] = useState({ status: 'locating', coords: null, error: null });
  const overrideLat = override?.lat;
  const overrideLng = override?.lng;

  const locate = useCallback(async () => {
    if (overrideLat != null && overrideLng != null) {
      setState({ status: 'ready', coords: { lat: overrideLat, lng: overrideLng, accuracy: null }, error: null });
      return;
    }
    setState((s) => ({ ...s, status: 'locating', error: null }));
    try {
      setState({ status: 'ready', coords: await getCurrentLocation(), error: null });
    } catch (e) {
      setState({ status: e.code === 'denied' ? 'denied' : 'unavailable', coords: null, error: e.message });
    }
  }, [overrideLat, overrideLng]);

  useEffect(() => {
    if (enabled) locate();
  }, [locate, enabled]);

  return { ...state, retry: locate };
}
