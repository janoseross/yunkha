import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard } from 'react-native';
import { MediaStream } from 'react-native-webrtc';

import { signalingUrl } from '../../../devConfig';
import { SignalingClient } from '../../services/signaling/signalingClient';
import type { SignalMessage } from '../../services/signaling/types';
import { normalizeRoomCode, ROOM_CODE_PATTERN } from '../../services/signaling/types';
import { PeerConnectionSession } from '../../services/webrtc/peerConnection';
import { readRecentRoom, saveRecentRoom } from '../../storage/recentRoom';

export function useMonitorSession() {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState(signalingUrl ? 'Enter a room code' : 'Signaling not configured');
  const [error, setError] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [recentRoom, setRecentRoom] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinId, setJoinId] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const signalingRef = useRef<SignalingClient | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const pendingJoinRef = useRef<string | null>(null);
  const recentRoomUpdatedRef = useRef(false);
  const peerReadyRef = useRef(false);
  const mounted = useRef(false);
  const peerRef = useRef<PeerConnectionSession | null>(null);

  useEffect(() => {
    let active = true;
    void readRecentRoom().then((savedCode) => {
      if (active && !recentRoomUpdatedRef.current && savedCode) setRecentRoom(savedCode);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const changeRoomInput = (value: string) => {
    setRoomInput(normalizeRoomCode(value));
    setError(null);
  };

  const join = (submittedCode: string) => {
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
    if (signalingRef.current?.isOpen) {
      signalingRef.current.send({ type: 'join-room', code });
    } else if (!signalingRef.current?.isConnecting) {
      setConnectionAttempt((attempt) => attempt + 1);
    }
  };

  const stopCall = useCallback((notify: boolean) => {
    peerRef.current?.stop(notify);
    if (mounted.current) setStatus(peerReadyRef.current ? 'Waiting for Camera video' : 'Waiting for Camera');
  }, []);

  const handleSignal = useCallback(async (message: SignalMessage) => {
    try {
      switch (message.type) {
        case 'room-joined':
          Keyboard.dismiss();
          pendingJoinRef.current = null;
          roomCodeRef.current = message.code;
          setRoomCode(message.code);
          setJoinId((id) => id + 1);
          setRoomInput('');
          recentRoomUpdatedRef.current = true;
          setRecentRoom(message.code);
          void saveRecentRoom(message.code).catch(() => {
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
          if (!roomCodeRef.current) setStatus('Enter a room code');
          break;
        }
        case 'room-ended':
          roomCodeRef.current = null;
          peerReadyRef.current = false;
          setRoomCode(null);
          setRoomInput('');
          setError(null);
          stopCall(false);
          setStatus('Camera ended the room');
          break;
        case 'waiting':
          peerReadyRef.current = false;
          if (peerRef.current?.active) stopCall(false);
          setStatus('Waiting for Camera');
          break;
        case 'ready':
          if (!roomCodeRef.current) break;
          if (peerRef.current?.active) stopCall(false);
          peerReadyRef.current = true;
          setError(null);
          setStatus('Waiting for Camera video');
          break;
        case 'peer-left':
          peerReadyRef.current = false;
          stopCall(false);
          setStatus('Camera disconnected');
          break;
        case 'offer':
          if (!roomCodeRef.current || !message.sdp) break;
          await peerRef.current?.acceptOffer(message);
          break;
        case 'candidate':
          await peerRef.current?.acceptCandidate(message);
          break;
        case 'stop':
          if (peerRef.current?.matches(message.callId)) stopCall(false);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    } catch (cause) {
      if (!mounted.current || ('callId' in message && !peerRef.current?.matches(message.callId))) return;
      setError(cause instanceof Error ? cause.message : 'Signaling failed');
      stopCall(true);
    }
  }, [stopCall]);

  useEffect(() => {
    mounted.current = true;
    if (!peerRef.current) {
      peerRef.current = new PeerConnectionSession({
        role: 'receiver',
        send: (message) => signalingRef.current?.send(message),
        onRemoteStream: (stream) => { if (mounted.current) setRemoteStream(stream); },
        onStatus: setStatus,
        onError: setError,
        onFailure: () => setStatus('Video connection failed'),
      });
    }
    if (!signalingUrl || connectionAttempt === 0) return () => { mounted.current = false; };
    const client = new SignalingClient(signalingUrl, {
      onOpen: () => {
        if (pendingJoinRef.current) client.send({ type: 'join-room', code: pendingJoinRef.current });
      },
      onMessage: (message) => { void handleSignal(message); },
      onClose: (reason) => {
        if (signalingRef.current !== client) return;
        signalingRef.current = null;
        roomCodeRef.current = null;
        pendingJoinRef.current = null;
        peerReadyRef.current = false;
        setRoomCode(null);
        setIsJoining(false);
        stopCall(false);
        setStatus('Signaling disconnected');
        if (reason) setError(reason);
      },
      onError: () => setError('Could not reach the signaling server'),
      onInvalidMessage: () => setError('Invalid signaling message'),
    });
    signalingRef.current = client;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopCall(true);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stopCall(true);
      if (roomCodeRef.current) client.send({ type: 'leave-room' });
      roomCodeRef.current = null;
      signalingRef.current = null;
      client.close();
    };
  }, [connectionAttempt, handleSignal, stopCall]);

  return { remoteStream, status, error, roomInput, recentRoom, roomCode, joinId, isJoining, changeRoomInput, join };
}
