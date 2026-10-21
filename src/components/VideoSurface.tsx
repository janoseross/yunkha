import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import type { MediaStream } from 'react-native-webrtc';

import { colors, tokens } from '../theme/tokens';
import { AppText } from './AppText';

type VideoSurfaceProps = {
  stream: MediaStream | null;
  mirror?: boolean;
  placeholder: { icon: LucideIcon; title: string; description: string };
  style?: StyleProp<ViewStyle>;
};

export function VideoSurface({ stream, mirror = false, placeholder, style }: VideoSurfaceProps) {
  const EmptyIcon = placeholder.icon;
  return (
    <View style={[styles.frame, style]}>
      {stream ? (
        <RTCView style={styles.video} streamURL={stream.toURL()} objectFit="contain" mirror={mirror} />
      ) : (
        <View style={styles.empty}>
          <EmptyIcon size={tokens.icons.size.hero} color={colors.textSecondary} />
          <AppText variant="bodyMedium" style={styles.emptyTitle}>{placeholder.title}</AppText>
          <AppText variant="caption" tone="textSecondary" style={styles.emptyDescription}>{placeholder.description}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: tokens.radii.large,
    overflow: 'hidden',
    backgroundColor: colors.videoViewport,
    borderWidth: tokens.borderWidths.hairline,
    borderColor: colors.border,
  },
  video: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.x4, gap: tokens.spacing.x2 },
  emptyTitle: { textAlign: 'center' },
  emptyDescription: { textAlign: 'center' },
});
