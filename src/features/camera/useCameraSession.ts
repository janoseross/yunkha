import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MediaStream, mediaDevices, permissions } from 'react-native-webrtc';

import { signalingUrl } from '../../../devConfig';
import { SignalingClient } from '../../services/signaling/signalingClient';
import type { SignalMessage } from '../../services/signaling/types';
import { PeerConnectionSession, releaseStream } from '../../services/webrtc/peerConnection';

export const VIDEO_QUALITY_PRESETS = {
  low: { label: 'Low', width: 640, height: 480, frameRate: 10 },
  balanced: { label: 'Balanced', width: 1280, height: 720, frameRate: 15 },
  high: { label: 'High', width: 1920, height: 1080, frameRate: 30 },
} as const;
export type VideoQuality = keyof typeof VIDEO_QUALITY_PRESETS;

export function CameraKeepAwake() {
  useKeepAwake();
  return null;
}

export function useCameraSession() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState(signalingUrl ? 'Connecting to signaling server…' : 'Signaling not configured');
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [showLocalPreview, setShowLocalPreview] = useState(true);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('balanced');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isChangingQuality, setIsChangingQuality] = useState(false);

  const signalingRef = useRef<SignalingClient | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerReadyRef = useRef(false);
  const startRequest = useRef(0);
  const startingRef = useRef(false);
  const cameraOperationRef = useRef(false);
  const permissionRequestRef = useRef(false);
  const resumeCaptureRef = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const peerRef = useRef<PeerConnectionSession | null>(null);

  const stopCall = useCallback((stopCapture: boolean, notify: boolean) => {
    peerRef.current?.stop(notify);
    if (stopCapture) {
      startRequest.current += 1;
      resumeCaptureRef.current?.();
      if (localStreamRef.current) {
        releaseStream(localStreamRef.current);
        localStreamRef.current = null;
      }
    }
    if (mounted.current) {
      if (stopCapture) setLocalStream(null);
      setStatus(peerReadyRef.current
        ? localStreamRef.current ? 'Waiting for video connection' : 'Waiting for camera to start'
        : 'Waiting for Monitor');
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (startingRef.current || cameraOperationRef.current || localStreamRef.current) return;
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
      if (peerReadyRef.current) await peerRef.current?.offer(stream);
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
  }, [cameraFacing, videoQuality]);

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
    if (isStarting || cameraOperationRef.current) return;
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
          roomCodeRef.current = message.code;
          setRoomCode(message.code);
          setError(null);
          setStatus('Waiting for Monitor');
          break;
        case 'room-error': {
          const messages: Record<string, string> = {
            'invalid-room-code': 'Enter a valid 4-letter room code.',
            'room-not-found': 'Room not found. Check the code and try again.',
            'room-full': 'This room already has a Monitor.',
            'already-in-room': 'Already connected to a room.',
            'not-in-room': 'Not connected to a room.',
            'rooms-full': 'Could not create a room. Try again later.',
          };
          setError(messages[message.reason] || 'Could not connect to the room.');
          break;
        }
        case 'waiting':
          peerReadyRef.current = false;
          if (peerRef.current?.active) stopCall(false, false);
          setStatus('Waiting for Monitor');
          break;
        case 'ready':
          if (!roomCodeRef.current) break;
          if (peerRef.current?.active) stopCall(false, false);
          peerReadyRef.current = true;
          setError(null);
          setStatus(localStreamRef.current ? 'Connecting video…' : 'Waiting for camera to start');
          if (localStreamRef.current) await peerRef.current?.offer(localStreamRef.current);
          break;
        case 'peer-left':
          peerReadyRef.current = false;
          stopCall(false, false);
          setStatus('Waiting for Monitor');
          break;
        case 'answer':
          await peerRef.current?.acceptAnswer(message);
          break;
        case 'candidate':
          await peerRef.current?.acceptCandidate(message);
          break;
        case 'stop':
          if (peerRef.current?.matches(message.callId)) stopCall(false, false);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    } catch (cause) {
      if (!mounted.current || ('callId' in message && !peerRef.current?.matches(message.callId))) return;
      setError(cause instanceof Error ? cause.message : 'Signaling failed');
      stopCall(false, true);
    }
  }, [stopCall]);

  useEffect(() => {
    mounted.current = true;
    if (!peerRef.current) {
      peerRef.current = new PeerConnectionSession({
        role: 'sender',
        send: (message) => signalingRef.current?.send(message),
        onRemoteStream: () => {},
        onStatus: setStatus,
        onError: (message) => {
          setError(message);
          setStatus(peerReadyRef.current
            ? localStreamRef.current ? 'Waiting for video connection' : 'Waiting for camera to start'
            : 'Waiting for Monitor');
        },
        onFailure: () => setStatus('Video connection failed'),
      });
    }
    if (!signalingUrl) return () => { mounted.current = false; };
    const client = new SignalingClient(signalingUrl, {
      onOpen: () => {
        client.send({ type: 'create-room' });
        setStatus('Creating room…');
      },
      onMessage: (message) => { void handleSignal(message); },
      onClose: (reason) => {
        if (signalingRef.current !== client) return;
        signalingRef.current = null;
        roomCodeRef.current = null;
        peerReadyRef.current = false;
        setRoomCode(null);
        stopCall(true, false);
        setStatus('Signaling disconnected');
        if (reason) setError(reason);
      },
      onError: () => setError('Could not reach the signaling server'),
      onInvalidMessage: () => setError('Invalid signaling message'),
    });
    signalingRef.current = client;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !permissionRequestRef.current) stopCall(true, true);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stopCall(true, true);
      if (roomCodeRef.current) client.send({ type: 'leave-room' });
      roomCodeRef.current = null;
      signalingRef.current = null;
      client.close();
    };
  }, [handleSignal, stopCall]);

  return {
    localStream, isStarting, status, error, roomCode,
    showLocalPreview, setShowLocalPreview, videoQuality, cameraFacing,
    isSwitchingCamera, isChangingQuality, startCamera, stopCamera: () => stopCall(true, true),
    changeVideoQuality, switchCamera,
  };
}
