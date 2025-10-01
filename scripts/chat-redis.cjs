// scripts/chat-redis.cjs
// Redis client for chat: supports REDIS_URL (redis:// or rediss://)

const { createClient } = require('redis');

function getRedisUrl() {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  return url;
}

let client = null;

async function getRedisClient() {
  if (client && client.isOpen) return client;
  const url = getRedisUrl();
  if (!url) throw new Error('Missing REDIS_URL');
  async function tryConnect(u) {
    const c = createClient({ url: u });
    c.on('error', (err) => { try { console.error('[Redis] Client Error', err && err.message ? err.message : err); } catch (_) {} });
    await c.connect();
    return c;
  }
  try {
    client = await tryConnect(url);
  } catch (e) {
    const msg = (e && e.message ? String(e.message) : '').toLowerCase();
    const isTlsMismatch = msg.includes('wrong version number') || msg.includes('ssl');
    if (isTlsMismatch && url.startsWith('rediss://')) {
      const plain = url.replace(/^rediss:/, 'redis:');
      console.warn('[Redis] TLS connect failed, retrying without TLS');
      client = await tryConnect(plain);
    } else {
      throw e;
    }
  }
  return client;
}

module.exports = { getRedisClient };


