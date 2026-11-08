import React, { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Native-compatible rendering of frontend/public/haven-mark.svg. */
export function HavenLogo({ size = 28 }: { size?: number }) {
  const gradientId = `haven-${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden accessible={false}>
      <Defs>
        <LinearGradient id={gradientId} x1="4" y1="2" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#1d4ed8" />
          <Stop offset=".55" stopColor="#1683b4" />
          <Stop offset="1" stopColor="#22c55e" />
        </LinearGradient>
      </Defs>
      <Rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
      <G fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
        <Path d="M13 31 32 15l19 16" />
        <Path d="M19 27v20a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V27" />
      </G>
    </Svg>
  );
}
