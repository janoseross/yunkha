export type SignalMessage =
  | { type: 'create-room' | 'leave-room' }
  | { type: 'join-room'; code: string }
  | { type: 'ready' | 'waiting' | 'peer-left' }
  | { type: 'error'; message: string }
  | { type: 'room-created' | 'room-joined' | 'room-ended'; code: string }
  | { type: 'room-error'; reason: string }
  | { type: 'stop'; callId: string }
  | { type: 'offer'; callId: string; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { type: 'answer'; callId: string; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { type: 'candidate'; callId: string; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;

export function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0, 4);
}
