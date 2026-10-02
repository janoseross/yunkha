import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, StyleSheet, Text, View } from 'react-native';
import {
  MediaStream, mediaDevices, RTCIceCandidate, RTCPeerConnection,
  RTCSessionDescription, RTCView,
} from 'react-native-webrtc';

import { signalingUrl } from './devConfig';
import type { Role } from './devConfig';

type SignalMessage =
  | { type: 'ready' | 'waiting' | 'peer-left' }
  | { type: 'error'; message: string }
  | { type: 'stop'; callId: string }
  | { type: 'offer' | 'answer'; callId: string; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { type: 'candidate'; callId: string; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

function releaseStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
  stream.release();
}

export default function App() {
  const [role, setRole] = useState<Role | null>(null);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {role ? (
        <Session role={role} onLeave={() => setRole(null)} />
      ) : (
        <View style={styles.roleChoice}>
          <Text style={styles.title}>Yunkha</Text>
          <Button title="Camera" onPress={() => setRole('sender')} />
          <Button title="Monitor" onPress={() => setRole('receiver')} />
        </View>
      )}
    </View>
  );
}

function Session({ role, onLeave }: { role: Role; onLeave: () => void }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState(signalingUrl ? 'Connecting to signaling server…' : 'Signaling not configured');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
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

  const send = useCallback((message: SignalMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

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
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });
      if (!mounted.current || request !== startRequest.current) {
        releaseStream(stream);
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (peerReadyRef.current) await offer(stream);
      else setStatus('Camera ready; waiting for receiver');
    } catch (cause) {
      if (mounted.current && request === startRequest.current) {
        setError(cause instanceof Error ? cause.message : 'Could not start the camera');
        setStatus('Camera failed');
      }
    } finally {
      startingRef.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, [offer, role]);

  const handleSignal = useCallback(async (message: SignalMessage) => {
    try {
      switch (message.type) {
        case 'waiting':
          peerReadyRef.current = false;
          setStatus('Waiting for peer');
          break;
        case 'ready':
          peerReadyRef.current = true;
          setStatus('Peer ready');
          if (role === 'sender' && localStreamRef.current) await offer(localStreamRef.current);
          break;
        case 'peer-left':
          peerReadyRef.current = false;
          stopCall(true, false);
          break;
        case 'offer': {
          if (role !== 'receiver' || !message.sdp) break;
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
          if (message.callId === callIdRef.current) stopCall(true, false);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Signaling failed');
      stopCall(true, true);
    }
  }, [createPeer, offer, role, send, stopCall]);

  useEffect(() => {
    mounted.current = true;
    if (!signalingUrl) {
      return () => { mounted.current = false; };
    }
    const socket = new WebSocket(signalingUrl);
    socketRef.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', role }));
      setStatus('Waiting for peer');
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
      peerReadyRef.current = false;
      stopCall(true, false);
      setStatus('Signaling disconnected');
      if (event.reason) setError(event.reason);
    };
    socket.onerror = () => setError('Could not reach the Mac signaling server');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopCall(true, true);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stopCall(true, true);
      socketRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    };
  }, [handleSignal, role, stopCall]);

  const preview = role === 'sender' ? localStream : remoteStream;
  return (
    <View style={styles.session}>
      <Text style={styles.title}>Yunkha · {role === 'sender' ? 'Camera' : 'Monitor'}</Text>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.preview}>
        {preview ? (
          <RTCView style={styles.video} streamURL={preview.toURL()} objectFit="cover" />
        ) : (
          <Text style={styles.message}>{role === 'sender' ? 'Camera stopped' : 'Waiting for video'}</Text>
        )}
      </View>
      {(error || !signalingUrl) && (
        <Text style={styles.error} accessibilityRole="alert">
          {error || 'Set EXPO_PUBLIC_SIGNALING_URL to the Mac LAN WebSocket URL.'}
        </Text>
      )}
      {role === 'sender' && (
        <View style={styles.controls}>
          <Button title="Start Camera" onPress={startCamera} disabled={isStarting || !!localStream} />
          <Button title="Stop Camera" onPress={() => stopCall(true, true)} disabled={!isStarting && !localStream} />
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
  title: { color: '#fff', textAlign: 'center', fontSize: 20 },
  status: { color: '#bbb', textAlign: 'center', marginVertical: 12 },
  preview: { flex: 1, backgroundColor: '#222', justifyContent: 'center' },
  video: { flex: 1 },
  message: { color: '#fff', textAlign: 'center' },
  error: { color: '#ff8787', textAlign: 'center', padding: 12 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 16 },
  leaveControl: { paddingTop: 16 },
});
