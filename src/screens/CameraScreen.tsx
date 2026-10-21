import { useState } from 'react';
import { Clipboard, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import CameraIcon from 'lucide-react-native/icons/camera';
import CameraOff from 'lucide-react-native/icons/camera-off';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Play from 'lucide-react-native/icons/play';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Square from 'lucide-react-native/icons/square';

import { signalingUrl } from '../../devConfig';
import { AppText, Button, Card, IconButton, StatusIndicator } from '../components';
import { VideoSurface } from '../components/VideoSurface';
import { colors, tokens } from '../theme/tokens';
import { CameraKeepAwake, useCameraSession, VIDEO_QUALITY_PRESETS } from '../features/camera/useCameraSession';
import { connectionStatus } from '../components/connectionStatus';

const VIDEO_FRAME_ASPECT_RATIO = 4 / 3;

export default function CameraScreen({ onLeave }: { onLeave: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const [codeCopied, setCodeCopied] = useState(false);
  const session = useCameraSession();
  const {
    localStream, isStarting, status, error, roomCode, showLocalPreview,
    setShowLocalPreview, videoQuality, cameraFacing, isSwitchingCamera,
    isChangingQuality, startCamera, stopCamera, changeVideoQuality, switchCamera,
  } = session;
  const cameraPreviewMinHeight = Math.max(0, Math.min(windowWidth, tokens.layout.contentMaxWidth) - 2 * tokens.layout.screenPadding) / VIDEO_FRAME_ASPECT_RATIO;
  const qualityLocked = isStarting || isSwitchingCamera || isChangingQuality;
  const state = !signalingUrl ? 'error' : connectionStatus(status, error, isStarting);

  const copyRoomCode = () => {
    if (!roomCode) return;
    Clipboard.setString(roomCode);
    setCodeCopied(true);
  };

  const videoPlaceholder = localStream
    ? { icon: EyeOff, title: 'Preview hidden', description: 'Your video keeps streaming to the Monitor.' }
    : { icon: CameraOff, title: 'Camera is off', description: 'Start the camera when you’re ready to stream.' };

  return (
    <ScrollView style={styles.session} contentContainerStyle={styles.sessionContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {localStream && <CameraKeepAwake />}
      <View style={styles.sessionHeader}>
        <IconButton icon={ArrowLeft} accessibilityLabel={roomCode ? 'Leave room and return Home' : 'Return Home'} onPress={onLeave} />
        <AppText variant="title" style={styles.headerTitle}>Camera</AppText>
        <CameraIcon size={tokens.icons.size.large} color={colors.textSecondary} />
      </View>

      <VideoSurface stream={showLocalPreview ? localStream : null} mirror={cameraFacing === 'user'} placeholder={videoPlaceholder} style={[styles.cameraVideo, { minHeight: cameraPreviewMinHeight }]} />

      <View style={styles.roomInfo}>
        <View style={styles.roomInfoTop}>
          <AppText variant="metadata" tone="textSecondary">ROOM</AppText>
          <AppText variant="heading" style={styles.roomCode} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} accessibilityLabel={roomCode ? `Room code ${roomCode.split('').join(' ')}` : 'Room code pending'}>
            {roomCode ?? '····'}
          </AppText>
          <Button label={codeCopied ? 'Copied' : 'Copy'} accessibilityLabel={codeCopied ? 'Room code copied' : 'Copy room code'} icon={codeCopied ? Check : Copy} variant="secondary" onPress={copyRoomCode} disabled={!roomCode} />
        </View>
        <StatusIndicator status={state} label={state === 'connected' ? 'Connected' : status} />
      </View>

      {(error || !signalingUrl) && (
        <Card style={styles.errorCard}>
          <AppText tone="error" accessibilityRole="alert">
            {error || 'Set EXPO_PUBLIC_SIGNALING_URL to the signaling WebSocket URL.'}
          </AppText>
        </Card>
      )}

      <View style={styles.settingsSection}>
        <View style={styles.settingsHeading}>
          <AppText variant="label">Video quality</AppText>
          {qualityLocked && <AppText variant="caption" tone="textSecondary">{isChangingQuality ? 'Changing quality…' : 'Camera busy'}</AppText>}
        </View>
        <View style={styles.qualityOptions} accessibilityRole="radiogroup" accessibilityLabel="Video quality">
          {(['low', 'balanced', 'high'] as const).map((quality) => {
            const preset = VIDEO_QUALITY_PRESETS[quality];
            const selected = videoQuality === quality;
            return (
              <Pressable
                key={quality}
                accessibilityRole="radio"
                accessibilityLabel={`${preset.label}, ${preset.height}p, ${preset.frameRate} frames per second`}
                accessibilityState={{ checked: selected, disabled: qualityLocked }}
                disabled={qualityLocked}
                onPress={() => { void changeVideoQuality(quality); }}
                style={({ pressed }) => [styles.qualityOption, selected && styles.qualityOptionSelected, pressed && !qualityLocked && styles.qualityOptionPressed, qualityLocked && styles.qualityOptionDisabled]}
              >
                <AppText variant="caption" style={styles.qualityOptionLabel}>{preset.label}</AppText>
                <AppText variant="metadata" tone="textSecondary" style={styles.qualityOptionDetail}>{preset.height}p / {preset.frameRate} fps</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        label={localStream ? 'Stop camera' : 'Start camera'}
        icon={localStream ? Square : Play}
        variant={localStream ? 'destructive' : 'primary'}
        onPress={localStream ? stopCamera : startCamera}
        loading={isStarting}
        disabled={isChangingQuality || isSwitchingCamera}
        fullWidth
      />
      <View style={styles.utilityActions}>
        <Button
          label={isSwitchingCamera ? 'Switching…' : cameraFacing === 'environment' ? 'Rear → Front' : 'Front → Rear'}
          accessibilityLabel={cameraFacing === 'environment' ? 'Rear camera active. Switch to front camera' : 'Front camera active. Switch to rear camera'}
          icon={RefreshCw}
          variant="secondary"
          onPress={switchCamera}
          disabled={isStarting || isSwitchingCamera || isChangingQuality}
          style={styles.utilityButton}
        />
        {!!localStream && (
          <Button label={showLocalPreview ? 'Hide preview' : 'Show preview'} icon={showLocalPreview ? EyeOff : Eye} variant="secondary" onPress={() => setShowLocalPreview((visible) => !visible)} style={styles.utilityButton} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  session: { flex: 1 },
  sessionContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: tokens.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: tokens.layout.screenPadding,
    paddingTop: tokens.spacing.x2,
    paddingBottom: tokens.spacing.x4,
    gap: tokens.spacing.x3,
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x3 },
  headerTitle: { flex: 1 },
  cameraVideo: { flexGrow: 1 },
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
  roomCode: { flex: 1, minWidth: 0, letterSpacing: tokens.spacing.x1, color: colors.text },
  errorCard: { borderColor: colors.error },
  settingsSection: { gap: tokens.spacing.x2 },
  settingsHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: tokens.spacing.x2 },
  qualityOptions: { flexDirection: 'row', gap: tokens.spacing.x2 },
  qualityOption: {
    flex: 1,
    minHeight: tokens.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: tokens.borderWidths.hairline,
    borderRadius: tokens.radii.medium,
    paddingHorizontal: tokens.spacing.x1,
    paddingVertical: tokens.spacing.x1,
  },
  qualityOptionSelected: { borderColor: colors.borderFocus, backgroundColor: colors.primaryPressed },
  qualityOptionPressed: { backgroundColor: colors.secondaryPressed },
  qualityOptionDisabled: { opacity: tokens.layout.disabledOpacity },
  qualityOptionLabel: { textAlign: 'center' },
  qualityOptionDetail: { textAlign: 'center' },
  utilityActions: { flexDirection: 'row', gap: tokens.spacing.x2 },
  utilityButton: { flex: 1, paddingHorizontal: tokens.spacing.x1 },
});
