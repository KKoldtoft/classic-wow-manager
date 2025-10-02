// scripts/chat-socket.cjs
// Socket.IO setup for /site-chat namespace. Minimal handshake only.

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const store = require('./chat-store.cjs');

let globalIo = null;
let outboundHandler = null; // function(payload)

function setOutboundHandler(fn) { outboundHandler = typeof fn === 'function' ? fn : null; }
function broadcastFromDiscord(payload) { if (globalIo) { try { globalIo.to('global').emit('message:new', payload); } catch (_) {} } }

async function createIo(server) {
  const io = new Server(server, {
    path: '/socket.io',
    cors: { origin: false },
    serveClient: false
  });
  globalIo = io;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
  }

  const nsp = io.of('/site-chat');

  nsp.use((socket, next) => {
    // Basic auth hook; rely on session cookie presence (Express session middleware)
    // In full impl, verify user identity before join
    next();
  });

  async function bindHandlers(socket) {
    try { console.log('[chat] connection', { id: socket.id, nsp: socket.nsp?.name }); } catch (_) {}
    try {
      socket.join('global');
      // Send recent messages & presence snapshot
      const recent = await store.getRecentMessages(200);
      try { console.log('[chat] send history count', recent.length); } catch(_) {}
      socket.emit('history', { messages: recent });
      const presence = await store.listPresence();
      socket.emit('presence:update', { usersOnline: presence });

      // Derive user from handshake auth (provided by whoAmI) or fallback to anon
      const userId = (socket.handshake && socket.handshake.auth && socket.handshake.auth.userId) ? String(socket.handshake.auth.userId) : `anon-${socket.id}`;
      const userName = (socket.handshake && socket.handshake.auth && socket.handshake.auth.userName) ? String(socket.handshake.auth.userName) : 'Anonymous';
      const avatarUrl = (socket.handshake && socket.handshake.auth && socket.handshake.auth.avatarUrl) ? String(socket.handshake.auth.avatarUrl) : null;

      await store.setPresence({ userId, userName, avatarUrl });
      const users = await store.listPresence();
      io.to('global').emit('presence:update', { usersOnline: users });
      try { console.log('[chat] presence size', users.length); } catch(_) {}

      socket.on('chat:message', async (msg) => {
        try { console.log('[chat] message from', userId, 'text=', (msg && msg.text ? String(msg.text).slice(0, 60) : '')); } catch (_) {}
        const payload = await store.addMessage({
          userId,
          userName,
          avatarUrl,
          text: String(msg && msg.text || ''),
          attachments: Array.isArray(msg && msg.attachments) ? msg.attachments : null,
          source: 'site'
        });
        io.to('global').emit('message:new', payload);
        if (outboundHandler) {
          try { outboundHandler(payload); } catch (e) { try { console.warn('[chat] outbound handler failed', e?.message || e); } catch(_) {} }
        }
      });

      socket.on('typing:start', () => { io.to('global').emit('typing:start', { userId, userName }); });
      socket.on('typing:stop', () => { io.to('global').emit('typing:stop', { userId, userName }); });

      // Moderation delete (server-initiated via REST will emit to room)
      socket.on('message:delete', async (payload) => {
        try {
          const id = payload && payload.id;
          if (!id) return;
          await store.deleteMessage(id);
          io.to('global').emit('message:delete', { id });
        } catch(_){}
      });

      // Heartbeat from client to refresh presence TTL
      socket.on('presence:heartbeat', async () => {
        try { await store.setPresence({ userId, userName, avatarUrl }); } catch(_) {}
      });

      socket.on('disconnect', async () => {
        await store.clearPresence(userId);
        io.to('global').emit('presence:update', { usersOnline: await store.listPresence() });
        try { console.log('[chat] disconnect', socket.id); } catch (_) {}
      });
    } catch (err) {
      try { console.error('[chat] connection error', err?.message || err); } catch (_) {}
    }
  }

  // Bind handlers for both default namespace and '/site-chat'
  io.on('connection', bindHandlers);
  nsp.on('connection', bindHandlers);

  return { io, nsp };
}

module.exports = { createIo, setOutboundHandler, broadcastFromDiscord };


