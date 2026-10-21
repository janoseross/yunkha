import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { colors, layout, tokens } from '../theme/tokens';
import { AppText } from './AppText';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  icon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label, variant = 'primary', icon: Icon, loading = false, disabled = false,
  fullWidth = false, style, ...props
}: ButtonProps) {
  const unavailable = disabled || loading;
  const foreground = colors.text;
  const background = variant === 'primary' ? colors.primary : variant === 'destructive' ? colors.destructive : colors.secondary;
  const pressedBackground = variant === 'primary' ? colors.primaryPressed : variant === 'destructive' ? colors.destructivePressed : colors.secondaryPressed;

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ ...props.accessibilityState, disabled: unavailable, busy: loading }}
      disabled={unavailable}
      style={({ pressed }) => [{
        minHeight: layout.buttonMinHeight,
        minWidth: layout.touchTarget,
        paddingHorizontal: tokens.spacing.x5,
        paddingVertical: tokens.spacing.x3,
        borderRadius: tokens.radii.medium,
        borderWidth: tokens.borderWidths.hairline,
        borderColor: variant === 'secondary' ? colors.border : background,
        backgroundColor: pressed && !unavailable ? pressedBackground : background,
        opacity: unavailable && !loading ? layout.disabledOpacity : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: tokens.spacing.x2,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
      }, style]}
    >
      {loading ? <ActivityIndicator color={foreground} size="small" /> : Icon ? <Icon size={tokens.icons.size.medium} strokeWidth={tokens.icons.stroke.strong} color={foreground} /> : null}
      <AppText variant="label" style={{ color: foreground, textAlign: 'center' }}>{label}</AppText>
    </Pressable>
  );
}
