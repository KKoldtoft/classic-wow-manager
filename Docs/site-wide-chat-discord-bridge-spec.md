### Site-wide Chat Widget with Discord Bridge — Specification

#### Status
- Draft v0.1 (for review)

#### Owners
- Primary: Kim
- Support: Assistant

### 1) Overview
Build a standalone, drop-in chat widget (web component) that provides a single global site-wide chat room, mirrored with a specific Discord channel. The widget mounts as a bottom-right bubble showing the first words of the latest message, expands to a slide-in panel, supports typing indicators, presence, emojis, and image posts, and enforces ephemeral retention.

### 2) Goals
- One global chat room shared across the entire site
- Discord bidirectional mirroring with channel `1145337099806068857`
- Ephemeral messages retained for 4 hours server-side
- Presence list (compact) and typing indicators like Discord/Slack
- Image uploads (≤ 200 KB, GIF allowed) with thumbnails
- Emoji support (standard + Discord custom if feasible)
- Identity from existing site Discord OAuth session; show Discord name and avatar
- Admin can disable chat globally; each user can disable for themselves
- Dark mode UI by default

### 3) Non-goals
- Long-term message history beyond 4 hours
- Threads, reactions, message pinning, or advanced moderation workflows
- Cross-page per-room chats (only a single global room for this phase)

### 4) High-level Architecture
- Client: Standalone web component with Shadow DOM that injects a floating bubble and slide-in panel. No changes to existing site files are required.
- Transport: Socket.IO namespace `/site-chat` with room `global`.
- State: Redis for ephemeral message storage and presence; Socket.IO Redis adapter for scale.
- Discord bridge: `discord.js` bot subscribes to Gateway events for the target channel and forwards messages/edits/deletes/attachments; outbound site messages are queued and sent via the bot respecting Discord rate limits.
- Media: Cloudinary for uploads; thumbnails rendered in chat; click to open full size.
- Security: DOMPurify + linkify; rate limiting “same rules as Discord” at minimum.

### 5) UX Specification
- Bubble: bottom-right, attached to the right screen edge; shows an “open” icon and the beginning of the latest message (updates live).
- Panel: slides in from the right; dark theme; message list with autoscroll; input at bottom; emoji picker; image upload button.
- Unread: single-tab usage assumed; show a small unread badge on the bubble. Badge clears when the panel opens or when scrolled to bottom.
- Presence: small list of online users at the top of the panel as compact green “online” badges (avatar or initials as appropriate).
- Typing: “A, B, and N others are typing…” message near the input with a 3–5s idle timeout.
- Offline state: when backend/Discord unavailable, the bubble and panel appear gray at 50% opacity with an “Offline” badge overlay; interaction disabled except for a retry action.
 - Message rendering (avatars): each row shows sender avatar (24px round) + display name + message text. Avatar URL comes from `whoAmI` for site senders and from Discord for mirrored messages. Fallback image: `https://cdn.discordapp.com/embed/avatars/0.png`.
 - Presence badges (header): show up to 6 small round avatars (16px) with `+N` overflow indicator.
 - Typing indicators: inline text above the input; show single/multiple names with 3s idle timeout.
 - Emoji: include a small emoji button (dark theme picker). Use `emoji-button` CDN; on select, insert at cursor into the input. Twemoji rendering optional.

### 6) Identity & Permissions
- Identity source: existing site Discord OAuth session (no extra Discord API calls needed beyond your existing auth).
- Display: Discord username/global name and avatar. No site alias.
- Access: login required to view and post.
- Roles: users with “management” role can delete messages. Everyone else equal.

### 7) Discord Mirroring
- Channel: `1145337099806068857` (single channel, two-way mirroring).
- Inbound (Discord → Site): Use Gateway `messageCreate`, `messageUpdate`, `messageDelete` and attachment events; map to site message model and broadcast to `/site-chat:global`.
- Outbound (Site → Discord): Send via bot client (or webhook if needed) with a per-channel queued sender that respects Discord’s rate limits.
- Edits/deletes: Mirror both ways. A management delete on the site deletes on the site only (by default); Discord-side deletes mirror to site.
- De-duplication: Maintain an ID map between Discord message IDs and site message IDs (Redis with a 4-hour TTL) so mirrored messages are not re-broadcast back across the bridge.
- Outbound format: prefix with sender name (sanitized, no pings), e.g., `**Kim**: hello`. Optional: webhook posting with per-message `username` and `avatar_url` to appear as the user (see §34).

### 8) Message Model & Retention
- Text: Discord-flavored Markdown (same rules as Discord) including bold/italic/underline/strikethrough, inline/code blocks, quotes, spoilers, and links; all content sanitized with DOMPurify; URLs are linkified.
- Attachments: images only in this phase; thumbnails in chat, click for full.
- Emojis: standard emoji via Twemoji; attempt to render Discord custom emojis when feasible.
- Ephemeral retention: server keeps only the last 4 hours; clients on join receive up to the last 4 hours. All mirrored ID maps share the same TTL.

### 9) Media & Emoji
- Uploads: Cloudinary; enforce `≤ 200 KB`, allow GIF.
- Thumbnails: Cloudinary transformation for list view; full-size on click opens in new tab or lightbox.
- Emoji picker: `emoji-picker-element` (web component); emoji rendering via Twemoji.
- Custom emojis: Resolve via Discord CDN. No fallback to `:name:` text; show a missing-emoji placeholder if fetch fails.

### 10) Realtime Transport & Presence
- Socket.IO namespace `/site-chat`; room `global`.
- Presence: heartbeat per connection with a 30s Redis key TTL; compact online badges rendered in UI.
- Typing indicators: `typing:start` and `typing:stop` events debounced; UI collapses multiple typers.
- Client handshake auth: widget calls `whoAmI` and passes `{ userId, userName, avatarUrl }` in Socket.IO `auth` during connection; server uses this identity. Avoid client optimistic render; rely on `message:new` broadcast to prevent duplicates.

### 11) Events (contract)
- `message:new` { id, userId, userName, avatarUrl, text|attachments[], createdAt, source: "site"|"discord" }
- `message:edit` { id, text }
- `message:delete` { id, reason?, deletedBy }
- `typing:start` { userId }
- `typing:stop` { userId }
- `presence:update` { usersOnline: [{ userId, userName, avatarUrl }] }
- `admin:state` { enabled: boolean } // broadcast when admin toggles chat on/off
- Client → Server send: `chat:message` { text } (avoid reserved `message`)

### 12) Admin & User Preferences
- Admin global toggle: an API endpoint exposes `{ enabled: boolean }`. If disabled, widget shows Offline state.
- User preference: per-user disable stored server-side; widget hides itself when `userDisabled === true`.

### 13) Rate Limiting, Anti-spam, Safety
- Inbound (Discord → Site): Gateway events only; no REST polling.
- Outbound (Site → Discord): per-channel queued sender that respects Discord route buckets; exponential backoff on 429; max backlog 50 messages per channel; overflow returns a client-visible "channel is in slow mode, please retry" notice.
- Per-user chat rate limits (site): enforce 5 messages per 5 seconds per user; image messages count as 2 units; hard-reject oversize images (> 200 KB) with guidance.
- Sanitization: DOMPurify + linkify; link unfurling disabled.

### 14) Observability
- Minimal metrics: message counts, error counts, queue depth; no payload logging beyond the 4-hour TTL window.
- Client error reporting: lightweight endpoint for widget errors (non-PII).

### 15) Embed & Initialization
- Packaging: single self-contained script served from your app (or CDN).
- Two initialization options (selected: Explicit init):
  - Explicit init (SELECTED): include the script, then call `window.SiteChat.init({...})` when you want it to appear. Provides precise timing control (e.g., defer until identity or config is ready).
  - Auto-init (alternative): include `<script src="/widget/site-chat.js" data-env="prod" ...></script>` and the widget mounts itself immediately.
  - Selection for this project: Explicit init.

#### 15.1 Embed contract (Explicit init)
- Include script (example path):
  - `<script src="/widget/site-chat.js" defer></script>`
- Initialize when ready (after your app knows the user is logged in):
  - `window.SiteChat.init({
      env: "prod",
      discordChannelId: "1145337099806068857",
      ttlHours: 4,
      theme: "dark",
      position: "bottom-right",
      presenceEnabled: true,
      typingIndicators: true,
      maxUploadKB: 200,
      allowGif: true,
      linkUnfurl: false,
      endpoints: {
        whoAmI: "/api/auth/whoami",
        chatSocketUrl: "/socket.io",
        uploadUrl: "/api/chat/upload",
        adminStateUrl: "/api/chat/config",
        userPrefsUrl: "/api/chat/prefs"
      }
    });`

Option notes:
- `env`: string label for environment.
- `discordChannelId`: fixed channel mirrored both ways.
- `ttlHours`: message retention window (server-enforced).
- `theme`, `position`: UI preferences (dark, bottom-right).
- `presenceEnabled`, `typingIndicators`: toggles for presence and typing UX.
- `maxUploadKB`, `allowGif`: media constraints; oversize is hard-rejected.
- `linkUnfurl`: keep disabled.
- `endpoints.whoAmI`: returns `{ userId, userName, avatarUrl, roles }` from existing session.
- `endpoints.chatSocketUrl`: Socket.IO endpoint path.
- `endpoints.uploadUrl`: Cloudinary-signed upload endpoint on your server.
- `endpoints.adminStateUrl`: returns `{ enabled, userDisabled }` and accepts `{ enabled }` (management only).
- `endpoints.userPrefsUrl`: sets `{ enabled: boolean }` per user.

Config options (proposed defaults):
- env: `"prod"`
- discordChannelId: `"1145337099806068857"`
- ttlHours: `4`
- theme: `"dark"`
- position: `"bottom-right"`
- presenceEnabled: `true`
- typingIndicators: `true`
- maxUploadKB: `200`
- allowGif: `true`
- linkUnfurl: `false`
- endpoints: `{ whoAmI, chatSocketUrl, uploadUrl, adminStateUrl, userPrefsUrl }`

### 16) Security & Privacy
- Auth: widget reads identity from a `whoAmI` endpoint (Discord user id, name, avatar, roles) using the existing session cookie.
- CSRF: standard CSRF/token strategy for REST endpoints; Socket.IO uses session auth or signed token.
- Privacy: transient server logs and message storage limited to 4 hours; no long-term retention.

---

### Open Questions
- None at this time. Initialization method resolved: Explicit init.

### Notes
- Concurrency target: 50–100 concurrent users; Redis adapter recommended if horizontally scaled.
- No separate Discord staging channel by request; consider a feature flag to disable widget during testing.

### 31) Integration Notes (as-built)
- Routing/Spa catch-all: Ensure catch-all does NOT swallow API, `/healthz`, `/socket.io`, or asset paths with a dot. Example: let `req.path.includes('.')` pass through to `express.static`.
- Widget script route: Provide an explicit route for `/widget/site-chat.js` to guarantee JS is served even with a SPA catch-all.
- Health endpoint: `/healthz` returns `{ ok, dbMs, discordConfigured, redisConfigured }` and must not be captured by the SPA route.
- Redis configuration: use `REDIS_URL`; production must use TLS (`rediss://`). Socket.IO adapter connects using this URL.
 - Frontend auto-load: `top-bar.js` conditionally loads Socket.IO client CDN and `/widget/site-chat.js`, then calls `window.SiteChat.init({...})` when the user is logged in and `/api/chat/config` reports enabled.

### 32) Setup Checklist (deploy)
1. Env vars: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID`, `REDIS_URL` (TLS in prod), `NODE_ENV`.
2. Dependencies installed: `socket.io`, `@socket.io/redis-adapter`, `redis`, `discord.js`.
3. Discord Developer Portal → Bot:
   - Toggle ON “Message Content Intent”; Save Changes.
   - Ensure bot role/channel overrides permit View, Send, Read History, Attach Files in the target channel.
4. Server logs (expected):
   - “✅ Site chat Socket.IO initialized”
   - “✅ Discord bridge initialized”
   - “[bridge] Discord bot ready …” (and optionally channel fetched)
5. Client logs (expected):
   - `[SiteChat] whoAmI { … }`
   - `[SiteChat] connected <id>`

### 33) Troubleshooting
- Invalid namespace: connect client to default namespace or register `/site-chat` on server.
- Script path returns HTML: adjust SPA catch-all; add explicit `/widget/site-chat.js` route.
- Redis WRONGPASS/TLS errors: verify credentials and scheme; test with `redis-cli`. Use non‑TLS locally if needed.
- “Used disallowed intents”: enable and save Message Content intent; restart server.
- No Discord posts: confirm logs “[bridge] outbound to Discord … / sent to Discord” and that the bot has Send permission; verify `DISCORD_CHANNEL_ID` correctness.

### 34) Outbound via Webhook (optional — post as user)
- Purpose: Have Discord messages appear with the sender’s display name and avatar (without creating per-user bots). Uses a channel webhook; we set `username` and `avatar_url` per message.
- When to use: Aesthetics/identity parity with the site. Not required for functionality.
- Setup:
  1. Create a Discord webhook in the target channel and copy its URL.
  2. Store it securely (options):
     - Env var `DISCORD_WEBHOOK_URL` (single-channel setup), or
     - Per-channel storage (e.g., DB table), configured in admin UI.
  3. Keep the existing bot for inbound mirroring (Discord → site). Webhook is only for outbound.
- Send semantics:
  - Payload `{ content, username, avatar_url }` (attachments by URL are supported; large uploads still go through Cloudinary).
  - `username`: use the site/Discord display name; sanitize `@` and formatting characters to avoid pings/injection.
  - `avatar_url`: Discord CDN avatar when available; otherwise site-provided fallback.
  - Length caps: constrain `content` to ~1800 chars to stay under Discord’s limits after prefixing.
- Rate limiting & reliability:
  - Queue per webhook URL with the same backoff policy as bot posting (route-bucket aware where possible; exponential backoff on 429; small bounded backlog).
  - If webhook returns 401/404, fall back to bot posting and log a warning.
- Loop prevention:
  - Ignore inbound messages with `message.webhookId === <our_webhook_id>` when mirroring Discord → site to avoid echo.
  - Maintain the existing Discord↔site ID map (4h TTL) to dedupe updates/deletes.
- Security:
  - Strip/escape `@` (zero-width joiner after @) and formatting chars in `username`.
  - Continue sanitizing `content` on the site before sending.
- Configuration notes:
  - Webhook sending does not require Message Content intent; inbound mirroring still does.
  - Prefer per-channel webhooks if you plan to expand to multiple rooms later.
- Admin UX (optional):
  - Admin page field for webhook URL (validated); server stores per-channel URL.
  - Toggle to prefer webhook for outbound; fallback to bot when empty.


### 17) Discord Bot Details
- Scopes/Intents: Bot with MESSAGE_CONTENT, GUILD_MESSAGES, GUILD_MESSAGE_REACTIONS, GUILD_MEMBERS (if presence needed), GUILDS.
- Rate limits: Respect Discord route buckets; per-channel queue with max backlog 50; exponential backoff (base 1s, max 30s) with jitter on 429.
- Error handling: Retry 5xx up to 3 times; circuit-breaker trip after sustained 429s (e.g., > 20 within 60s) with 60s cool-off.
- Logging: Log 429/5xx counts (no payloads) and queue depth.

### 18) Socket Transport
- Reconnect: exponential backoff (initial 500ms, max 10s, jitter).
- Heartbeats: pingInterval 25s, pingTimeout 20s.
- Auth: session cookie or signed JWT on connection; CORS allowlist = site origin only.
- Scaling: Socket.IO Redis adapter; require sticky sessions on Heroku when horizontally scaled.
 - Namespace and auth: client connects to default namespace ("/") with `auth` payload from `whoAmI`. Alternatively register handlers for both default and `/site-chat` to avoid “Invalid namespace”.

### 19) Redis Schema
- Keys:
  - `chat:global:list` (Redis list of message ids, capped)
  - `chat:msg:{id}` (hash for message payload), TTL = 4h
  - `chat:mirror:{discordId}` ↔ `{siteId}` (string), TTL = 4h
  - `chat:presence:{userId}` (string with timestamp), TTL = 30s
- Caps/eviction: cap `chat:global:list` to last N (e.g., 1000) and trim on push.
 - TLS guidance: Use `rediss://` in production. For local dev, if OpenSSL errors ("wrong version number"), try non‑TLS `redis://` with the same credentials. Verify with `redis-cli -u <REDIS_URL> ping`.

### 20) Message Contract & Versioning
- Add `schemaVersion` (start at 1) and `source` (`"site"|"discord"`).
- Forward compatibility: clients ignore unknown fields; server validates required fields only.

### 21) Security & CSP
- CSP updates to allow: WebSocket to site origin, images from Cloudinary and Discord CDN, script for widget URL.
- Server validation: image type whitelist (jpg/png/gif), size ≤ 200 KB; EXIF stripped via Cloudinary.
- Sanitization: DOMPurify config locked; linkify allows http/https only; no data URLs.

### 22) Privacy
- Data processed: usernames, avatars, message content, attachments (4h max), presence state.
- Retention: 4 hours; no backups; logs store counts only (no content).
- Preferences: per-user disable stored with user id.

### 23) Accessibility (a11y)
- Keyboard: focus trap in panel, ESC to close, Enter to send, Shift+Enter newline.
- ARIA: roles for log (messages), button (bubble), status (typing), list (presence).
- Contrast: meet WCAG AA in dark theme; reduced motion option.

### 24) Performance
- Bundle budget ≤ 80 KB gz; lazy-load emoji picker; defer Cloudinary SDK until first upload.
- Network: one WebSocket; uploads use HTTPS with timeout and retries.

### 25) Error UX
- Send failure: show inline retry with reason (rate limit/offline/size exceeded).
- Upload failure: show size/type guidance; oversize hard-reject.
- Offline: gray 50% + badge; auto-retry connect with backoff.

### 26) Observability
- Metrics: messages sent/received per minute, 429 count, queue depth, socket connect failures.
- Alerts: notify at sustained 429s or queue depth > 40 for > 2 minutes.

### 27) Testing & Load
- E2E: typing indicators, presence, image upload, discord mirror in/out, delete/edit.
- Load: simulate 100 concurrents for 10 minutes; ensure p95 send→receive < 500 ms on LAN.
- Chaos: simulate Discord Gateway disconnect; verify graceful degradation and recovery.

### 28) Rollout
- Feature flag: admin toggle is the kill switch; widget respects `{ enabled:false }` immediately.
- Versioning: cache-busted script URL `/widget/site-chat.js?v=X.Y.Z`; support rollback.

### 29) Browser Support
- Modern Chromium, Firefox, Safari (last 2). If unsupported (no Shadow DOM), hide bubble and log a warning.

### 30) Branding & Legal
- Follow Discord branding guidelines for avatars/emojis; display a short note: “Messages are ephemeral (4h).”


