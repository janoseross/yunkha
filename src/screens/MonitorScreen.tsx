import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import Minimize2 from 'lucide-react-native/icons/minimize-2';
import MonitorPlay from 'lucide-react-native/icons/monitor-play';

import { signalingUrl } from '../../devConfig';
import { MonitorConnectionView } from '../components/MonitorConnectionView';
import { AppText, Button, Card, IconButton, StatusIndicator } from '../components';
import { VideoSurface } from '../components/VideoSurface';
import { colors, tokens } from '../theme/tokens';
import { useMonitorSession } from '../features/monitor/useMonitorSession';
import { connectionStatus } from '../components/connectionStatus';

export default function MonitorScreen({ onLeave }: { onLeave: () => void }) {
  const session = useMonitorSession();
  const { remoteStream, status, error, roomCode, joinId, isJoining } = session;
  const [fullscreenJoinId, setFullscreenJoinId] = useState<number | null>(null);
  const isFullscreen = !!roomCode && fullscreenJoinId === joinId;
  const state = !signalingUrl ? 'error' : connectionStatus(status, error, isJoining);

  useEffect(() => {
    if (!isFullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreenJoinId(null);
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen]);

  const header = (
    <View style={styles.sessionHeader}>
      <IconButton icon={ArrowLeft} accessibilityLabel={roomCode ? 'Leave room and return Home' : 'Return Home'} onPress={onLeave} />
      <AppText variant="title" style={styles.headerTitle}>Monitor</AppText>
      <MonitorPlay size={tokens.icons.size.large} color={colors.textSecondary} />
    </View>
  );

  const videoPlaceholder = { icon: MonitorPlay, title: 'Waiting for video', description: 'Video will appear when the Camera starts streaming.' };

  if (roomCode) {
    return (
      <View style={[styles.joinedSession, isFullscreen && styles.fullscreenSession]}>
        <StatusBar hidden={isFullscreen} style="light" />
        {isFullscreen ? (
          <>
            <View style={styles.fullscreenToolbar}>
              <IconButton icon={Minimize2} accessibilityLabel="Exit fullscreen" onPress={() => setFullscreenJoinId(null)} variant="surface" />
            </View>
            <VideoSurface stream={remoteStream} placeholder={videoPlaceholder} style={[styles.videoFill, styles.fullscreenVideo]} />
          </>
        ) : (
          <>
            {header}
            <VideoSurface stream={remoteStream} placeholder={videoPlaceholder} style={styles.videoFill} />
            <View style={styles.roomInfo}>
              <View style={styles.roomInfoTop}>
                <AppText variant="metadata" tone="textSecondary">ROOM</AppText>
                <AppText variant="title" style={styles.joinedCode}>{roomCode}</AppText>
                <IconButton icon={Maximize2} accessibilityLabel="View video fullscreen" onPress={() => setFullscreenJoinId(joinId)} />
                <Button label="Leave" variant="secondary" onPress={onLeave} />
              </View>
              <StatusIndicator status={state} label={state === 'connected' ? 'Receiving video' : status} />
            </View>
            {(error || !signalingUrl) && (
              <Card style={styles.errorCard}>
                <AppText tone="error" accessibilityRole="alert">
                  {error || 'Set EXPO_PUBLIC_SIGNALING_URL to the signaling WebSocket URL.'}
                </AppText>
              </Card>
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <MonitorConnectionView
      onLeave={onLeave}
      roomInput={session.roomInput}
      recentRoom={session.recentRoom}
      status={status}
      error={error}
      isJoining={isJoining}
      onRoomInputChange={session.changeRoomInput}
      onJoin={session.join}
    />
  );
}

const styles = StyleSheet.create({
  joinedSession: {
    flex: 1,
    paddingHorizontal: tokens.layout.screenPadding,
    paddingTop: tokens.spacing.x2,
    paddingBottom: tokens.spacing.x4,
    gap: tokens.spacing.x3,
  },
  fullscreenSession: {
    paddingHorizontal: tokens.spacing.none,
    paddingTop: tokens.spacing.none,
    paddingBottom: tokens.spacing.none,
    gap: tokens.spacing.none,
  },
  fullscreenToolbar: {
    minHeight: tokens.layout.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: tokens.layout.screenPadding,
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x3 },
  headerTitle: { flex: 1 },
  videoFill: { flex: 1 },
  fullscreenVideo: { borderRadius: tokens.radii.none, borderWidth: tokens.borderWidths.none },
  roomInfo: {
    gap: tokens.spacing.x1,
    paddingHorizontal: tokens.spacing.x3,
    paddingVertical: tokens.spacing.x2,
    borderRadius: tokens.radii.medium,
    borderWidth: tokens.borderWidths.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roomInfoTop: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x2 },
  joinedCode: { flex: 1, letterSpacing: tokens.spacing.x1 },
  errorCard: { borderColor: colors.error },
});
