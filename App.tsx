import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Clipboard, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
  RTCSessionDescription, RTCView, permissions,
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
  const [recentRoom, setRecentRoom] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showLocalPreview, setShowLocalPreview] = useState(true);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('balanced');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isChangingQuality, setIsChangingQuality] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isRoomInputFocused, setIsRoomInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(role === 'sender' ? 1 : 0);
  const socketRef = useRef<WebSocket | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const pendingJoinRef = useRef<string | null>(null);
  const recentRoomUpdatedRef = useRef(false);
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
  const cameraOperationRef = useRef(false);
  const permissionRequestRef = useRef(false);
  const resumeCaptureRef = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const sessionScrollRef = useRef<ScrollView>(null);

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
    const show = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      setIsRoomInputFocused(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [role]);

  useEffect(() => {
    if (!isKeyboardVisible || role !== 'receiver' || roomCode) return;
    const frame = requestAnimationFrame(() => sessionScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [isKeyboardVisible, role, roomCode]);

  useEffect(() => {
    if (role !== 'receiver') return;
    let active = true;
    void AsyncStorage.getItem(LAST_MONITOR_ROOM_KEY).then((savedCode) => {
      if (active && !recentRoomUpdatedRef.current && savedCode && ROOM_CODE_PATTERN.test(savedCode)) setRecentRoom(savedCode);
    }).catch(() => {});
    return () => { active = false; };
  }, [role]);

  const send = useCallback((message: SignalMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connectMonitor = (submittedCode: string) => {
    if (isJoining || pendingJoinRef.current || roomCodeRef.current) return;
    const code = submittedCode.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) {
      setError('Enter a valid 4-letter room code.');
      return;
    }
    Keyboard.dismiss();
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
    if (oldPeer) {
      oldPeer.onicecandidate = null;
      oldPeer.ontrack = null;
      oldPeer.onconnectionstatechange = null;
      oldPeer.close();
    }
    pendingLocalCandidates.current = [];
    offerSent.current = false;
    if (remoteStreamRef.current) {
      releaseStream(remoteStreamRef.current);
      remoteStreamRef.current = null;
    }
    if (stopCapture) {
      startRequest.current += 1;
      resumeCaptureRef.current?.();
      if (localStreamRef.current) {
        releaseStream(localStreamRef.current);
        localStreamRef.current = null;
      }
    }
    if (mounted.current) {
      setRemoteStream(null);
      if (stopCapture) setLocalStream(null);
      setStatus(peerReadyRef.current
        ? role === 'sender'
          ? localStreamRef.current ? 'Waiting for video connection' : 'Waiting for camera to start'
          : 'Waiting for Camera video'
        : role === 'sender' ? 'Waiting for Monitor' : 'Waiting for Camera');
    }
  }, [role, send]);

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
      if (peer.connectionState === 'failed') {
        stopCall(role !== 'sender', true);
        setStatus('Video connection failed');
        return;
      }
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
  }, [role, send, stopCall]);

  const offer = useCallback(async (stream: MediaStream) => {
    if (!peerReadyRef.current || peerRef.current) return;
    const callId = `${Date.now()}-${Math.random()}`;
    const peer = createPeer(callId);
    const isCurrentCall = () => peerRef.current === peer && callIdRef.current === callId;
    try {
      peer.addTrack(stream.getVideoTracks()[0], stream);
      const description = await peer.createOffer();
      if (!isCurrentCall()) return;
      await peer.setLocalDescription(description);
      if (!isCurrentCall()) return;
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
        stopCall(false, true);
      }
    }
  }, [createPeer, send, stopCall]);

  const startCamera = useCallback(async () => {
    if (role !== 'sender' || startingRef.current || cameraOperationRef.current || localStreamRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    setError(null);
    setStatus('Starting camera…');
    const request = ++startRequest.current;
    const preset = VIDEO_QUALITY_PRESETS[videoQuality];
    try {
      permissionRequestRef.current = true;
      let granted: boolean;
      try {
        granted = await permissions.request({ name: 'camera' });
      } finally {
        permissionRequestRef.current = false;
      }
      if (!mounted.current || request !== startRequest.current) return;
      if (!granted) {
        setError('Camera permission denied. Allow camera access in device settings and try again.');
        setStatus('Camera permission denied');
        return;
      }
      if (AppState.currentState !== 'active') {
        await new Promise<void>((resolve) => {
          let completed = false;
          const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') finish();
          });
          const finish = () => {
            if (completed) return;
            completed = true;
            subscription.remove();
            resumeCaptureRef.current = null;
            resolve();
          };
          resumeCaptureRef.current = finish;
          if (AppState.currentState === 'active') finish();
        });
      }
      if (!mounted.current || request !== startRequest.current) return;
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
        const message = cause instanceof Error ? cause.message : 'Could not start the camera';
        setError(/permission|notallowed|security/i.test(message)
          ? 'Camera permission denied. Allow camera access in device settings and try again.'
          : message);
        setStatus('Camera failed');
      }
    } finally {
      startingRef.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, [cameraFacing, offer, role, videoQuality]);

  const changeVideoQuality = async (quality: VideoQuality) => {
    if (quality === videoQuality || startingRef.current || cameraOperationRef.current) return;
    const stream = localStreamRef.current;
    if (!stream) {
      setVideoQuality(quality);
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') {
      setError('Camera capture stopped. Stop and restart the camera.');
      return;
    }
    cameraOperationRef.current = true;
    setIsChangingQuality(true);
    setError(null);
    const request = startRequest.current;
    const facingMode = track.getSettings().facingMode ?? cameraFacing;
    const previous = VIDEO_QUALITY_PRESETS[videoQuality];
    const selected = VIDEO_QUALITY_PRESETS[quality];
    const stillCapturing = () => mounted.current && request === startRequest.current && localStreamRef.current === stream;
    try {
      await track.applyConstraints({ facingMode, width: selected.width, height: selected.height, frameRate: selected.frameRate });
      if (stillCapturing()) setVideoQuality(quality);
    } catch {
      if (stillCapturing()) {
        try {
          await track.applyConstraints({ facingMode, width: previous.width, height: previous.height, frameRate: previous.frameRate });
          if (stillCapturing()) setError('Could not change video quality. The previous quality was restored.');
        } catch {
          if (stillCapturing()) setError('Could not restore video quality. Stop and restart the camera.');
        }
      }
    } finally {
      cameraOperationRef.current = false;
      if (mounted.current) setIsChangingQuality(false);
    }
  };

  const switchCamera = async () => {
    if (role !== 'sender' || isStarting || cameraOperationRef.current) return;
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    const stream = localStreamRef.current;
    if (!stream) {
      setCameraFacing(nextFacing);
      return;
    }
    cameraOperationRef.current = true;
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
      cameraOperationRef.current = false;
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
          setRoomInput('');
          recentRoomUpdatedRef.current = true;
          setRecentRoom(message.code);
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
          setRoomInput('');
          setError(null);
          stopCall(true, false);
          setStatus('Camera ended the room');
          break;
        case 'waiting':
          peerReadyRef.current = false;
          if (peerRef.current) stopCall(role !== 'sender', false);
          setStatus(role === 'sender' ? 'Waiting for Monitor' : 'Waiting for Camera');
          break;
        case 'ready':
          if (!roomCodeRef.current) break;
          // A new room peer always starts a new call, even if the previous one failed to close cleanly.
          if (peerRef.current) stopCall(role !== 'sender', false);
          peerReadyRef.current = true;
          setError(null);
          setStatus(role === 'sender'
            ? localStreamRef.current ? 'Connecting video…' : 'Waiting for camera to start'
            : 'Waiting for Camera video');
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
      stopCall(role !== 'sender', true);
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
      if (state !== 'active' && !permissionRequestRef.current) stopCall(true, true);
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
  const isEditingRoom = role === 'receiver' && !roomCode && (isRoomInputFocused || isKeyboardVisible);
  const cameraPreviewMinHeight = Math.max(0, Math.min(windowWidth, tokens.layout.contentMaxWidth) - 2 * tokens.layout.screenPadding) / VIDEO_FRAME_ASPECT_RATIO;
  const qualityLocked = isStarting || isSwitchingCamera || isChangingQuality;
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
      <IconButton icon={ArrowLeft} accessibilityLabel={roomCode ? 'Leave room and return Home' : 'Return Home'} onPress={onLeave} />
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

  const sessionScreen = (
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
      {role === 'sender' && localStream && <CameraKeepAwake />}
      {header}

      {!isEditingRoom && (
        <View style={[styles.videoFrame, role === 'sender' ? [styles.cameraVideo, { minHeight: cameraPreviewMinHeight }] : styles.videoStandard]}>{videoContent}</View>
      )}

      {role === 'sender' && (
        <View style={styles.roomInfo}>
          <View style={styles.roomInfoTop}>
            <AppText variant="metadata" tone="textSecondary">ROOM</AppText>
            <AppText variant="heading" style={styles.roomCode} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} accessibilityLabel={roomCode ? `Room code ${roomCode.split('').join(' ')}` : 'Room code pending'}>
              {roomCode ?? '····'}
            </AppText>
            <Button label={codeCopied ? 'Copied' : 'Copy'} accessibilityLabel={codeCopied ? 'Room code copied' : 'Copy room code'} icon={codeCopied ? Check : Copy} variant="secondary" onPress={copyRoomCode} disabled={!roomCode} />
          </View>
          <StatusIndicator status={connectionStatus} label={connectionStatus === 'connected' ? 'Connected' : status} />
        </View>
      )}

      {role === 'receiver' && !roomCode && (
        <Card style={styles.joinCard}>
          <AppText variant="title">Join a room</AppText>
          {(isJoining || status !== 'Enter a room code') && <StatusIndicator status={connectionStatus} label={status} />}
          <View style={styles.joinRow}>
            <View style={styles.roomInputWrap}>
              <AppTextInput
                accessibilityLabel="Four-letter room code"
                style={styles.roomInput}
                value={roomInput}
                onChangeText={(value) => {
                  setRoomInput(value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0, 4));
                  setError(null);
                }}
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
                onSubmitEditing={() => connectMonitor(roomInput)}
                editable={!isJoining}
              />
            </View>
            <Button label="Join" onPress={() => connectMonitor(roomInput)} loading={isJoining} disabled={roomInput.length !== 4 || !signalingUrl} style={styles.roomActionButton} />
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
                <Button label="Rejoin" variant="secondary" onPress={() => connectMonitor(recentRoom)} disabled={isJoining || !signalingUrl} style={styles.roomActionButton} />
              </View>
            </View>
          )}
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
                  onPress={() => {
                    void changeVideoQuality(quality);
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
          disabled={isChangingQuality || isSwitchingCamera}
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
            disabled={isStarting || isSwitchingCamera || isChangingQuality}
            style={styles.utilityButton}
          />
          {!!localStream && (
            <Button label={showLocalPreview ? 'Hide preview' : 'Show preview'} icon={showLocalPreview ? EyeOff : Eye} variant="secondary" onPress={() => setShowLocalPreview((visible) => !visible)} style={styles.utilityButton} />
          )}
        </View>
      )}
    </ScrollView>
  );
  return role === 'receiver' ? (
    <KeyboardAvoidingView style={styles.session} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {sessionScreen}
    </KeyboardAvoidingView>
  ) : sessionScreen;
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
  videoStandard: { aspectRatio: VIDEO_FRAME_ASPECT_RATIO * 1.2 },
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
