import {
  MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription,
} from 'react-native-webrtc';

import type { SignalMessage } from '../signaling/types';

type CallMessage = Extract<SignalMessage, { callId: string }>;
type Options = {
  role: 'sender' | 'receiver';
  send: (message: SignalMessage) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
  onFailure: () => void;
};

export function releaseStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
  stream.release();
}

/** Owns exactly one WebRTC call; a room may create several calls as peers come and go. */
export class PeerConnectionSession {
  private peer: RTCPeerConnection | null = null;
  private callId: string | null = null;
  private pendingCandidates: RTCIceCandidate[] = [];
  private pendingLocalCandidates: RTCIceCandidate[] = [];
  private offerSent = false;
  private remoteStream: MediaStream | null = null;

  constructor(private options: Options) {}

  get active() { return this.peer !== null; }
  matches(callId: string) { return callId === this.callId; }

  stop(notify: boolean) {
    if (notify && this.callId) this.options.send({ type: 'stop', callId: this.callId });
    this.callId = null;
    this.pendingCandidates = [];
    this.pendingLocalCandidates = [];
    this.offerSent = false;
    const oldPeer = this.peer;
    this.peer = null;
    if (oldPeer) {
      oldPeer.onicecandidate = null;
      oldPeer.ontrack = null;
      oldPeer.onconnectionstatechange = null;
      oldPeer.close();
    }
    if (this.remoteStream) {
      releaseStream(this.remoteStream);
      this.remoteStream = null;
    }
    this.options.onRemoteStream(null);
  }

  private create(callId: string) {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.peer = peer;
    this.callId = callId;
    this.pendingLocalCandidates = [];
    this.offerSent = false;
    peer.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      if (!event.candidate || this.peer !== peer) return;
      if (this.options.role === 'sender' && !this.offerSent) this.pendingLocalCandidates.push(event.candidate);
      else this.options.send({ type: 'candidate', callId, candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event: { streams: MediaStream[] }) => {
      if (this.options.role !== 'receiver' || this.peer !== peer || !event.streams[0]) return;
      this.remoteStream = event.streams[0];
      this.options.onRemoteStream(event.streams[0]);
    };
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer) return;
      if (peer.connectionState === 'failed') {
        this.stop(true);
        this.options.onFailure();
        return;
      }
      this.options.onStatus(`WebRTC: ${peer.connectionState}`);
      if (peer.connectionState === 'connected') {
        void peer.getStats().then((stats) => {
          const transport = [...stats.values()].find((item) => item.type === 'transport');
          const pair = transport && stats.get(transport.selectedCandidatePairId);
          const local = pair && stats.get(pair.localCandidateId);
          const remote = pair && stats.get(pair.remoteCandidateId);
          if (this.peer === peer && local && remote) {
            this.options.onStatus(`Connected: ${local.candidateType} ↔ ${remote.candidateType}`);
          }
        }).catch(() => {});
      }
    };
    return peer;
  }

  async offer(stream: MediaStream) {
    if (this.peer) return;
    const callId = `${Date.now()}-${Math.random()}`;
    const peer = this.create(callId);
    const isCurrent = () => this.peer === peer && this.callId === callId;
    try {
      peer.addTrack(stream.getVideoTracks()[0], stream);
      const description = await peer.createOffer();
      if (!isCurrent()) return;
      await peer.setLocalDescription(description);
      if (!isCurrent()) return;
      this.options.send({ type: 'offer', callId, sdp: description });
      this.offerSent = true;
      for (const candidate of this.pendingLocalCandidates) {
        this.options.send({ type: 'candidate', callId, candidate: candidate.toJSON() });
      }
      this.pendingLocalCandidates = [];
      this.options.onStatus('Waiting for answer');
    } catch (cause) {
      if (isCurrent()) {
        this.options.onError(cause instanceof Error ? cause.message : 'Could not create offer');
        this.stop(true);
      }
    }
  }

  async acceptOffer(message: Extract<CallMessage, { type: 'offer' }>) {
    this.stop(false);
    const peer = this.create(message.callId);
    await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
    if (this.peer !== peer) return;
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    if (this.peer !== peer) return;
    this.options.send({ type: 'answer', callId: message.callId, sdp: answer });
    for (const candidate of this.pendingCandidates) await peer.addIceCandidate(candidate);
    this.pendingCandidates = [];
    this.options.onStatus('Connecting video…');
  }

  async acceptAnswer(message: Extract<CallMessage, { type: 'answer' }>) {
    if (!this.matches(message.callId) || !this.peer) return;
    const peer = this.peer;
    await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
    if (this.peer !== peer) return;
    for (const candidate of this.pendingCandidates) await peer.addIceCandidate(candidate);
    this.pendingCandidates = [];
  }

  async acceptCandidate(message: Extract<CallMessage, { type: 'candidate' }>) {
    if (!this.matches(message.callId) || !this.peer || !message.candidate) return;
    const candidate = new RTCIceCandidate(message.candidate);
    if (this.peer.remoteDescription) await this.peer.addIceCandidate(candidate);
    else this.pendingCandidates.push(candidate);
  }
}
