// scripts/chat-discord-bridge.cjs
// Minimal Discord bridge: mirror site messages to a channel; forward Discord messages into site chat

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const store = require('./chat-store.cjs');
const { broadcastFromDiscord } = require('./chat-socket.cjs');

function createDiscordBridge() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !guildId || !channelId) {
    console.log('[bridge] Discord bridge disabled (missing env)', {
      hasToken: !!token,
      hasGuildId: !!guildId,
      hasChannelId: !!channelId
    });
    return { start: () => {}, sendToDiscord: async () => {} };
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  let ready = false;
  client.once('ready', async () => {
    ready = true;
    console.log(`[bridge] Discord bot ready as ${client.user?.tag || client.user?.id || 'bot'}`);
    try {
      const ch = await client.channels.fetch(channelId);
      if (!ch) {
        console.warn('[bridge] target channel not found');
      } else {
        console.log('[bridge] target channel fetched', { id: ch.id, type: ch.type, isText: ch.isTextBased() });
        if (process.env.CHAT_BRIDGE_DEBUG === '1' && ch.isTextBased()) {
          try { await ch.send('Site chat bridge connected.'); console.log('[bridge] sent startup ping'); } catch (e) { console.warn('[bridge] startup ping failed', e?.message || e); }
        }
      }
    } catch (e) {
      console.warn('[bridge] channel fetch failed', e?.message || e);
    }
  });

  client.on('error', (e) => { try { console.warn('[bridge] client error', e?.message || e); } catch(_) {} });
  client.on('warn', (m) => { try { console.warn('[bridge] warn', m); } catch(_) {} });
  client.on('shardError', (e) => { try { console.warn('[bridge] shardError', e?.message || e); } catch(_) {} });

  client.on('messageCreate', async (message) => {
    try {
      if (!ready) return;
      if (!message || message.author?.bot) return; // ignore bots
      if (String(message.channelId) !== String(channelId)) return; // only target channel
      try { console.log('[bridge] inbound from Discord', { author: message.author?.id, contentLen: (message.content || '').length }); } catch(_) {}
      const payload = await store.addMessage({
        userId: String(message.author.id),
        userName: message.author.globalName || message.author.username || 'DiscordUser',
        avatarUrl: message.author.avatar ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png` : null,
        text: String(message.content || ''),
        attachments: (message.attachments && message.attachments.size > 0) ? Array.from(message.attachments.values()).map(a => ({ type: 'image', url: a.url, thumbUrl: a.proxyURL })) : null,
        source: 'discord'
      });
      broadcastFromDiscord(payload);
    } catch (e) {
      try { console.warn('[bridge] messageCreate error', e?.message || e); } catch(_) {}
    }
  });

  // Simple outbound queue with 429 backoff
  const queue = [];
  let sending = false;
  let backoffMs = 0;
  async function processQueue() {
    if (sending) return;
    sending = true;
    try {
      while (queue.length > 0 && ready) {
        if (backoffMs > 0) { await new Promise(r => setTimeout(r, backoffMs)); backoffMs = 0; }
        const payload = queue.shift();
        const ch = await client.channels.fetch(channelId);
        if (!ch || !ch.isTextBased()) continue;
        const textRaw = String(payload && payload.text || '');
        const nameRaw = String((payload && (payload.userName || payload.userId)) || 'User');
        const safeName = nameRaw.replace(/@/g, '@\u200B').replace(/[\`*_~|]/g, '');
        const parts = [`**${safeName}**:${textRaw ? ' ' + textRaw.slice(0, 1800) : ''}`];
        try {
          const atts = Array.isArray(payload && payload.attachments) ? payload.attachments : [];
          atts.forEach(a => { if (a && a.type === 'image' && a.url) parts.push(String(a.url)); });
        } catch (_) {}
        const content = parts.join('\n');
        try {
          await ch.send({ content });
          try { console.log('[bridge] sent to Discord'); } catch(_) {}
        } catch (e) {
          const msg = String(e && e.message || e || '');
          if (msg.includes('ratelimit') || msg.includes('429')) {
            backoffMs = Math.min(5000, backoffMs ? backoffMs * 2 : 1000);
            try { console.warn('[bridge] 429 backoff', backoffMs); } catch(_) {}
            // requeue and delay
            queue.unshift(payload);
          } else {
            try { console.warn('[bridge] sendToDiscord error', msg); } catch(_) {}
          }
        }
      }
    } finally { sending = false; }
  }

  async function start() {
    try {
      console.log('[bridge] logging in...');
      await client.login(token);
      console.log('[bridge] login() resolved');
    } catch (e) {
      console.error('[bridge] login failed', e?.message || e);
    }
    setTimeout(() => { try { console.log('[bridge] ready state after 5s', ready); } catch(_) {} }, 5000);
  }

  async function sendToDiscord(payload) {
    try {
      queue.push(payload);
      processQueue();
    } catch (e) {
      try { console.warn('[bridge] enqueue send error', e?.message || e); } catch(_) {}
    }
  }

  function getStatus() {
    return {
      ready,
      hasToken: !!token,
      hasGuildId: !!guildId,
      hasChannelId: !!channelId,
      guildId: String(guildId || ''),
      channelId: String(channelId || '')
    };
  }

  return { start, sendToDiscord, getStatus };
}

module.exports = { createDiscordBridge };


