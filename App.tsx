import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Clipboard, Keyboard, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import CameraIcon from 'lucide-react-native/icons/camera';
import CameraOff from 'lucide-react-native/icons/camera-off';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import Minimize2 from 'lucide-react-native/icons/minimize-2';
import MonitorPlay from 'lucide-react-native/icons/monitor-play';
import Play from 'lucide-react-native/icons/play';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Square from 'lucide-react-native/icons/square';
import {
  MediaStream, mediaDevices, RTCIceCandidate, RTCPeerConnection,
  RTCSessionDescription, RTCView,
} from 'react-native-webrtc';

import { signalingUrl } from './devConfig';
import type { Role } from './devConfig';
import { AppText, AppTextInput, Button, Card, IconButton, StatusIndicator } from './src/design-system/components';
import type { ConnectionStatus } from './src/design-system/components';
import { colors, tokens } from './src/design-system/tokens';
import HomeScreen from './src/screens/HomeScreen';

void SplashScreen.preventAutoHideAsync();

type SignalMessage =
  | { type: 'create-room' | 'leave-room' }
  | { type: 'join-room'; code: string }
  | { type: 'ready' | 'waiting' | 'peer-left' }
  | { type: 'error'; message: string }
  | { type: 'room-created' | 'room-joined' | 'room-ended'; code: string }
  | { type: 'room-error'; reason: string }
  | { type: 'stop'; callId: string }
  | { type: 'offer' | 'answer'; callId: string; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { type: 'candidate'; callId: string; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

const VIDEO_QUALITY_PRESETS = {
  low: { label: 'Low', width: 640, height: 480, frameRate: 10 },
  balanced: { label: 'Balanced', width: 1280, height: 720, frameRate: 15 },
  high: { label: 'High', width: 1920, height: 1080, frameRate: 30 },
} as const;
const VIDEO_FRAME_ASPECT_RATIO = 4 / 3;

type VideoQuality = keyof typeof VIDEO_QUALITY_PRESETS;
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;
const LAST_MONITOR_ROOM_KEY = '@yunkha/last-monitor-room';

function releaseStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
  stream.release();
}

function CameraKeepAwake() {
  useKeepAwake();
  return null;
}

export default function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [showDesignSystem, setShowDesignSystem] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  });
  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  // The require stays inside the development branch so the showcase is absent from release bundles.
  const DesignSystemShowcase = __DEV__ && showDesignSystem
    ? (require('./src/design-system/Showcase').default as typeof import('./src/design-system/Showcase').default)
    : null;
  const isHome = !role && !DesignSystemShowcase;

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={isHome || role ? ['top', 'bottom'] : ['bottom']} style={[styles.container, (isHome || role) && styles.fullBleedContainer]}>
        <StatusBar style="light" />
        {DesignSystemShowcase ? (
          <DesignSystemShowcase onClose={() => setShowDesignSystem(false)} />
        ) : role ? (
          <Session role={role} onLeave={() => setRole(null)} />
        ) : (
          <HomeScreen
            onCamera={() => setRole('sender')}
            onMonitor={() => setRole('receiver')}
            onShowcase={() => setShowDesignSystem(true)}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Session({ role, onLeave }: { role: Role; onLeave: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState(signalingUrl ? (role === 'sender' ? 'Connecting to signaling server…' : 'Enter a room code') : 'Signaling not configured');
  const [error, setError] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showLocalPreview, setShowLocalPreview] = useState(true);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('balanced');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(role === 'sender' ? 1 : 0);
  const socketRef = useRef<WebSocket | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const pendingJoinRef = useRef<string | null>(null);
  const roomInputEdited = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidate[]>([]);
  const pendingLocalCandidates = useRef<RTCIceCandidate[]>([]);
  const offerSent = useRef(false);
  const callIdRef = useRef<string | null>(null);
  const peerReadyRef = useRef(false);
  const startRequest = useRef(0);
  const startingRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (role !== 'receiver' || !isFullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsFullscreen(false);
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen, role]);

  useEffect(() => {
    if (!roomCode) setIsFullscreen(false);
  }, [roomCode]);

  useEffect(() => {
    if (role !== 'receiver') return;
    let active = true;
    void AsyncStorage.getItem(LAST_MONITOR_ROOM_KEY).then((savedCode) => {
      if (active && !roomInputEdited.current && savedCode && ROOM_CODE_PATTERN.test(savedCode)) {
        setRoomInput(savedCode);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [role]);

  const send = useCallback((message: SignalMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connectMonitor = () => {
    const code = roomInput.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) {
      setError('Enter a valid 4-letter room code.');
      return;
    }
    pendingJoinRef.current = code;
    setError(null);
    setIsJoining(true);
    setStatus('Joining room…');
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'join-room', code });
    } else if (socketRef.current?.readyState !== WebSocket.CONNECTING) {
      setConnectionAttempt((attempt) => attempt + 1);
    }
  };

  const stopCall = useCallback((stopCapture: boolean, notify: boolean) => {
    if (notify && callIdRef.current) send({ type: 'stop', callId: callIdRef.current });
    callIdRef.current = null;
    pendingCandidates.current = [];
    const oldPeer = peerRef.current;
    peerRef.current = null;
    oldPeer?.close();
    pendingLocalCandidates.current = [];
    offerSent.current = false;
    if (remoteStreamRef.current) {
      releaseStream(remoteStreamRef.current);
      remoteStreamRef.current = null;
    }
    if (stopCapture) {
      startRequest.current += 1;
      if (localStreamRef.current) {
        releaseStream(localStreamRef.current);
        localStreamRef.current = null;
      }
    }
    if (mounted.current) {
      setRemoteStream(null);
      if (stopCapture) setLocalStream(null);
      setStatus(peerReadyRef.current ? 'Peer ready' : 'Waiting for peer');
    }
  }, [send]);

  const createPeer = useCallback((callId: string) => {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = peer;
    callIdRef.current = callId;
    pendingLocalCandidates.current = [];
    offerSent.current = false;
    peer.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      if (event.candidate && peerRef.current === peer) {
        if (role === 'sender' && !offerSent.current) pendingLocalCandidates.current.push(event.candidate);
        else send({ type: 'candidate', callId, candidate: event.candidate.toJSON() });
      }
    };
    peer.ontrack = (event: { streams: MediaStream[] }) => {
      if (role !== 'receiver' || peerRef.current !== peer || !event.streams[0]) return;
      remoteStreamRef.current = event.streams[0];
      if (mounted.current) setRemoteStream(event.streams[0]);
    };
    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer || !mounted.current) return;
      setStatus(`WebRTC: ${peer.connectionState}`);
      if (peer.connectionState === 'connected') {
        void peer.getStats().then((stats) => {
          const transport = [...stats.values()].find((item) => item.type === 'transport');
          const pair = transport && stats.get(transport.selectedCandidatePairId);
          const local = pair && stats.get(pair.localCandidateId);
          const remote = pair && stats.get(pair.remoteCandidateId);
          if (peerRef.current === peer && local && remote) {
            setStatus(`Connected: ${local.candidateType} ↔ ${remote.candidateType}`);
          }
        }).catch(() => {});
      }
    };
    return peer;
  }, [role, send]);

  const offer = useCallback(async (stream: MediaStream) => {
    if (!peerReadyRef.current || peerRef.current) return;
    const callId = `${Date.now()}-${Math.random()}`;
    const peer = createPeer(callId);
    try {
      peer.addTrack(stream.getVideoTracks()[0], stream);
      const description = await peer.createOffer();
      if (callIdRef.current !== callId) return;
      await peer.setLocalDescription(description);
      if (callIdRef.current !== callId) return;
      send({ type: 'offer', callId, sdp: description });
      offerSent.current = true;
      for (const candidate of pendingLocalCandidates.current) {
        send({ type: 'candidate', callId, candidate: candidate.toJSON() });
      }
      pendingLocalCandidates.current = [];
      setStatus('Waiting for answer');
    } catch (cause) {
      if (peerRef.current === peer) {
        setError(cause instanceof Error ? cause.message : 'Could not create offer');
        stopCall(true, true);
      }
    }
  }, [createPeer, send, stopCall]);

  const startCamera = useCallback(async () => {
    if (role !== 'sender' || startingRef.current || localStreamRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    setError(null);
    setStatus('Starting camera…');
    const request = ++startRequest.current;
    const preset = VIDEO_QUALITY_PRESETS[videoQuality];
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: cameraFacing,
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        },
      });
      if (!mounted.current || request !== startRequest.current) {
        releaseStream(stream);
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      const actualFacing = stream.getVideoTracks()[0].getSettings().facingMode;
      if (actualFacing === 'user' || actualFacing === 'environment') setCameraFacing(actualFacing);
      if (peerReadyRef.current) await offer(stream);
      else setStatus('Camera ready; waiting for Monitor');
    } catch (cause) {
      if (mounted.current && request === startRequest.current) {
        setError(cause instanceof Error ? cause.message : 'Could not start the camera');
        setStatus('Camera failed');
      }
    } finally {
      startingRef.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, [cameraFacing, offer, role, videoQuality]);

  const switchCamera = async () => {
    if (role !== 'sender' || isStarting || isSwitchingCamera) return;
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    const stream = localStreamRef.current;
    if (!stream) {
      setCameraFacing(nextFacing);
      return;
    }
    setIsSwitchingCamera(true);
    try {
      const preset = VIDEO_QUALITY_PRESETS[videoQuality];
      await stream.getVideoTracks()[0].applyConstraints({
        facingMode: nextFacing,
        width: preset.width,
        height: preset.height,
        frameRate: preset.frameRate,
      });
      if (localStreamRef.current === stream) {
        setCameraFacing(nextFacing);
        setError(null);
      }
    } catch {
      if (localStreamRef.current === stream) setError('Could not switch camera.');
    } finally {
      if (mounted.current) setIsSwitchingCamera(false);
    }
  };

  const handleSignal = useCallback(async (message: SignalMessage) => {
    try {
      switch (message.type) {
        case 'room-created':
          if (role !== 'sender') break;
          roomCodeRef.current = message.code;
          setRoomCode(message.code);
          setCodeCopied(false);
          setError(null);
          setStatus('Waiting for Monitor');
          break;
        case 'room-joined':
          if (role !== 'receiver') break;
          Keyboard.dismiss();
          pendingJoinRef.current = null;
          roomCodeRef.current = message.code;
          setRoomCode(message.code);
          setRoomInput(message.code);
          void AsyncStorage.setItem(LAST_MONITOR_ROOM_KEY, message.code).catch(() => {
            if (mounted.current) setError('Could not save the room code.');
          });
          setIsJoining(false);
          setError(null);
          setStatus('Waiting for Camera video');
          break;
        case 'room-error': {
          pendingJoinRef.current = null;
          setIsJoining(false);
          const messages: Record<string, string> = {
            'invalid-room-code': 'Enter a valid 4-letter room code.',
            'room-not-found': 'Room not found. Check the code and try again.',
            'room-full': 'This room already has a Monitor.',
            'already-in-room': 'Already connected to a room.',
            'not-in-room': 'Not connected to a room.',
            'rooms-full': 'Could not create a room. Try again later.',
          };
          setError(messages[message.reason] || 'Could not connect to the room.');
          if (role === 'receiver' && !roomCodeRef.current) setStatus('Enter a room code');
          break;
        }
        case 'room-ended':
          if (role !== 'receiver') break;
          roomCodeRef.current = null;
          peerReadyRef.current = false;
          setRoomCode(null);
          setRoomInput(message.code);
          setError(null);
          stopCall(true, false);
          setStatus('Camera ended the room');
          break;
        case 'waiting':
          peerReadyRef.current = false;
          setStatus(role === 'sender' ? 'Waiting for Monitor' : 'Waiting for Camera');
          break;
        case 'ready':
          if (!roomCodeRef.current) break;
          peerReadyRef.current = true;
          setStatus('Peer ready');
          if (role === 'sender' && localStreamRef.current) await offer(localStreamRef.current);
          break;
        case 'peer-left':
          peerReadyRef.current = false;
          stopCall(role !== 'sender', false);
          setStatus(role === 'sender' ? 'Waiting for Monitor' : 'Camera disconnected');
          break;
        case 'offer': {
          if (role !== 'receiver' || !roomCodeRef.current || !message.sdp) break;
          stopCall(false, false);
          const peer = createPeer(message.callId);
          await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
          if (peerRef.current !== peer) break;
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          if (peerRef.current !== peer) break;
          send({ type: 'answer', callId: message.callId, sdp: answer });
          for (const candidate of pendingCandidates.current) await peer.addIceCandidate(candidate);
          pendingCandidates.current = [];
          setStatus('Connecting video…');
          break;
        }
        case 'answer': {
          if (role !== 'sender' || message.callId !== callIdRef.current || !peerRef.current) break;
          const peer = peerRef.current;
          await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
          if (peerRef.current !== peer) break;
          for (const candidate of pendingCandidates.current) await peer.addIceCandidate(candidate);
          pendingCandidates.current = [];
          break;
        }
        case 'candidate': {
          if (message.callId !== callIdRef.current || !peerRef.current || !message.candidate) break;
          const candidate = new RTCIceCandidate(message.candidate);
          if (peerRef.current.remoteDescription) await peerRef.current.addIceCandidate(candidate);
          else pendingCandidates.current.push(candidate);
          break;
        }
        case 'stop':
          if (message.callId === callIdRef.current) stopCall(role !== 'sender', false);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    } catch (cause) {
      if (!mounted.current || ('callId' in message && message.callId !== callIdRef.current)) return;
      setError(cause instanceof Error ? cause.message : 'Signaling failed');
      stopCall(true, true);
    }
  }, [createPeer, offer, role, send, stopCall]);

  useEffect(() => {
    mounted.current = true;
    if (!signalingUrl || connectionAttempt === 0) {
      return () => { mounted.current = false; };
    }
    const socket = new WebSocket(signalingUrl);
    socketRef.current = socket;
    socket.onopen = () => {
      if (role === 'sender') {
        send({ type: 'create-room' });
        setStatus('Creating room…');
      } else if (pendingJoinRef.current) {
        send({ type: 'join-room', code: pendingJoinRef.current });
      }
    };
    socket.onmessage = (event) => {
      try {
        void handleSignal(JSON.parse(event.data) as SignalMessage);
      } catch {
        setError('Invalid signaling message');
      }
    };
    socket.onclose = (event) => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      roomCodeRef.current = null;
      pendingJoinRef.current = null;
      peerReadyRef.current = false;
      setRoomCode(null);
      setIsJoining(false);
      stopCall(true, false);
      setStatus('Signaling disconnected');
      if (event.reason) setError(event.reason);
    };
    socket.onerror = () => setError('Could not reach the signaling server');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopCall(true, true);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stopCall(true, true);
      if (roomCodeRef.current && socket.readyState === WebSocket.OPEN) {
        send({ type: 'leave-room' });
      }
      roomCodeRef.current = null;
      socketRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    };
  }, [connectionAttempt, handleSignal, role, send, stopCall]);

  const preview = role === 'sender' ? localStream : remoteStream;
  const cameraPreviewMinHeight = Math.max(0, Math.min(windowWidth, tokens.layout.contentMaxWidth) - 2 * tokens.layout.screenPadding) / VIDEO_FRAME_ASPECT_RATIO;
  const qualityLocked = isStarting || !!localStream;
  const copyRoomCode = () => {
    if (!roomCode) return;
    Clipboard.setString(roomCode);
    setCodeCopied(true);
  };
  const statusLower = status.toLowerCase();
  const connectionStatus: ConnectionStatus = error || !signalingUrl || statusLower.includes('failed')
    ? 'error'
    : statusLower.includes('connected:') || statusLower === 'webrtc: connected'
      ? 'connected'
      : isStarting || isJoining || statusLower.includes('connecting') || statusLower.includes('creating') || statusLower.includes('joining') || statusLower.includes('starting') || statusLower.includes('answer')
        ? 'connecting'
        : statusLower.includes('waiting') || statusLower.includes('ready')
          ? 'waiting'
          : 'disconnected';

  const header = (
    <View style={styles.sessionHeader}>
      <IconButton icon={ArrowLeft} accessibilityLabel="Return to Home and leave room" onPress={onLeave} />
      <AppText variant="title" style={styles.headerTitle}>{role === 'sender' ? 'Camera' : 'Monitor'}</AppText>
      {role === 'sender' ? <CameraIcon size={tokens.icons.size.large} color={colors.textSecondary} /> : <MonitorPlay size={tokens.icons.size.large} color={colors.textSecondary} />}
    </View>
  );
  const videoContent = preview && (role !== 'sender' || showLocalPreview) ? (
    <RTCView style={styles.video} streamURL={preview.toURL()} objectFit="contain" mirror={role === 'sender' && cameraFacing === 'user'} />
  ) : (
    <View style={styles.videoEmpty}>
      {role === 'sender' && localStream ? <EyeOff size={tokens.icons.size.hero} color={colors.textSecondary} /> : role === 'sender' ? <CameraOff size={tokens.icons.size.hero} color={colors.textSecondary} /> : <MonitorPlay size={tokens.icons.size.hero} color={colors.textSecondary} />}
      <AppText variant="bodyMedium" style={styles.emptyTitle}>
        {role === 'sender' ? (localStream ? 'Preview hidden' : 'Camera is off') : roomCode ? 'Waiting for video' : 'No room connected'}
      </AppText>
      <AppText variant="caption" tone="textSecondary" style={styles.emptyDescription}>
        {role === 'sender' ? (localStream ? 'Your video keeps streaming to the Monitor.' : 'Start the camera when you’re ready to stream.') : roomCode ? 'Video will appear when the Camera starts streaming.' : 'Enter a code below to watch live video.'}
      </AppText>
    </View>
  );

  if (role === 'receiver' && roomCode) {
    return (
      <View style={[styles.joinedSession, isFullscreen && styles.fullscreenSession]}>
        <StatusBar hidden={isFullscreen} style="light" />
        {isFullscreen ? (
          <>
            <View style={styles.fullscreenToolbar}>
              <IconButton icon={Minimize2} accessibilityLabel="Exit fullscreen" onPress={() => setIsFullscreen(false)} variant="surface" />
            </View>
            <View style={[styles.videoFrame, styles.videoFill, styles.fullscreenVideo]}>{videoContent}</View>
          </>
        ) : (
          <>
            {header}
            <View style={[styles.videoFrame, styles.videoFill]}>{videoContent}</View>
            <View style={styles.roomInfo}>
              <View style={styles.roomInfoTop}>
                <AppText variant="metadata" tone="textSecondary">ROOM</AppText>
                <AppText variant="title" style={styles.joinedCode}>{roomCode}</AppText>
                <IconButton icon={Maximize2} accessibilityLabel="View video fullscreen" onPress={() => setIsFullscreen(true)} />
                <Button label="Leave" variant="secondary" onPress={onLeave} />
              </View>
              <StatusIndicator status={connectionStatus} label={connectionStatus === 'connected' ? 'Receiving video' : status} />
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
    <ScrollView
      style={styles.session}
      contentContainerStyle={styles.sessionContent}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {role === 'sender' && localStream && <CameraKeepAwake />}
      {header}

      <View style={[styles.videoFrame, role === 'sender' ? [styles.cameraVideo, { minHeight: cameraPreviewMinHeight }] : styles.videoStandard]}>{videoContent}</View>

      {role === 'sender' && (
        <View style={styles.roomInfo}>
          <View style={styles.roomInfoTop}>
            <AppText variant="metadata" tone="textSecondary">ROOM</AppText>
            <AppText variant="heading" style={styles.roomCode} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} accessibilityLabel={roomCode ? `Room code ${roomCode.split('').join(' ')}` : 'Room code pending'}>
              {roomCode ?? '····'}
            </AppText>
            <Button label={codeCopied ? 'Copied' : 'Copy'} icon={codeCopied ? Check : Copy} variant="secondary" onPress={copyRoomCode} disabled={!roomCode} />
          </View>
          <StatusIndicator status={connectionStatus} label={connectionStatus === 'connected' ? 'Connected' : status} />
        </View>
      )}

      {role === 'receiver' && !roomCode && (
        <Card style={styles.joinCard}>
          <AppText variant="title">Join a room</AppText>
          {(isJoining || status !== 'Enter a room code') && <StatusIndicator status={connectionStatus} label={status} />}
          <AppTextInput
            label="Room code"
            accessibilityLabel="Four-letter room code"
            error={error || (!signalingUrl ? 'Set EXPO_PUBLIC_SIGNALING_URL to the signaling WebSocket URL.' : undefined)}
            style={styles.roomInput}
            value={roomInput}
            onChangeText={(value) => {
              roomInputEdited.current = true;
              setRoomInput(value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0, 4));
              setError(null);
            }}
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
            onSubmitEditing={connectMonitor}
            editable={!isJoining}
          />
          <Button label="Join room" icon={Play} onPress={connectMonitor} loading={isJoining} disabled={roomInput.length !== 4 || !signalingUrl} fullWidth />
        </Card>
      )}

      {(error || !signalingUrl) && role === 'sender' && (
        <Card style={styles.errorCard}>
          <AppText tone="error" accessibilityRole="alert">
            {error || 'Set EXPO_PUBLIC_SIGNALING_URL to the signaling WebSocket URL.'}
          </AppText>
        </Card>
      )}

      {role === 'sender' && (
        <View style={styles.settingsSection}>
          <View style={styles.settingsHeading}>
            <AppText variant="label">Video quality</AppText>
            {qualityLocked && <AppText variant="caption" tone="textSecondary">Stop camera to change</AppText>}
          </View>
          <View style={styles.qualityOptions}>
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
                  onPress={() => {
                    if (!startingRef.current && !localStreamRef.current) setVideoQuality(quality);
                  }}
                  style={({ pressed }) => [styles.qualityOption, selected && styles.qualityOptionSelected, pressed && !qualityLocked && styles.qualityOptionPressed, qualityLocked && styles.qualityOptionDisabled]}
                >
                  <AppText variant="caption" style={styles.qualityOptionLabel}>{preset.label}</AppText>
                  <AppText variant="metadata" tone="textSecondary" style={styles.qualityOptionDetail}>{preset.height}p / {preset.frameRate} fps</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {role === 'sender' && (
        <Button
          label={localStream ? 'Stop camera' : 'Start camera'}
          icon={localStream ? Square : Play}
          variant={localStream ? 'destructive' : 'primary'}
          onPress={localStream ? () => stopCall(true, true) : startCamera}
          loading={isStarting}
          fullWidth
        />
      )}
      {role === 'sender' && (
        <View style={styles.utilityActions}>
          <Button
            label={isSwitchingCamera ? 'Switching…' : cameraFacing === 'environment' ? 'Rear → Front' : 'Front → Rear'}
            accessibilityLabel={cameraFacing === 'environment' ? 'Rear camera active. Switch to front camera' : 'Front camera active. Switch to rear camera'}
            icon={RefreshCw}
            variant="secondary"
            onPress={switchCamera}
            disabled={isStarting || isSwitchingCamera}
            style={styles.utilityButton}
          />
          {!!localStream && (
            <Button label={showLocalPreview ? 'Hide preview' : 'Show preview'} icon={showLocalPreview ? EyeOff : Eye} variant="secondary" onPress={() => setShowLocalPreview((visible) => !visible)} style={styles.utilityButton} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 48, paddingBottom: 32 },
  fullBleedContainer: { paddingTop: 0, paddingBottom: 0 },
  session: { flex: 1 },
  joinedSession: {
    flex: 1,
    paddingHorizontal: tokens.layout.screenPadding,
    paddingTop: tokens.spacing.x2,
    paddingBottom: tokens.spacing.x4,
    gap: tokens.spacing.x3,
  },
  fullscreenSession: { paddingHorizontal: tokens.spacing.none, paddingTop: tokens.spacing.none, paddingBottom: tokens.spacing.none, gap: tokens.spacing.none },
  fullscreenToolbar: { minHeight: tokens.layout.touchTarget, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: tokens.layout.screenPadding },
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
  joinCard: { gap: tokens.spacing.x2 },
  roomInput: {
    height: tokens.layout.inputMinHeight,
    minHeight: tokens.layout.inputMinHeight,
    paddingVertical: tokens.spacing.none,
    fontSize: tokens.typography.heading.fontSize,
    lineHeight: tokens.typography.heading.lineHeight,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
    letterSpacing: tokens.spacing.x2,
  },
  joinedCode: { flex: 1, letterSpacing: tokens.spacing.x1 },
  errorCard: { borderColor: colors.error },
  videoFrame: {
    width: '100%',
    borderRadius: tokens.radii.large,
    overflow: 'hidden',
    backgroundColor: colors.videoViewport,
    borderWidth: tokens.borderWidths.hairline,
    borderColor: colors.border,
  },
  videoStandard: { aspectRatio: VIDEO_FRAME_ASPECT_RATIO },
  cameraVideo: { flexGrow: 1 },
  videoFill: { flex: 1 },
  fullscreenVideo: { borderRadius: tokens.radii.none, borderWidth: tokens.borderWidths.none },
  video: { flex: 1 },
  videoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.x4, gap: tokens.spacing.x2 },
  emptyTitle: { textAlign: 'center' },
  emptyDescription: { textAlign: 'center' },
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
