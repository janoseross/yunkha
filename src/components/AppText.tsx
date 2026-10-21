import { Text } from 'react-native';
import type { TextProps } from 'react-native';

import { colors, typography } from '../theme/tokens';
import type { ColorToken, TextVariant } from '../theme/tokens';

type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: ColorToken;
};

export function AppText({ variant = 'body', tone = 'text', style, ...props }: AppTextProps) {
  return <Text {...props} style={[typography[variant], { color: colors[tone] }, style]} />;
}
