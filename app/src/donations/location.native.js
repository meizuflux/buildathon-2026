// Device GPS on iOS/Android via expo-location (`npx expo install expo-location`).
// Metro picks this file over location.js on native platforms.
import * as Location from 'expo-location';

export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'denied' | 'unavailable'
  }
}

export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationError('denied', 'Location permission is needed so workers can find you.');
  }
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
  } catch {
    throw new LocationError('unavailable', "Couldn't get a GPS fix. Move somewhere with a clearer sky view and retry.");
  }
}
