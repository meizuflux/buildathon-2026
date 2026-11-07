// Emergency triage palette. Semantic alert colors remain fixed in both modes.
export const colors = {
  ink: '#1D2B3A', text: '#1D2B3A', muted: '#4E606F',
  green: '#246B68', greenHover: '#1D5654', greenLight: '#DFEDEA',
  cream: '#F0F6FC', white: '#FFFFFF', chrome: '#F0F6FC', onPrimary: '#FFFFFF',
  border: '#CED9E2', fieldBorder: '#70818F',
  amber: '#E67E00', amberLight: '#FFFFFF', amberBorder: '#E67E00',
  red: '#D9381E', redLight: '#FFFFFF', ember: '#D9381E', silt: '#B9A88E',
  blue: '#355F79', blueLight: '#E1ECF3', transparent: 'transparent',
};
export type Palette = typeof colors;
export const darkColors: Palette = {
  ...colors, ink: '#F0F6FC', text: '#F0F6FC', muted: '#AEBDCC',
  green: '#8BCFC5', greenHover: '#A5DED5', greenLight: '#19312F',
  cream: '#0D1117', white: '#161E27', chrome: '#0D1117', onPrimary: '#0D1117',
  border: '#303E4C', fieldBorder: '#7C8C9D',
  amberLight: '#161E27', redLight: '#161E27', blue: '#A5C6DF', blueLight: '#182C3C',
};
export const type = {
  family: 'IBMPlexSans_400Regular', medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold', mono: 'IBMPlexMono_500Medium',
  heading: 28, section: 22, title: 17, body: 16, label: 15, caption: 13,
};
export const spacing = { micro: 4, tight: 8, related: 12, row: 16, gutter: 24, section: 32, chapter: 48 };
export const radius = { control: 8, map: 0, sheet: 16 };
