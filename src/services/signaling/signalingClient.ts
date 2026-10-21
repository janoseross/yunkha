import type { SignalMessage } from './types';

type Handlers = {
  onOpen: () => void;
  onMessage: (message: SignalMessage) => void;
  onClose: (reason: string) => void;
  onError: () => void;
  onInvalidMessage: () => void;
};

export class SignalingClient {
  private socket: WebSocket;

  constructor(url: string, handlers: Handlers) {
    this.socket = new WebSocket(url);
    this.socket.onopen = handlers.onOpen;
    this.socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data) as SignalMessage);
      } catch {
        handlers.onInvalidMessage();
      }
    };
    this.socket.onclose = (event) => handlers.onClose(event.reason);
    this.socket.onerror = handlers.onError;
  }

  get isOpen() { return this.socket.readyState === WebSocket.OPEN; }
  get isConnecting() { return this.socket.readyState === WebSocket.CONNECTING; }

  send(message: SignalMessage) {
    if (this.isOpen) this.socket.send(JSON.stringify(message));
  }

  close() {
    this.socket.onopen = null;
    this.socket.onmessage = null;
    this.socket.onclose = null;
    this.socket.onerror = null;
    this.socket.close();
  }
}
