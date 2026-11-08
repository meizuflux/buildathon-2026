import type { ConfigContext, ExpoConfig } from 'expo/config';
export default ({ config }: ConfigContext): ExpoConfig => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    name: config.name ?? 'Haven',
    slug: config.slug ?? 'haven-response',
    extra: { ...config.extra, androidMapsConfigured: Boolean(key || config.android?.config?.googleMaps?.apiKey) },
    android: {
      ...config.android,
      ...(key ? { config: { ...config.android?.config, googleMaps: { apiKey: key } } } : {}),
    },
  };
};
