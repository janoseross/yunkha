import { forwardRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, layout, tokens, typography } from '../theme/tokens';
import { AppText } from './AppText';

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
