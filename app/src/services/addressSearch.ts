import { z } from 'zod';

export type AddressSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

const photonResponse = z.object({
  features: z.array(z.object({
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.record(z.string(), z.unknown()),
  })),
});

function property(properties: Record<string, unknown>, key: string): string {
  const value = properties[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function parseAddressResults(payload: unknown): AddressSuggestion[] {
  const parsed = photonResponse.safeParse(payload);
  if (!parsed.success) return [];

  const results: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of parsed.data.features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;

    const fields = feature.properties;
    const street = [property(fields, 'housenumber'), property(fields, 'street')].filter(Boolean).join(' ');
    if (!street) continue;
    const locality = property(fields, 'city') || property(fields, 'locality') || property(fields, 'district') || property(fields, 'county');
    const label = [...new Set([street, locality, property(fields, 'state'), property(fields, 'postcode'), property(fields, 'country')].filter(Boolean))].join(', ');
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    results.push({ label, latitude, longitude });
  }
  return results;
}

export async function searchAddresses(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: '5', lang: 'en' });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Address search is temporarily unavailable.');
  return parseAddressResults(await response.json());
}