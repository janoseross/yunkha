const { WebSocket, WebSocketServer } = require('ws');

const port = 8787;
const peers = new Map();
const server = new WebSocketServer({ host: '0.0.0.0', port, perMessageDeflate: false });
server.on('listening', () => console.log(`Yunkha signaling listening on port ${port}`));
server.on('error', (error) => {
  console.error('Signaling server error:', error);
  process.exitCode = 1;
});

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

server.on('connection', (socket) => {
  let role;

  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(socket, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    if (!message || typeof message !== 'object') {
      send(socket, { type: 'error', message: 'Invalid message' });
      return;
    }

    if (!role) {
      if (message.type !== 'join' || !['sender', 'receiver'].includes(message.role)) {
        socket.close(1008, 'Join as sender or receiver');
        return;
      }
      if (peers.has(message.role)) {
        socket.close(1008, `${message.role} already connected`);
        return;
      }
      role = message.role;
      peers.set(role, socket);
      console.log(`${role} connected`);
      const other = peers.get(role === 'sender' ? 'receiver' : 'sender');
      if (other) {
        send(socket, { type: 'ready' });
        send(other, { type: 'ready' });
      } else {
        send(socket, { type: 'waiting' });
      }
      return;
    }

    if (!['offer', 'answer', 'candidate', 'stop'].includes(message.type)) return;
    if (message.type === 'offer' && role !== 'sender') return;
    if (message.type === 'answer' && role !== 'receiver') return;
    if (typeof message.callId !== 'string') return;
    const other = peers.get(role === 'sender' ? 'receiver' : 'sender');
    send(other, message);
  });

  socket.on('close', () => {
    if (role && peers.get(role) === socket) {
      peers.delete(role);
      console.log(`${role} disconnected`);
      send(peers.get(role === 'sender' ? 'receiver' : 'sender'), { type: 'peer-left' });
    }
  });
});
