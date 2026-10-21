import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, tokens } from '../theme/tokens';

type CardProps = {
  children: ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({ children, elevated = false, style, accessibilityLabel }: CardProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[{
        backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
        borderRadius: tokens.radii.large,
        borderWidth: tokens.borderWidths.hairline,
        borderColor: colors.border,
        padding: tokens.spacing.x4,
      }, elevated && tokens.shadows.raised, style]}
    >
      {children}
    </View>
  );
}
