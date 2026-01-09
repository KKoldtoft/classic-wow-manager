// scripts/chat-discord-bridge.cjs
// Minimal Discord bridge: mirror site messages to a channel; forward Discord messages into site chat
// Also tracks voice state for the "Who is not in Discord?" feature

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const store = require('./chat-store.cjs');
const { broadcastFromDiscord } = require('./chat-socket.cjs');

// Global voice state map: channelId -> Map(userId -> { mute, deaf, selfMute, selfDeaf, streaming, video })
const voiceStateMap = new Map();

// Export for use by API endpoints
function getVoiceStateMap() {
  return voiceStateMap;
}

function createDiscordBridge() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const channelId = process.env.DISCORD_CHANNEL_ID; // Optional - only needed for text chat bridge
  
  // Token and guildId are required for voice tracking; channelId only needed for text chat
  if (!token || !guildId) {
    console.log('[bridge] Discord bridge disabled (missing required env)', {
      hasToken: !!token,
      hasGuildId: !!guildId,
      hasChannelId: !!channelId
    });
    return { start: () => {}, sendToDiscord: async () => {}, getVoiceStateMap };
  }
  
  const textChatEnabled = !!channelId;
  console.log('[bridge] Starting Discord bridge', { 
    textChatEnabled, 
    hasChannelId: !!channelId,
    guildId 
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,  // Required for voice state tracking
      GatewayIntentBits.GuildMembers       // Required to have members in cache for voice states
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  let ready = false;
  client.once('ready', async () => {
    ready = true;
    console.log(`[bridge] Discord bot ready as ${client.user?.tag || client.user?.id || 'bot'}`);
    
    // Only fetch text channel if text chat is enabled
    if (textChatEnabled) {
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
    } else {
      console.log('[bridge] Text chat disabled (no DISCORD_CHANNEL_ID), voice tracking only');
    }

    // Initialize voice state from current guild voice channels
    try {
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log('[bridge] Guild not in cache, fetching...');
        try {
          guild = await client.guilds.fetch(guildId);
        } catch (fetchErr) {
          console.warn('[bridge] Failed to fetch guild:', fetchErr?.message || fetchErr);
        }
      }
      
      if (guild) {
        console.log(`[bridge] Guild found: ${guild.name}, voice states in cache: ${guild.voiceStates.cache.size}`);
        
        // Get all voice states from the guild
        guild.voiceStates.cache.forEach((voiceState) => {
          if (voiceState.channelId && voiceState.member) {
            const chId = voiceState.channelId;
            if (!voiceStateMap.has(chId)) {
              voiceStateMap.set(chId, new Map());
            }
            voiceStateMap.get(chId).set(voiceState.member.id, {
              mute: !!voiceState.mute,
              deaf: !!voiceState.deaf,
              selfMute: !!voiceState.selfMute,
              selfDeaf: !!voiceState.selfDeaf,
              streaming: !!voiceState.streaming,
              video: !!voiceState.selfVideo,
              suppress: !!voiceState.suppress
            });
          }
        });
        console.log(`[bridge] Initialized voice state: ${voiceStateMap.size} channels tracked`);
      } else {
        console.warn('[bridge] Guild not found for voice tracking');
      }
    } catch (e) {
      console.warn('[bridge] Failed to initialize voice state:', e?.message || e);
    }
  });

  // Track voice state changes
  client.on('voiceStateUpdate', (oldState, newState) => {
    try {
      const userId = newState.member?.id || oldState.member?.id;
      const userName = newState.member?.user?.username || oldState.member?.user?.username || 'unknown';
      if (!userId) return;

      // User left a channel
      if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
        console.log(`[bridge] Voice: ${userName} (${userId}) left channel ${oldState.channelId}`);
        const oldChannelUsers = voiceStateMap.get(oldState.channelId);
        if (oldChannelUsers) {
          oldChannelUsers.delete(userId);
          if (oldChannelUsers.size === 0) {
            voiceStateMap.delete(oldState.channelId);
          }
        }
      }

      // User joined or updated in a channel
      if (newState.channelId) {
        const isJoin = !oldState.channelId || oldState.channelId !== newState.channelId;
        if (isJoin) {
          console.log(`[bridge] Voice: ${userName} (${userId}) joined channel ${newState.channelId}`);
        }
        if (!voiceStateMap.has(newState.channelId)) {
          voiceStateMap.set(newState.channelId, new Map());
        }
        voiceStateMap.get(newState.channelId).set(userId, {
          mute: !!newState.mute,
          deaf: !!newState.deaf,
          selfMute: !!newState.selfMute,
          selfDeaf: !!newState.selfDeaf,
          streaming: !!newState.streaming,
          video: !!newState.selfVideo,
          suppress: !!newState.suppress
        });
        
        // Log current state of all tracked channels
        console.log(`[bridge] Voice state map now has ${voiceStateMap.size} channels tracked`);
      }
    } catch (e) {
      console.warn('[bridge] voiceStateUpdate error:', e?.message || e);
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
      if (payload) { // null means deduped
        broadcastFromDiscord(payload);
      }
    } catch (e) {
      try { console.warn('[bridge] messageCreate error', e?.message || e); } catch(_) {}
    }
  });

  // Simple outbound queue with 429 backoff
  const queue = [];
  let sending = false;
  let backoffMs = 0;
  async function processQueue() {
    if (sending || !textChatEnabled) return; // Skip if text chat disabled
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

  return { start, sendToDiscord, getStatus, getVoiceStateMap };
}

module.exports = { createDiscordBridge, getVoiceStateMap };


