import * as Application from 'expo-application';
import Constants from 'expo-constants';
import type { LucideIcon } from 'lucide-react-native';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import Camera from 'lucide-react-native/icons/camera';
import MonitorPlay from 'lucide-react-native/icons/monitor-play';
import Video from 'lucide-react-native/icons/video';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card } from '../design-system/components';
import { colors, tokens } from '../design-system/tokens';

type RoleCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  featured?: boolean;
  onPress: () => void;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function formatBuildTimestamp(value: unknown) {
  if (typeof value !== 'string') return 'unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unavailable';

  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hour}:${minute} UTC`;
}

function RoleCard({ title, description, icon: Icon, featured = false, onPress }: RoleCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityHint={`Open ${title} mode`}
      onPress={onPress}
      style={({ pressed }) => [styles.rolePressable, pressed && styles.rolePressed]}
    >
      <Card elevated={featured} style={[styles.roleCard, featured && styles.featuredCard]}>
        <View style={styles.roleTop}>
          <View style={[styles.roleIcon, featured ? styles.featuredIcon : styles.standardIcon]}>
            <Icon size={tokens.icons.size.large} strokeWidth={tokens.icons.stroke.regular} color={colors.text} />
          </View>
          <ArrowUpRight size={tokens.icons.size.medium} strokeWidth={tokens.icons.stroke.regular} color={colors.textSecondary} />
        </View>
        <View style={styles.roleCopy}>
          <AppText variant="title">{title}</AppText>
          <AppText tone="textSecondary">{description}</AppText>
        </View>
      </Card>
    </Pressable>
  );
}

export default function HomeScreen({ onCamera, onMonitor, onShowcase }: {
  onCamera: () => void;
  onMonitor: () => void;
  onShowcase: () => void;
}) {
  const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown';
  const androidBuildNumber = Platform.OS === 'android' ? Application.nativeBuildVersion : null;
  const buildTimestamp = formatBuildTimestamp(Constants.expoConfig?.extra?.buildTimestamp);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.main}>
        <View style={styles.intro}>
          <View style={styles.brandHeading}>
            <View style={styles.brandMark}>
              <Video size={tokens.icons.size.hero} strokeWidth={tokens.icons.stroke.regular} color={colors.text} />
              <View style={styles.liveDot} />
            </View>
            <View style={styles.brandName}>
              <AppText variant="metadata" tone="success">DIRECT VIDEO MONITORING</AppText>
              <AppText variant="display">Yunkha</AppText>
            </View>
          </View>
          <AppText variant="title">Real-time video, simply connected.</AppText>
          <AppText tone="textSecondary">Use one device to stream and another to watch.</AppText>
        </View>

        <View style={styles.roles}>
          <AppText variant="label" tone="textSecondary">CHOOSE THIS DEVICE’S ROLE</AppText>
          <RoleCard title="Camera" description="Stream live video from this device." icon={Camera} featured onPress={onCamera} />
          <RoleCard title="Monitor" description="Watch a live stream from another device." icon={MonitorPlay} onPress={onMonitor} />
        </View>
      </View>

      <View style={styles.footer}>
        {__DEV__ && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Design System Showcase"
            onPress={onShowcase}
            style={styles.showcaseEntry}
          >
            <AppText variant="caption" tone="textSecondary">Design System Showcase</AppText>
          </Pressable>
        )}
        <AppText variant="metadata" tone="textDisabled" style={styles.buildInfo}>
          Version {appVersion}{androidBuildNumber ? ` · Android build ${androidBuildNumber}` : ''}{'\n'}
          Built {buildTimestamp}
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: tokens.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: tokens.layout.screenPadding,
    paddingTop: tokens.spacing.x8,
    paddingBottom: tokens.spacing.x4,
  },
  main: { flexGrow: 1, gap: tokens.spacing.x6 },
  intro: { gap: tokens.spacing.x2 },
  brandHeading: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x3 },
  brandName: { flex: 1, minWidth: 0, gap: tokens.spacing.x1 },
  brandMark: {
    width: tokens.spacing.x12 + tokens.spacing.x4,
    height: tokens.spacing.x12 + tokens.spacing.x4,
    borderRadius: tokens.radii.large,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: tokens.borderWidths.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    top: tokens.spacing.x2,
    right: tokens.spacing.x2,
    width: tokens.spacing.x2,
    height: tokens.spacing.x2,
    borderRadius: tokens.radii.pill,
    backgroundColor: colors.success,
  },
  roles: { gap: tokens.spacing.x3 },
  rolePressable: { borderRadius: tokens.radii.large },
  rolePressed: { transform: [{ scale: tokens.layout.pressedScale }] },
  roleCard: { minHeight: tokens.layout.touchTarget * 3, gap: tokens.spacing.x4, justifyContent: 'space-between' },
  featuredCard: { borderColor: colors.primary },
  roleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roleIcon: {
    width: tokens.layout.touchTarget,
    height: tokens.layout.touchTarget,
    borderRadius: tokens.radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredIcon: { backgroundColor: colors.primary },
  standardIcon: { backgroundColor: colors.surfaceElevated },
  roleCopy: { gap: tokens.spacing.x1 },
  footer: { alignItems: 'center', paddingTop: tokens.spacing.x5 },
  showcaseEntry: {
    minHeight: tokens.layout.touchTarget,
    minWidth: tokens.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.x4,
  },
  buildInfo: { textAlign: 'center' },
});
