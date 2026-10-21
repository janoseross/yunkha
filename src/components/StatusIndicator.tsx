import { View } from 'react-native';

import { colors, tokens } from '../theme/tokens';
import type { ColorToken } from '../theme/tokens';
import { AppText } from './AppText';

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
