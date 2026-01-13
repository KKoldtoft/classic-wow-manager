// scripts/chat-store.cjs
// Ephemeral message storage and presence using Redis

const crypto = require('crypto');
const { getRedisClient } = require('./chat-redis.cjs');

const GLOBAL_LIST_KEY = 'chat:global:list';
const MESSAGE_KEY = (id) => `chat:msg:${id}`;
const PRESENCE_KEY = (userId) => `chat:presence:${userId}`;

const TTL_SECONDS = 4 * 60 * 60; // 4 hours
const PRESENCE_TTL_SECONDS = 90; // extend TTL to reduce flicker; refreshed by client heartbeat
const GLOBAL_LIST_CAP = 1000; // max ids kept
const DEDUPE_TTL_SECONDS = 120; // 2 minutes to suppress duplicates

function generateId() {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(6).toString('base64url');
  return `${ts}_${rnd}`;
}

// In-memory fallback when REDIS_URL is not set
const mem = {
  messages: [], // newest first
  presence: new Map() // userId -> {userId,userName,avatarUrl,ts}
};

async function addMessage(message) {
  try {
    const client = await getRedisClient();
    // Dedupe: hash by source/user/text/minute
    try {
      const basisTs = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
      const minuteBucket = Math.floor(basisTs / 60000);
      const text = String(message && message.text || '').trim();
      const src = String(message && message.source || 'site');
      const uid = String(message && message.userId || '');
      const hashInput = `${src}|${uid}|${text}|${minuteBucket}`;
      const hash = crypto.createHash('sha256').update(hashInput).digest('base64url');
      const dedupeKey = `chat:dedupe:${hash}`;
      const ok = await client.set(dedupeKey, '1', { NX: true, EX: DEDUPE_TTL_SECONDS });
      if (ok !== 'OK') {
        return null; // duplicate
      }
    } catch (_) {}
    const id = message.id || generateId();
    const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
    const payload = { ...message, id, createdAt };
    const key = MESSAGE_KEY(id);
    const m = client.multi();
    m.set(key, JSON.stringify(payload), { EX: TTL_SECONDS });
    m.lPush(GLOBAL_LIST_KEY, id);
    m.lTrim(GLOBAL_LIST_KEY, 0, GLOBAL_LIST_CAP - 1);
    m.expire(GLOBAL_LIST_KEY, TTL_SECONDS);
    await m.exec();
    return payload;
  } catch (_) {
    const id = message.id || generateId();
    const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
    const payload = { ...message, id, createdAt };
    mem.messages.unshift(payload);
    if (mem.messages.length > GLOBAL_LIST_CAP) mem.messages.length = GLOBAL_LIST_CAP;
    return payload;
  }
}

async function getRecentMessages(limit = 200) {
  try {
    const client = await getRedisClient();
    const ids = await client.lRange(GLOBAL_LIST_KEY, 0, Math.max(0, limit - 1));
    if (!ids || ids.length === 0) return [];
    const m = client.multi();
    for (const id of ids) m.get(MESSAGE_KEY(id));
    const rows = await m.exec();
    const out = [];
    for (const row of rows) {
      const val = Array.isArray(row) ? row[1] : row; // node-redis returns value directly in v4
      if (!val) continue;
      try { out.push(JSON.parse(val)); } catch (_) {}
    }
    out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return out;
  } catch (_) {
    const out = mem.messages.slice(0, limit).slice().reverse(); // oldest-first
    return out;
  }
}

async function setPresence(user) {
  try {
    const client = await getRedisClient();
    const key = PRESENCE_KEY(user.userId);
    await client.set(key, JSON.stringify({ userId: user.userId, userName: user.userName, avatarUrl: user.avatarUrl, ts: Date.now() }), { EX: PRESENCE_TTL_SECONDS });
  } catch (_) {
    mem.presence.set(user.userId, { userId: user.userId, userName: user.userName, avatarUrl: user.avatarUrl, ts: Date.now() });
    // prune stale entries
    const now = Date.now();
    for (const [uid, rec] of mem.presence) {
      if (now - (rec.ts || 0) > PRESENCE_TTL_SECONDS * 1000) mem.presence.delete(uid);
    }
  }
}

async function clearPresence(userId) {
  try {
    const client = await getRedisClient();
    await client.del(PRESENCE_KEY(userId));
  } catch (_) {
    mem.presence.delete(userId);
  }
}

async function listPresence() {
  try {
    const client = await getRedisClient();
    const users = [];
    let cursor = 0;
    do {
      const res = await client.scan(cursor, { MATCH: 'chat:presence:*', COUNT: 100 });
      cursor = Number(res.cursor || res[0] || 0);
      const keys = res.keys || res[1] || [];
      if (keys.length > 0) {
        const m = client.multi();
        for (const k of keys) m.get(k);
        const vals = await m.exec();
        for (const v of vals) {
          const val = Array.isArray(v) ? v[1] : v;
          if (!val) continue;
          try { const u = JSON.parse(val); if (u && u.userId) users.push(u); } catch (_) {}
        }
      }
    } while (cursor !== 0);
    users.sort((a, b) => (a.userName || '').localeCompare(b.userName || ''));
    return users;
  } catch (_) {
    const now = Date.now();
    const users = [];
    for (const [uid, rec] of mem.presence) {
      if (now - (rec.ts || 0) <= PRESENCE_TTL_SECONDS * 1000) users.push(rec);
    }
    users.sort((a, b) => (a.userName || '').localeCompare(b.userName || ''));
    return users;
  }
}

async function deleteMessage(id) {
  if (!id) return false;
  try {
    const client = await getRedisClient();
    await client.del(MESSAGE_KEY(id));
    // Also remove from list to avoid dangling ids
    await client.lRem(GLOBAL_LIST_KEY, 0, id);
    return true;
  } catch (_) {
    const idx = mem.messages.findIndex(m => m && m.id === id);
    if (idx >= 0) mem.messages.splice(idx, 1);
    return true;
  }
}

module.exports = {
  addMessage,
  getRecentMessages,
  deleteMessage,
  setPresence,
  clearPresence,
  listPresence,
  TTL_SECONDS,
  PRESENCE_TTL_SECONDS
};


