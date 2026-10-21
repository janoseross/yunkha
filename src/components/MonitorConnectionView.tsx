import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import MonitorPlay from 'lucide-react-native/icons/monitor-play';

import { signalingUrl } from '../../devConfig';
import { connectionStatus } from './connectionStatus';
import { colors, tokens } from '../theme/tokens';
import { AppText, AppTextInput, Button, Card, IconButton, StatusIndicator } from './index';
import { VideoSurface } from './VideoSurface';

type MonitorConnectionViewProps = {
  onLeave: () => void;
  roomInput: string;
  recentRoom: string | null;
  status: string;
  error: string | null;
  isJoining: boolean;
  onRoomInputChange: (code: string) => void;
  onJoin: (code: string) => void;
};

export function MonitorConnectionView({ onLeave, roomInput, recentRoom, status, error, isJoining, onRoomInputChange, onJoin }: MonitorConnectionViewProps) {
  const [isRoomInputFocused, setIsRoomInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const sessionScrollRef = useRef<ScrollView>(null);
  const isEditingRoom = isRoomInputFocused || isKeyboardVisible;
  const state = !signalingUrl ? 'error' : connectionStatus(status, error, isJoining);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      setIsRoomInputFocused(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!isKeyboardVisible) return;
    const frame = requestAnimationFrame(() => sessionScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [isKeyboardVisible]);

  return (
    <KeyboardAvoidingView style={styles.session} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={sessionScrollRef}
        style={styles.session}
        contentContainerStyle={styles.sessionContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (isEditingRoom) sessionScrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={styles.sessionHeader}>
          <IconButton icon={ArrowLeft} accessibilityLabel="Return Home" onPress={onLeave} />
          <AppText variant="title" style={styles.headerTitle}>Monitor</AppText>
          <MonitorPlay size={tokens.icons.size.large} color={colors.textSecondary} />
        </View>
        {!isEditingRoom && (
          <VideoSurface
            stream={null}
            placeholder={{ icon: MonitorPlay, title: 'No room connected', description: 'Enter a code below to watch live video.' }}
            style={styles.videoStandard}
          />
        )}

        <Card style={styles.joinCard}>
          <AppText variant="title">Join a room</AppText>
          {(isJoining || status !== 'Enter a room code') && <StatusIndicator status={state} label={status} />}
          <View style={styles.joinRow}>
            <View style={styles.roomInputWrap}>
              <AppTextInput
                accessibilityLabel="Four-letter room code"
                style={styles.roomInput}
                value={roomInput}
                onChangeText={onRoomInputChange}
                onFocus={() => setIsRoomInputFocused(true)}
                onBlur={() => setIsRoomInputFocused(false)}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType="default"
                maxLength={4}
                multiline={false}
                scrollEnabled={false}
                numberOfLines={1}
                textAlignVertical="center"
                placeholder="ABCD"
                returnKeyType="done"
                onSubmitEditing={() => onJoin(roomInput)}
                editable={!isJoining}
              />
            </View>
            <Button label="Join" onPress={() => onJoin(roomInput)} loading={isJoining} disabled={roomInput.length !== 4 || !signalingUrl} style={styles.roomActionButton} />
          </View>
          {(error || !signalingUrl) && (
            <AppText variant="caption" tone="error" accessibilityRole="alert">
              {error || 'Set EXPO_PUBLIC_SIGNALING_URL to the signaling WebSocket URL.'}
            </AppText>
          )}
          {recentRoom && !isEditingRoom && (
            <View style={styles.recentSection}>
              <View style={styles.recentDivider} />
              <AppText variant="metadata" tone="textSecondary">RECENT ROOM</AppText>
              <View style={styles.recentRow}>
                <AppText variant="title" style={styles.recentCode}>{recentRoom}</AppText>
                <Button label="Rejoin" variant="secondary" onPress={() => onJoin(recentRoom)} disabled={isJoining || !signalingUrl} style={styles.roomActionButton} />
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
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
  videoStandard: { aspectRatio: (4 / 3) * 1.2 },
  joinCard: { gap: tokens.spacing.x2 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x4 },
  roomInputWrap: { flex: 1, minWidth: 0 },
  roomActionButton: { width: tokens.layout.touchTarget * 2, paddingHorizontal: tokens.spacing.x2 },
  roomInput: {
    height: tokens.layout.inputMinHeight,
    minHeight: tokens.layout.inputMinHeight,
    paddingVertical: tokens.spacing.none,
    fontSize: tokens.typography.heading.fontSize,
    lineHeight: tokens.typography.heading.lineHeight,
    includeFontPadding: false,
    textAlign: 'left',
    textAlignVertical: 'center',
    letterSpacing: tokens.spacing.x2,
  },
  recentSection: { gap: tokens.spacing.x2, paddingTop: tokens.spacing.x2 },
  recentDivider: { height: tokens.borderWidths.hairline, backgroundColor: colors.border },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.x2 },
  recentCode: { flex: 1, minWidth: 0, letterSpacing: tokens.spacing.x1 },
});
