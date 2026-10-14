import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  MediaStream, mediaDevices, RTCIceCandidate, RTCPeerConnection,
  RTCSessionDescription, RTCView,
} from 'react-native-webrtc';

import { signalingUrl } from './devConfig';
import type { Role } from './devConfig';

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
  const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown';
  const androidBuildNumber = Platform.OS === 'android' ? Application.nativeBuildVersion : null;
  const buildTimestamp = Constants.expoConfig?.extra?.buildTimestamp;

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['bottom']} style={styles.container}>
        <StatusBar style="light" />
        {role ? (
          <Session role={role} onLeave={() => setRole(null)} />
        ) : (
          <>
            <View style={styles.roleChoice}>
              <Text style={styles.title}>Yunkha</Text>
              <Button title="Camera" onPress={() => setRole('sender')} />
              <Button title="Monitor" onPress={() => setRole('receiver')} />
            </View>
            <Text style={styles.buildInfo}>
              Version {appVersion}{androidBuildNumber ? ` · Android build ${androidBuildNumber}` : ''}{'\n'}
              Built {typeof buildTimestamp === 'string' ? buildTimestamp : 'unavailable'}
            </Text>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Session({ role, onLeave }: { role: Role; onLeave: () => void }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState(signalingUrl ? (role === 'sender' ? 'Connecting to signaling server…' : 'Enter a room code') : 'Signaling not configured');
  const [error, setError] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [showLocalPreview, setShowLocalPreview] = useState(true);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('balanced');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
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
          setError(null);
          setStatus('Waiting for Monitor');
          break;
        case 'room-joined':
          if (role !== 'receiver') break;
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
  const qualityLocked = isStarting || !!localStream;
  return (
    <View style={styles.session}>
      {role === 'sender' && localStream && <CameraKeepAwake />}
      <Text style={styles.title}>Yunkha · {role === 'sender' ? 'Camera' : 'Monitor'}</Text>
      {role === 'sender' && roomCode && (
        <View style={styles.roomCodeBlock}>
          <Text style={styles.roomCodeLabel}>Room code</Text>
          <Text style={styles.roomCode}>{roomCode}</Text>
        </View>
      )}
      <Text style={styles.status}>{status}</Text>
      {role === 'receiver' && !roomCode ? (
        <View style={styles.roomEntry}>
          <Text style={styles.roomEntryLabel}>Enter room code</Text>
          <TextInput
            accessibilityLabel="Room code"
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
          />
          <Button title="Connect" onPress={connectMonitor} disabled={isJoining || roomInput.length !== 4 || !signalingUrl} />
        </View>
      ) : (
        <View style={styles.preview}>
          {preview && (role !== 'sender' || showLocalPreview) ? (
            <RTCView style={styles.video} streamURL={preview.toURL()} objectFit="cover" mirror={role === 'sender' && cameraFacing === 'user'} />
          ) : (
            <Text style={styles.message}>
              {role === 'sender' ? (localStream ? 'Local preview off · Camera still streaming' : 'Camera stopped') : 'Waiting for video'}
            </Text>
          )}
        </View>
      )}
      {(error || !signalingUrl) && (
        <Text style={styles.error} accessibilityRole="alert">
          {error || 'Set EXPO_PUBLIC_SIGNALING_URL to the signaling WebSocket URL.'}
        </Text>
      )}
      {role === 'sender' && (
        <View style={styles.qualitySection}>
          <Text style={styles.qualityLabel}>Video Quality{qualityLocked ? ' · Stop Camera to change' : ''}</Text>
          <View style={styles.qualityOptions}>
            {(['low', 'balanced', 'high'] as const).map((quality) => {
              const preset = VIDEO_QUALITY_PRESETS[quality];
              const selected = videoQuality === quality;
              return (
                <Pressable
                  key={quality}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: qualityLocked }}
                  disabled={qualityLocked}
                  onPress={() => {
                    if (!startingRef.current && !localStreamRef.current) setVideoQuality(quality);
                  }}
                  style={[styles.qualityOption, selected && styles.qualityOptionSelected, qualityLocked && styles.qualityOptionDisabled]}
                >
                  <Text style={styles.qualityOptionLabel}>{preset.label}</Text>
                  <Text style={styles.qualityOptionDetail}>{preset.height}p / {preset.frameRate} fps</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {role === 'sender' && (
        <View style={styles.controls}>
          <Button title="Start Camera" onPress={startCamera} disabled={isStarting || !!localStream} />
          <Button title="Stop Camera" onPress={() => stopCall(true, true)} disabled={!isStarting && !localStream} />
        </View>
      )}
      {role === 'sender' && (
        <View style={styles.previewControl}>
          <Button
            title={isSwitchingCamera ? 'Switching Camera…' : cameraFacing === 'environment' ? 'Use Front Camera' : 'Use Rear Camera'}
            onPress={switchCamera}
            disabled={isStarting || isSwitchingCamera}
          />
          {!!localStream && (
            <Button title={showLocalPreview ? 'Hide Preview' : 'Show Preview'} onPress={() => setShowLocalPreview((visible) => !visible)} />
          )}
        </View>
      )}
      <View style={styles.leaveControl}>
        <Button title="Leave" onPress={onLeave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingTop: 48, paddingBottom: 32 },
  session: { flex: 1 },
  roleChoice: { flex: 1, justifyContent: 'center', gap: 16 },
  buildInfo: { color: '#777', fontSize: 11, textAlign: 'center', paddingHorizontal: 16 },
  title: { color: '#fff', textAlign: 'center', fontSize: 20 },
  roomCodeBlock: { alignItems: 'center', paddingTop: 12 },
  roomCodeLabel: { color: '#bbb', fontSize: 16 },
  roomCode: { color: '#fff', fontSize: 40, fontWeight: 'bold', letterSpacing: 8 },
  status: { color: '#bbb', textAlign: 'center', marginVertical: 12 },
  roomEntry: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  roomEntryLabel: { color: '#fff', fontSize: 16 },
  roomInput: { width: 240, borderColor: '#888', borderWidth: 1, borderRadius: 8, color: '#fff', fontSize: 28, letterSpacing: 6, textAlign: 'center', padding: 12 },
  preview: { flex: 1, backgroundColor: '#222', justifyContent: 'center' },
  video: { flex: 1 },
  message: { color: '#fff', textAlign: 'center' },
  error: { color: '#ff8787', textAlign: 'center', padding: 12 },
  qualitySection: { paddingHorizontal: 12, paddingTop: 8 },
  qualityLabel: { color: '#bbb', textAlign: 'center', marginBottom: 8 },
  qualityOptions: { flexDirection: 'row', gap: 8 },
  qualityOption: { flex: 1, alignItems: 'center', backgroundColor: '#222', borderColor: '#555', borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  qualityOptionSelected: { borderColor: '#fff', backgroundColor: '#333' },
  qualityOptionDisabled: { opacity: 0.6 },
  qualityOptionLabel: { color: '#fff', fontSize: 14 },
  qualityOptionDetail: { color: '#bbb', fontSize: 11 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 16 },
  previewControl: { paddingTop: 8, gap: 8 },
  leaveControl: { paddingTop: 16 },
});
