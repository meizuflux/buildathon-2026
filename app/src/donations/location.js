// Browser geolocation, used on web (and in donations-sandbox). Native builds use location.native.js.
export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'denied' | 'unavailable'
  }
}

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.geolocation) {
      reject(new LocationError('unavailable', "This device can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      (error) =>
        reject(
          error.code === 1
            ? new LocationError('denied', 'Location permission is needed so workers can find you.')
            : new LocationError('unavailable', "Couldn't get your location. Check that location services are on and retry."),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
