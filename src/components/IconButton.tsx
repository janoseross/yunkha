import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { colors, layout, tokens } from '../theme/tokens';

type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  variant?: 'ghost' | 'surface';
  size?: keyof typeof tokens.icons.size;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ icon: Icon, accessibilityLabel, variant = 'ghost', size = 'large', disabled = false, style, ...props }: IconButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...props.accessibilityState, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={tokens.spacing.x1}
      style={({ pressed }) => [{
        width: layout.touchTarget,
        height: layout.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radii.medium,
        backgroundColor: pressed ? colors.secondaryPressed : variant === 'surface' ? colors.surfaceElevated : colors.transparent,
        opacity: disabled ? layout.disabledOpacity : 1,
      }, style]}
    >
      <Icon size={tokens.icons.size[size]} strokeWidth={tokens.icons.stroke.regular} color={colors.text} />
    </Pressable>
  );
}
