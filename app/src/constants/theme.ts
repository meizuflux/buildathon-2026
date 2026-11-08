// Emergency triage palette. Semantic alert colors remain fixed in both modes.
export const colors = {
  ink: '#1B2835', text: '#263744', muted: '#657784',
  green: '#0793C2', greenHover: '#087BA2', greenLight: '#E0F4FA',
  cream: '#F6FAFC', white: '#FFFFFF', chrome: '#FFFFFF', onPrimary: '#FFFFFF',
  border: '#D9E5EB', fieldBorder: '#9BAEB9',
  amber: '#D98400', amberLight: '#FFF8E9', amberBorder: '#D98400',
  red: '#E74487', redLight: '#FFF0F5', ember: '#E74487', silt: '#B9A88E',
  blue: '#078CAF', blueLight: '#E5F5FA', transparent: 'transparent',
};
export type Palette = typeof colors;
export const darkColors: Palette = {
  ...colors, ink: '#F0F6FC', text: '#F0F6FC', muted: '#AEBDCC',
  green: '#53C5E7', greenHover: '#78D5EF', greenLight: '#17313B',
  cream: '#111A20', white: '#19252D', chrome: '#111A20', onPrimary: '#0D1117',
  border: '#303E4C', fieldBorder: '#7C8C9D',
  amberLight: '#19252D', redLight: '#19252D', blue: '#63C4DF', blueLight: '#182C3C',
};
export const type = {
  family: 'IBMPlexSans_400Regular', medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold', mono: 'IBMPlexMono_500Medium',
  heading: 24, section: 20, title: 16, body: 15, label: 14, caption: 12,
};
export const spacing = { micro: 4, tight: 8, related: 12, row: 16, gutter: 24, section: 32, chapter: 48 };
export const radius = { control: 8, map: 0, sheet: 16 };
