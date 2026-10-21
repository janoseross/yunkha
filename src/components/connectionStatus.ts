import type { ConnectionStatus } from './StatusIndicator';

export function connectionStatus(status: string, error: string | null, busy = false): ConnectionStatus {
  const statusLower = status.toLowerCase();
  return error || statusLower.includes('failed')
    ? 'error'
    : statusLower.includes('connected:') || statusLower === 'webrtc: connected'
      ? 'connected'
      : busy || statusLower.includes('connecting') || statusLower.includes('creating') || statusLower.includes('joining') || statusLower.includes('starting') || statusLower.includes('answer')
        ? 'connecting'
        : statusLower.includes('waiting') || statusLower.includes('ready')
          ? 'waiting'
          : 'disconnected';
}
