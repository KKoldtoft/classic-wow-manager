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
  async function tryConnect(opts) {
    const c = createClient(opts);
    c.on('error', (err) => { try { console.error('[Redis] Client Error', err && err.message ? err.message : err); } catch (_) {} });
    await c.connect();
    return c;
  }
  try {
    client = await tryConnect({ url });
  } catch (e) {
    const msg = (e && e.message ? String(e.message) : '').toLowerCase();
    const isTlsMismatch = msg.includes('wrong version number') || msg.includes('ssl3_get_record');
    const isSelfSigned = msg.includes('self signed') || msg.includes('self-signed');
    if (isTlsMismatch && url.startsWith('rediss://')) {
      const plain = url.replace(/^rediss:/, 'redis:');
      console.warn('[Redis] TLS connect failed, retrying without TLS');
      client = await tryConnect({ url: plain });
    } else if (isSelfSigned && url.startsWith('rediss://')) {
      if (process.env.REDIS_TLS_INSECURE === '1') {
        console.warn('[Redis] TLS self-signed cert detected; connecting with rejectUnauthorized:false (REDIS_TLS_INSECURE=1)');
        client = await tryConnect({ url, socket: { tls: true, rejectUnauthorized: false } });
      } else {
        console.error('[Redis] TLS self-signed certificate detected. Set REDIS_TLS_INSECURE=1 to allow insecure TLS, or use a valid CA or non-TLS redis:// URL.');
        throw e;
      }
    } else {
      throw e;
    }
  }
  return client;
}

module.exports = { getRedisClient };


