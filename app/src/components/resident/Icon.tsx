// One icon family (Feather) across the app. Icons are decorative; meaning is always carried by text too.
import React from 'react';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { palette } = useTheme();
  return <Feather name={name} size={size} color={color ?? palette.muted} accessible={false} aria-hidden />;
}
