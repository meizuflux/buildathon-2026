export type Coordinate = { latitude: number; longitude: number };
export type ShelterMapProps = { origin?: Coordinate | null; destination: Coordinate; name: string };
export function coordinate(value?: { latitude?: number; longitude?: number } | null): Coordinate | null {
  return value?.latitude !== undefined && value.longitude !== undefined && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180 ? { latitude: value.latitude, longitude: value.longitude } : null;
}
export function distanceMiles(a: Coordinate, b: Coordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude), dLon = radians(b.longitude - a.longitude);
  const arc = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.min(1, arc)), Math.sqrt(Math.max(0, 1 - arc)));
}
export function showSafetyStatus(disasterType?: string): boolean {
  return !/hurricane/i.test(disasterType ?? '');
}
