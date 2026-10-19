import type { LucideIcon } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, Text, TextInput, View,
} from 'react-native';
import type { PressableProps, StyleProp, TextInputProps, TextProps, ViewStyle } from 'react-native';

import { colors, layout, tokens, typography } from './tokens';
import type { ColorToken, TextVariant } from './tokens';

type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: ColorToken;
};

export function AppText({ variant = 'body', tone = 'text', style, ...props }: AppTextProps) {
  return <Text {...props} style={[typography[variant], { color: colors[tone] }, style]} />;
}

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

type AppTextInputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
};

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput({ label, error, hint, editable = true, onFocus, onBlur, style, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.borderFocus : colors.border;

  return (
    <View style={{ gap: tokens.spacing.x2 }}>
      {label && <AppText variant="label" tone={editable ? 'text' : 'textSecondary'}>{label}</AppText>}
      <TextInput
        ref={ref}
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={error ?? hint ?? props.accessibilityHint}
        editable={editable}
        placeholderTextColor={editable ? colors.textDisabled : colors.textSecondary}
        selectionColor={colors.primary}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[typography.body, {
          color: editable ? colors.text : colors.textSecondary,
          minHeight: layout.inputMinHeight,
          paddingHorizontal: tokens.spacing.x4,
          paddingVertical: tokens.spacing.x3,
          borderRadius: tokens.radii.medium,
          borderWidth: focused || error ? tokens.borderWidths.strong : tokens.borderWidths.hairline,
          borderColor,
          backgroundColor: editable ? colors.surface : colors.surfaceElevated,
        }, style]}
      />
      {(error || hint) && <AppText variant="caption" tone={error ? 'error' : 'textSecondary'} accessibilityRole={error ? 'alert' : undefined}>{error ?? hint}</AppText>}
    </View>
  );
});

export type ConnectionStatus = 'connected' | 'connecting' | 'waiting' | 'disconnected' | 'error';

const statusDetails: Record<ConnectionStatus, { label: string; color: ColorToken }> = {
  connected: { label: 'Connected', color: 'success' },
  connecting: { label: 'Connecting', color: 'warning' },
  waiting: { label: 'Waiting', color: 'warning' },
  disconnected: { label: 'Disconnected', color: 'textDisabled' },
  error: { label: 'Error', color: 'error' },
};

export function StatusIndicator({ status, label }: { status: ConnectionStatus; label?: string }) {
  const detail = statusDetails[status];
  const text = label ?? detail.label;
  return (
    <View accessible accessibilityLabel={text} accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x2, alignSelf: 'flex-start' }}>
      <View style={{ width: tokens.spacing.x2, height: tokens.spacing.x2, borderRadius: tokens.radii.pill, backgroundColor: colors[detail.color] }} />
      <AppText variant="caption" tone="textSecondary">{text}</AppText>
    </View>
  );
}
