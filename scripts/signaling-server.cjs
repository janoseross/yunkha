const { WebSocket, WebSocketServer } = require('ws');
const { randomInt } = require('node:crypto');

const port = 8787;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const clients = new Map();
const server = new WebSocketServer({ host: '0.0.0.0', port, perMessageDeflate: false });
server.on('listening', () => console.log(`Yunkha signaling listening on port ${port}`));
server.on('error', (error) => {
  console.error('Signaling server error:', error);
  process.exitCode = 1;
});

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function newRoomCode() {
  if (rooms.size === alphabet.length ** 4) return null;
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function leaveRoom(socket) {
  const client = clients.get(socket);
  if (!client?.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  client.role = null;
  if (!room) return;

  if (room.camera === socket) {
    rooms.delete(room.code);
    if (room.monitor) {
      const monitor = clients.get(room.monitor);
      if (monitor) {
        monitor.roomCode = null;
        monitor.role = null;
      }
      send(room.monitor, { type: 'room-ended', code: room.code });
    }
  } else if (room.monitor === socket) {
    room.monitor = null;
    send(room.camera, { type: 'peer-left' });
    send(room.camera, { type: 'waiting' });
  }
}

server.on('connection', (socket) => {
  const client = { role: null, roomCode: null };
  clients.set(socket, client);

  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(socket, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      send(socket, { type: 'error', message: 'Invalid message' });
      return;
    }

    if (message.type === 'create-room') {
      if (client.roomCode) {
        send(socket, { type: 'room-error', reason: 'already-in-room' });
        return;
      }
      const code = newRoomCode();
      if (!code) {
        send(socket, { type: 'room-error', reason: 'rooms-full' });
        return;
      }
      rooms.set(code, { code, camera: socket, monitor: null });
      client.role = 'sender';
      client.roomCode = code;
      send(socket, { type: 'room-created', code });
      send(socket, { type: 'waiting' });
      console.log(`Room ${code} created`);
      return;
    }

    if (message.type === 'join-room') {
      if (client.roomCode) {
        send(socket, { type: 'room-error', reason: 'already-in-room' });
        return;
      }
      const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
      if (code.length !== 4 || ![...code].every((character) => alphabet.includes(character))) {
        send(socket, { type: 'room-error', reason: 'invalid-room-code' });
        return;
      }
      const room = rooms.get(code);
      if (room && room.camera.readyState !== WebSocket.OPEN) leaveRoom(room.camera);
      if (!rooms.has(code)) {
        send(socket, { type: 'room-error', reason: 'room-not-found' });
        return;
      }
      if (room.monitor && room.monitor.readyState !== WebSocket.OPEN) leaveRoom(room.monitor);
      if (room.monitor) {
        send(socket, { type: 'room-error', reason: 'room-full' });
        return;
      }
      room.monitor = socket;
      client.role = 'receiver';
      client.roomCode = code;
      send(socket, { type: 'room-joined', code });
      send(socket, { type: 'ready' });
      send(room.camera, { type: 'ready' });
      console.log(`Monitor joined room ${code}`);
      return;
    }

    if (message.type === 'leave-room') {
      if (!client.roomCode) {
        send(socket, { type: 'room-error', reason: 'not-in-room' });
        return;
      }
      leaveRoom(socket);
      return;
    }

    if (!['offer', 'answer', 'candidate', 'stop'].includes(message.type)) return;
    if (message.type === 'offer' && client.role !== 'sender') return;
    if (message.type === 'answer' && client.role !== 'receiver') return;
    if (typeof message.callId !== 'string') return;
    const room = rooms.get(client.roomCode);
    if (!room || room[client.role === 'sender' ? 'camera' : 'monitor'] !== socket) return;
    const other = client.role === 'sender' ? room.monitor : room.camera;
    send(other, message);
  });

  socket.on('close', () => {
    leaveRoom(socket);
    clients.delete(socket);
  });
});
