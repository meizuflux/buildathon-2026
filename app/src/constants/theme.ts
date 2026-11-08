// Haven resident palette. Semantic colors keep one meaning each:
// amber = needs attention or confirmation, red = critical restriction or urgent official instruction,
// green (confirmed) = a specific fact or completed action is confirmed.
// Contrast is checked in tests/contrast.test.ts. The requested primary #087E8B measured 4.48:1 on the
// page background, so primary text and fills use the slightly darker #07717C (5.3:1 or better).
export const colors = {
  ink: '#142D42', text: '#142D42', muted: '#526171',
  // `green` is the historical name for the primary action color used across the app.
  green: '#07717C', greenHover: '#055F68', greenLight: '#E3F1F2',
  cream: '#F5F7FA', white: '#FFFFFF', chrome: '#F5F7FA', onPrimary: '#FFFFFF',
  border: '#D9E0E7', fieldBorder: '#6B7A89',
  amber: '#B45309', amberLight: '#FEF3E2', amberBorder: '#B45309',
  red: '#B42318', redLight: '#FDECEA', ember: '#B42318', silt: '#B9A88E',
  blue: '#355F79', blueLight: '#E1ECF3', transparent: 'transparent',
  confirmed: '#18794E', confirmedLight: '#E7F4EE',
  surface: '#FFFFFF', presenter: '#1B2733', presenterText: '#E8EEF4', presenterMuted: '#A9B7C6',
};
export type Palette = typeof colors;
export const darkColors: Palette = {
  ...colors, ink: '#F0F6FC', text: '#F0F6FC', muted: '#AEBDCC',
  green: '#7FD1D9', greenHover: '#A2E0E6', greenLight: '#123338',
  cream: '#0D1117', white: '#161E27', chrome: '#0D1117', onPrimary: '#0D1117',
  border: '#303E4C', fieldBorder: '#7C8C9D',
  amber: '#F2B266', amberLight: '#2A2114', amberBorder: '#F2B266',
  red: '#F59A8F', redLight: '#2C1A19', ember: '#F59A8F',
  blue: '#A5C6DF', blueLight: '#182C3C',
  confirmed: '#7ED3A6', confirmedLight: '#13281E', surface: '#161E27',
};
export const type = {
  family: 'IBMPlexSans_400Regular', medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold', mono: 'IBMPlexMono_500Medium', monoRegular: 'IBMPlexMono_400Regular',
  // Resident dashboard scale (px).
  pageTitle: 32, destination: 28, instruction: 17, button: 16, secondary: 15, meta: 13,
  heading: 28, section: 22, title: 17, body: 16, label: 15, caption: 13,
};
export const spacing = { micro: 4, tight: 8, related: 12, row: 16, gutter: 24, section: 32, chapter: 48 };
export const radius = { control: 10, card: 12, map: 12, sheet: 16 };
