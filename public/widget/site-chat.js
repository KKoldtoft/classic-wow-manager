(() => {
  if (window.SiteChat) return;
  window.SiteChat = {
    init: async function init(options) {
      const WIDGET_VERSION = '2025-10-01-2';
      console.log('[SiteChat] init called', options, 'version=', WIDGET_VERSION);
      const cfg = options || {};

      // Bubble
      const bubble = document.createElement('div');
      bubble.id = 'site-chat-bubble';
      bubble.style.position = 'fixed';
      bubble.style.right = '16px';
      bubble.style.bottom = '16px';
      bubble.style.zIndex = '2147483000';
      bubble.style.width = '56px';
      bubble.style.height = '56px';
      bubble.style.borderRadius = '28px';
      bubble.style.background = '#1f2937';
      bubble.style.color = '#fff';
      bubble.style.display = 'flex';
      bubble.style.alignItems = 'center';
      bubble.style.justifyContent = 'center';
      bubble.style.boxShadow = '0 6px 24px rgba(0,0,0,0.35)';
      bubble.style.cursor = 'pointer';
      bubble.textContent = '💬';
      document.body.appendChild(bubble);
      // Prevent drag events on the bubble from triggering click/toggle
      const swallow = (e)=>{ try { e.preventDefault(); e.stopPropagation(); } catch(_){} };
      bubble.addEventListener('dragenter', swallow, true);
      bubble.addEventListener('dragover', swallow, true);
      bubble.addEventListener('drop', swallow, true);

      // Panel
      const panel = document.createElement('div');
      panel.id = 'site-chat-panel';
      panel.style.position = 'fixed';
      panel.style.top = '0';
      panel.style.right = '-360px';
      panel.style.width = '360px';
      panel.style.height = '100vh';
      panel.style.background = '#0b1220';
      panel.style.color = '#e5e7eb';
      panel.style.boxShadow = '0 0 24px rgba(0,0,0,0.45)';
      panel.style.zIndex = '2147483001';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.transition = 'right 200ms ease';

      const header = document.createElement('div');
      header.style.padding = '10px 12px';
      header.style.fontWeight = '600';
      header.style.borderBottom = '1px solid #1f2937';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      const title = document.createElement('div');
      title.textContent = 'Barrens chat (Beta)';
      const presenceWrap = document.createElement('div');
      presenceWrap.style.display = 'flex';
      presenceWrap.style.alignItems = 'center';
      presenceWrap.style.gap = '6px';
      header.appendChild(title);
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.marginLeft = '8px';
      closeBtn.style.background = 'transparent';
      closeBtn.style.border = 'none';
      closeBtn.style.color = '#9ca3af';
      closeBtn.style.fontSize = '18px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.title = 'Close chat';
      const rightWrap = document.createElement('div');
      rightWrap.style.display = 'flex';
      rightWrap.style.alignItems = 'center';
      rightWrap.style.gap = '8px';
      rightWrap.appendChild(presenceWrap);
      rightWrap.appendChild(closeBtn);
      header.appendChild(rightWrap);

      const messages = document.createElement('div');
      messages.style.flex = '1';
      messages.style.overflow = 'auto';
      messages.style.padding = '8px 10px';
      messages.classList.add('sc-hide-scrollbars');

      const inputWrap = document.createElement('div');
      inputWrap.style.display = 'flex';
      inputWrap.style.gap = '8px';
      inputWrap.style.padding = '8px 10px';
      inputWrap.style.borderTop = '1px solid #1f2937';
      inputWrap.style.marginBottom = '12px';
      inputWrap.style.flexDirection = 'column';
      const typingEl = document.createElement('div');
      typingEl.style.fontSize = '12px';
      typingEl.style.color = '#9ca3af';
      typingEl.style.minHeight = '16px';
      typingEl.style.padding = '0 2px 4px 2px';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Type a message...';
      input.style.flex = '1';
      input.style.padding = '8px 10px';
      input.style.borderRadius = '8px';
      input.style.border = '1px solid #374151';
      const emojiBtn = document.createElement('button');
      emojiBtn.type = 'button';
      emojiBtn.textContent = '😀';
      emojiBtn.style.padding = '8px 10px';
      emojiBtn.style.background = '#0b1220';
      emojiBtn.style.color = '#fff';
      emojiBtn.style.border = '1px solid #374151';
      emojiBtn.style.borderRadius = '8px';
      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      sendBtn.style.padding = '8px 10px';
      sendBtn.style.background = '#2563eb';
      sendBtn.style.color = '#fff';
      sendBtn.style.border = 'none';
      sendBtn.style.borderRadius = '8px';
      const inputRow = document.createElement('div');
      inputRow.style.display = 'flex';
      inputRow.style.gap = '8px';
      inputRow.appendChild(emojiBtn);
      inputRow.appendChild(input);
      inputRow.appendChild(sendBtn);
      inputWrap.appendChild(typingEl);
      inputWrap.appendChild(inputRow);

      panel.appendChild(header);
      panel.appendChild(messages);
      // Dedicated drop zone (always visible) for drag & drop uploads
      const dropZone = document.createElement('div');
      dropZone.style.margin = '6px 10px';
      dropZone.style.border = '1px dashed #374151';
      dropZone.style.borderRadius = '8px';
      dropZone.style.color = '#9ca3af';
      dropZone.style.fontSize = '12px';
      dropZone.style.textAlign = 'center';
      dropZone.style.padding = '8px';
      dropZone.style.cursor = 'pointer';
      dropZone.textContent = 'Drop image here (or paste). Max 200 KB.';
      const dzActive = ()=>{ dropZone.style.background = 'rgba(37,99,235,0.08)'; dropZone.style.color = '#93c5fd'; };
      const dzIdle = ()=>{ dropZone.style.background = 'transparent'; dropZone.style.color = '#9ca3af'; };
      dzIdle();
      dropZone.addEventListener('dragenter', (e)=>{ e.preventDefault(); e.stopPropagation(); dzActive(); });
      dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); e.stopPropagation(); dzActive(); });
      dropZone.addEventListener('dragleave', (e)=>{ e.preventDefault(); e.stopPropagation(); dzIdle(); });
      dropZone.addEventListener('drop', (e)=>{ e.preventDefault(); e.stopPropagation(); dzIdle(); try { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) uploadFile(f); } catch(_){} });
      // Click-to-upload via hidden file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', (e)=>{ try { const f = e.target && e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value=''; } catch(_){} });
      dropZone.addEventListener('click', ()=>{ try { fileInput.click(); } catch(_){} });
      panel.appendChild(dropZone);
      panel.appendChild(fileInput);
      panel.appendChild(inputWrap);
      document.body.appendChild(panel);

      // Global DnD guards to prevent browser from navigating away on drop (disabled)
      let globalDnDGuardsAttached = false;
      // No-op guards
      function addGlobalDnDGuards() { return; }
      function removeGlobalDnDGuards() { return; }

      const PANEL_WIDTH = 360; // px
      const BUBBLE_MARGIN = 16; // px

      // Inject styles for animations
      (function ensureSiteChatStyles(){
        // Remove any existing site-chat style tags to avoid stale CSS
        try { Array.from(document.querySelectorAll('style[id^="site-chat-styles"]')).forEach(n=>{ n.parentNode && n.parentNode.removeChild(n); }); } catch(_){}
        const st = document.createElement('style');
        st.id = `site-chat-styles-${WIDGET_VERSION}`;
        st.textContent = `
        @keyframes sc-bubble-pulse { 0%{transform:scale(1)} 50%{transform:scale(1.06)} 100%{transform:scale(1)} }
        @keyframes sc-msg-in { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform: translateY(0);} }
        @keyframes sc-glow-pulse { 0%{ box-shadow: 0 0 0 rgba(99,102,241,0);} 50%{ box-shadow: 0 0 18px rgba(99,102,241,0.25);} 100%{ box-shadow: 0 0 0 rgba(99,102,241,0);} }
        .sc-pulse { animation: sc-bubble-pulse 320ms ease; }
        .sc-msg-in { animation: sc-msg-in 180ms ease-out; }
        .sc-hide-scrollbars { scrollbar-width: none; -ms-overflow-style: none; }
        .sc-hide-scrollbars::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
        .sc-glow { animation: sc-glow-pulse 1.6s ease-in-out infinite; }
        .sc-row { display:flex; align-items:flex-end; gap:8px; margin:6px 0; }
        .sc-row.mine { justify-content:flex-end; }
        .sc-row.theirs { justify-content:flex-start; }
        .sc-bubble { max-width:72%; padding:8px 12px; border-radius:14px; word-break: break-word; }
        .sc-bubble.mine { background:#5865F2; color:#fff; }
        .sc-bubble.theirs { background:#111827; color:#e5e7eb; }
        .sc-avatar { width:24px; height:24px; border-radius:50%; flex:0 0 24px; }
        `;
        document.head.appendChild(st);
      })();

      // Create a container for bubble to allow out-of-circle badge positioning
      const bubbleContainer = document.createElement('div');
      bubbleContainer.style.position = 'fixed';
      bubbleContainer.style.right = `${BUBBLE_MARGIN}px`;
      bubbleContainer.style.bottom = `${BUBBLE_MARGIN}px`;
      bubbleContainer.style.zIndex = '2147483000';
      document.body.appendChild(bubbleContainer);

      // Re-append bubble inside container
      try { document.body.removeChild(bubble); } catch(_){}
      bubbleContainer.appendChild(bubble);

      // Bubble content: label + badge
      bubble.style.position = 'relative';
      bubble.style.overflow = 'hidden';
      bubble.style.whiteSpace = 'nowrap';
      bubble.style.maxWidth = '260px';
      bubble.style.padding = '0 14px';
      bubble.style.border = '1px solid #111827';
      bubble.style.boxSizing = 'border-box';
      bubble.style.transition = 'transform 160ms ease, background-color 160ms ease';

      // Clear any existing text to avoid double icons
      bubble.textContent = '';
      const bubbleLabel = document.createElement('span');
      bubbleLabel.style.display = 'inline-block';
      bubbleLabel.style.fontSize = '27px';
      bubbleLabel.style.lineHeight = '56px';
      // remove truncation to allow full glyph rendering
      bubbleLabel.style.overflow = 'visible';
      bubbleLabel.textContent = '💬';
      const bubbleBadge = document.createElement('span');
      bubbleBadge.style.position = 'absolute';
      bubbleBadge.style.top = '-17px';
      bubbleBadge.style.right = '12px';
      bubbleBadge.style.minWidth = '18px';
      bubbleBadge.style.height = '18px';
      bubbleBadge.style.borderRadius = '9px';
      bubbleBadge.style.background = 'linear-gradient(180deg,#ef4444,#dc2626)';
      bubbleBadge.style.color = '#fff';
      bubbleBadge.style.fontSize = '11px';
      bubbleBadge.style.display = 'flex';
      bubbleBadge.style.alignItems = 'center';
      bubbleBadge.style.justifyContent = 'center';
      bubbleBadge.style.padding = '0 4px';
      bubbleBadge.style.boxShadow = '0 0 0 2px #0b1220';
      bubbleBadge.style.visibility = 'hidden';
      bubbleBadge.style.zIndex = '2147483002';
      bubble.appendChild(bubbleLabel);
      // place badge outside bubble by attaching to container
      bubbleContainer.appendChild(bubbleBadge);

      // External snippet pill
      const bubbleSnippet = document.createElement('div');
      bubbleSnippet.style.position = 'fixed';
      bubbleSnippet.style.bottom = `${BUBBLE_MARGIN}px`;
      bubbleSnippet.style.right = `${56 + 12 + BUBBLE_MARGIN}px`;
      bubbleSnippet.style.maxWidth = '260px';
      bubbleSnippet.style.background = '#0b1220';
      bubbleSnippet.style.border = '1px solid #111827';
      bubbleSnippet.style.borderRadius = '9999px';
      bubbleSnippet.style.color = '#e5e7eb';
      bubbleSnippet.style.fontSize = '13px';
      bubbleSnippet.style.padding = '8px 12px';
      bubbleSnippet.style.boxShadow = '0 6px 24px rgba(0,0,0,0.35)';
      bubbleSnippet.style.display = 'none';
      bubbleSnippet.style.pointerEvents = 'none';
      document.body.appendChild(bubbleSnippet);

      let unreadCount = 0;
      let lastSnippet = '';

      function saveUnread(val) { try { localStorage.setItem('siteChatUnread', String(val)); } catch(_){} }
      function loadUnread() { try { const v = parseInt(localStorage.getItem('siteChatUnread') || '0', 10); return Number.isFinite(v) ? v : 0; } catch(_) { return 0; } }
      function saveSnippet(val) { try { localStorage.setItem('siteChatSnippet', String(val || '')); } catch(_){} }
      function loadSnippet() { try { return localStorage.getItem('siteChatSnippet') || ''; } catch(_) { return ''; } }

      function setBadge(val) {
        try {
          if (val > 0) { bubbleBadge.textContent = String(val); bubbleBadge.style.visibility = 'visible'; }
          else { bubbleBadge.style.visibility = 'hidden'; }
        } catch(_){}
      }

      function setBubbleOpenVisual() {
        try {
          bubbleLabel.textContent = '×';
          bubble.title = 'Close chat';
          bubble.style.background = '#374151';
          bubbleContainer.style.right = `${PANEL_WIDTH + BUBBLE_MARGIN}px`;
          setBadge(0);
          bubbleSnippet.style.display = 'none';
          bubble.classList.remove('sc-glow');
        } catch (_) {}
      }
      function setBubbleClosedVisual() {
        try {
          bubbleLabel.textContent = '💬';
          bubble.title = 'Open chat';
          bubble.style.background = '#1f2937';
          bubbleContainer.style.right = `${BUBBLE_MARGIN}px`;
          setBadge(unreadCount);
          bubbleSnippet.style.right = `${56 + 12 + BUBBLE_MARGIN}px`;
          if (unreadCount > 0) bubble.classList.add('sc-glow'); else bubble.classList.remove('sc-glow');
        } catch (_) {}
      }

      function saveOpenState(val) { try { localStorage.setItem('siteChatIsOpen', val ? '1' : '0'); } catch(_){} }
      function loadOpenState() { try { return localStorage.getItem('siteChatIsOpen') === '1'; } catch(_) { return false; } }

      function openPanel() { open = true; panel.style.right = '0'; setBubbleOpenVisual(); saveOpenState(true); }
      function closePanel() { open = false; panel.style.right = `-${PANEL_WIDTH}px`; setBubbleClosedVisual(); saveOpenState(false); }
      let open = false;
      let isDragging = false;
      let lastDropAt = 0;
      // Track dragging globally (no-op state only)
      window.addEventListener('dragenter', () => { isDragging = true; }, true);
      window.addEventListener('dragend', () => { isDragging = false; }, true);
      window.addEventListener('drop', () => { isDragging = false; lastDropAt = Date.now(); }, true);
      const ignoreIfDragging = () => { if (isDragging || (Date.now() - lastDropAt < 800)) return true; return false; };
      bubble.addEventListener('click', () => { if (ignoreIfDragging()) return; if (open) closePanel(); else { unreadCount = 0; saveUnread(0); saveSnippet(''); openPanel(); } });
      closeBtn.addEventListener('click', () => { closePanel(); });

      // Apply initial state
      if (loadOpenState()) { openPanel(); } else { closePanel(); }
      // Load unread/snippet
      try {
        unreadCount = loadUnread();
        lastSnippet = loadSnippet();
        if (!open) {
          setBadge(unreadCount);
          if (unreadCount > 0) bubble.classList.add('sc-glow');
          if (lastSnippet) { bubbleSnippet.textContent = lastSnippet; bubbleSnippet.style.display = 'block'; }
        }
      } catch(_){}

      function animateBubblePulse() {
        try {
          bubble.classList.remove('sc-pulse');
          // reflow to restart animation
          // eslint-disable-next-line no-unused-expressions
          void bubble.offsetWidth;
          bubble.classList.add('sc-pulse');
        } catch(_){}
      }
      function showSnippetPill(text) {
        try {
          bubbleSnippet.textContent = text;
          bubbleSnippet.style.display = 'block';
          // hide on hover instead of timeout
          const hide = ()=>{ try { bubbleSnippet.style.display = 'none'; bubbleSnippet.removeEventListener('mouseenter', hide); } catch(_){} };
          bubbleSnippet.removeEventListener('mouseenter', hide);
          bubbleSnippet.addEventListener('mouseenter', hide);
        } catch(_){}
      }

      // Resolve identity for handshake auth
      let auth = {};
      try {
        if (cfg.endpoints && cfg.endpoints.whoAmI) {
          const r = await fetch(cfg.endpoints.whoAmI, { credentials: 'include' });
          const j = r.ok ? await r.json() : null;
          if (j && j.ok !== false && j.userId) {
            auth = { userId: j.userId, userName: j.userName, avatarUrl: j.avatarUrl };
          }
          try { console.log('[SiteChat] whoAmI', auth); } catch (_) {}
        }
      } catch (_) {}

      // Socket connection (default namespace)
      const socket = io({
        path: '/socket.io',
        transports: ['websocket'],
        auth
      });

      socket.on('connect', () => { try { console.log('[SiteChat] connected', socket.id); } catch (_) {} });
      socket.on('connect_error', (err) => { try { console.warn('[SiteChat] connect_error', err && (err.message || err)); } catch (_) {} });
      socket.on('disconnect', (reason) => { try { console.log('[SiteChat] disconnected', reason); } catch (_) {} });
      // presence heartbeat to keep presence stable
      try {
        setInterval(() => { try { socket.emit('presence:heartbeat'); } catch(_){} }, 25000);
      } catch(_){}
      function renderMessageRow(msg) {
        const isMine = msg && auth && String(msg.userId || '') === String(auth.userId || '');
        const row = document.createElement('div');
        row.className = `sc-row ${isMine ? 'mine' : 'theirs'} sc-msg-in`;
        if (msg && msg.id) { try { row.setAttribute('data-id', String(msg.id)); } catch(_){} }
        const avatarUrl = (msg && msg.avatarUrl) ? String(msg.avatarUrl) : 'https://cdn.discordapp.com/embed/avatars/0.png';
        const avatar = document.createElement('img');
        avatar.src = avatarUrl;
        avatar.alt = (msg && msg.userName) ? `${msg.userName}'s avatar` : 'avatar';
        avatar.className = 'sc-avatar';

        const bubbleBox = document.createElement('div');
        bubbleBox.className = `sc-bubble ${isMine ? 'mine' : 'theirs'}`;

        const nameEl = document.createElement('div');
        nameEl.textContent = String((msg && msg.userName) || 'User');
        nameEl.style.fontWeight = '600';
        nameEl.style.fontSize = '11px';
        nameEl.style.opacity = isMine ? '0.85' : '0.7';
        const textEl = document.createElement('div');
        textEl.textContent = String((msg && msg.text) || '');
        textEl.style.fontSize = '13px';
        bubbleBox.appendChild(nameEl);
        bubbleBox.appendChild(textEl);

        // attachments: images inside bubble
        try {
          const atts = Array.isArray(msg && msg.attachments) ? msg.attachments : [];
          atts.forEach(a => {
            if (!a || a.type !== 'image' || !a.url) return;
            const img = document.createElement('img');
            img.src = a.thumbUrl || a.url;
            img.alt = 'attachment';
            img.style.display = 'block';
            img.style.maxWidth = '220px';
            img.style.borderRadius = '8px';
            img.style.marginTop = '6px';
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => { try { window.open(a.url, '_blank', 'noopener'); } catch(_) {} });
            bubbleBox.appendChild(img);
          });
        } catch(_){}

        if (isMine) {
          // mine: bubble then avatar (right)
          row.appendChild(bubbleBox);
          row.appendChild(avatar);
        } else {
          // theirs: avatar then bubble (left)
          row.appendChild(avatar);
          row.appendChild(bubbleBox);
        }
        return row;
      }

      socket.on('history', (data) => {
        try { console.log('[SiteChat] history', Array.isArray(data && data.messages) ? data.messages.length : 0); } catch (_) {}
        (data && data.messages || []).forEach((m) => {
          messages.appendChild(renderMessageRow(m));
        });
        messages.scrollTop = messages.scrollHeight;
      });

      // Presence rendering (compact avatars)
      const lastChatAtByUser = new Map(); // userId -> { t, userName, avatarUrl }
      function renderPresence(users) {
        while (presenceWrap.firstChild) presenceWrap.removeChild(presenceWrap.firstChild);
        const total = Array.isArray(users) ? users.length : 0;
        // Sort by last chat time desc when available, otherwise keep input order
        const enriched = (users || []).map(u => {
          const rec = lastChatAtByUser.get(String(u.userId || ''));
          return { ...u, _t: rec && rec.t ? rec.t : 0 };
        });
        enriched.sort((a, b) => (b._t || 0) - (a._t || 0));
        const maxShow = 5;
        const size = 24;
        const overlap = -8; // px
        let shown = 0;
        const iconWrap = document.createElement('div');
        iconWrap.style.display = 'flex';
        iconWrap.style.alignItems = 'center';
        enriched.slice(0, maxShow).forEach((u, idx) => {
          const img = document.createElement('img');
          img.src = u && u.avatarUrl ? String(u.avatarUrl) : 'https://cdn.discordapp.com/embed/avatars/0.png';
          const name = (u && u.userName) ? String(u.userName) : 'Online user';
          img.alt = `${name} online`;
          img.title = name;
          img.width = size; img.height = size;
          img.style.borderRadius = '50%';
          img.style.flexShrink = '0';
          if (idx > 0) img.style.marginLeft = `${overlap}px`;
          iconWrap.appendChild(img);
          shown += 1;
        });
        presenceWrap.appendChild(iconWrap);
        const num = document.createElement('span');
        num.textContent = `+${total}`;
        num.style.fontSize = '12px';
        num.style.color = '#9ca3af';
        num.style.marginLeft = '6px';
        // Tooltip with full list of online users
        try {
          const names = enriched.map(u => (u && u.userName) ? String(u.userName) : 'Online user');
          // Use newlines; most browsers render them in native tooltips
          num.title = names.join('\n');
          num.setAttribute('aria-label', names.join(', '));
          num.style.cursor = 'help';
        } catch(_) {}
        presenceWrap.appendChild(num);
      }

      socket.on('presence:update', (payload) => {
        try { renderPresence((payload && payload.usersOnline) || []); } catch (_) {}
      });

      function send() {
        const text = String(input.value || '').trim();
        if (!text) return;
        if (!canSendNow()) return;
        try { console.log('[SiteChat] emit chat:message', text); } catch (_) {}
        socket.emit('chat:message', { text });
        sendTimestamps.push(Date.now());
        input.value = '';
      }
      sendBtn.addEventListener('click', send);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

      // Typing indicators (debounced start/stop)
      let typingTimer = null;
      const TYPING_IDLE_MS = 3000;
      function emitTypingStart() {
        try { socket.emit('typing:start'); } catch (_) {}
      }
      function emitTypingStop() {
        try { socket.emit('typing:stop'); } catch (_) {}
      }
      function scheduleTypingStop() {
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => emitTypingStop(), TYPING_IDLE_MS);
      }
      input.addEventListener('input', () => { emitTypingStart(); scheduleTypingStop(); });
      input.addEventListener('blur', () => { emitTypingStop(); });

      const typingSet = new Set();
      function updateTypingLabel() {
        const names = Array.from(typingSet);
        if (names.length === 0) { typingEl.textContent = ''; return; }
        if (names.length === 1) { typingEl.textContent = `${names[0]} is typing…`; return; }
        if (names.length === 2) { typingEl.textContent = `${names[0]} and ${names[1]} are typing…`; return; }
        typingEl.textContent = `${names[0]}, ${names[1]} and ${names.length - 2} others are typing…`;
      }
      socket.on('typing:start', (p) => { const n = p && (p.userName || p.userId) || 'Someone'; typingSet.add(n); updateTypingLabel(); });
      socket.on('typing:stop', (p) => { const n = p && (p.userName || p.userId) || 'Someone'; typingSet.delete(n); updateTypingLabel(); });

      // Emoji picker (Emoji Button)
      function ensureEmojiPicker() {
        if (window.EmojiButton) return Promise.resolve();
        const sources = [
          'https://cdn.jsdelivr.net/npm/emoji-button@4.6.4/dist/index.umd.min.js',
          'https://cdn.jsdelivr.net/npm/emoji-button@4.6.4/dist/index.min.js',
          'https://unpkg.com/emoji-button@4.6.4/dist/index.umd.min.js'
        ];
        return new Promise(async (resolve, reject) => {
          for (let i = 0; i < sources.length; i += 1) {
            if (window.EmojiButton) return resolve();
            await new Promise((res) => {
              const existing = document.querySelector(`script[data-emoji-button="${sources[i]}"]`);
              if (existing) { existing.addEventListener('load', () => res()); existing.addEventListener('error', () => res()); return; }
              const s = document.createElement('script');
              s.src = sources[i];
              s.async = true;
              s.defer = true;
              s.setAttribute('data-emoji-button', sources[i]);
              s.onload = () => res();
              s.onerror = () => res();
              document.head.appendChild(s);
            });
            if (window.EmojiButton) return resolve();
          }
          reject(new Error('EmojiButton UMD failed to load from all sources'));
        });
      }
      let picker = null;
      // Basic local fallback picker (small grid) if CDN fails
      let basicPickerEl = null;
      let basicDocCloseHandler = null;
      function closeBasicEmojiPanel() {
        try {
          if (basicDocCloseHandler) {
            document.removeEventListener('click', basicDocCloseHandler, true);
            basicDocCloseHandler = null;
          }
          if (basicPickerEl && basicPickerEl.isConnected) basicPickerEl.remove();
          basicPickerEl = null;
        } catch (_) {}
      }
      function toggleBasicEmojiPanel() {
        try {
          if (basicPickerEl && basicPickerEl.isConnected) { closeBasicEmojiPanel(); return; }
          const common = ['😀','😂','🤣','😊','😍','😘','😎','😇','🙂','🙃','😉','😅','😢','😭','😡','👍','👎','🙏','👏','🙌','💪','🔥','✨','🎉','❤️','🧡','💛','💚','💙','💜','🤍','🤎','🖤','💯','🐶','🐱','🐵','🦊','🐼','🐨','🐯','🍕','🍔','🍟','🌮','🍣','🍺','🍷','☕','🍰','🎂','🍪','⚔️','🛡️','🗡️','🧙‍♂️','🧝‍♀️','🐲'];
          basicPickerEl = document.createElement('div');
          basicPickerEl.style.position = 'absolute';
          const rect = emojiBtn.getBoundingClientRect();
          basicPickerEl.style.left = `${rect.left}px`;
          basicPickerEl.style.top = `${rect.top - 220}px`;
          basicPickerEl.style.width = '220px';
          basicPickerEl.style.maxHeight = '200px';
          basicPickerEl.style.overflow = 'auto';
          basicPickerEl.style.background = '#0b1220';
          basicPickerEl.style.border = '1px solid #374151';
          basicPickerEl.style.borderRadius = '8px';
          basicPickerEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.45)';
          basicPickerEl.style.padding = '8px';
          basicPickerEl.style.zIndex = '2147483002';
          basicPickerEl.style.display = 'grid';
          basicPickerEl.style.gridTemplateColumns = 'repeat(8, 1fr)';
          basicPickerEl.style.gap = '6px';
          common.forEach(e => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = e;
            b.style.fontSize = '18px';
            b.style.lineHeight = '24px';
            b.style.background = 'transparent';
            b.style.border = 'none';
            b.style.cursor = 'pointer';
            b.addEventListener('click', () => {
              const start = input.selectionStart || input.value.length;
              const end = input.selectionEnd || input.value.length;
              input.value = input.value.slice(0, start) + e + input.value.slice(end);
              input.focus();
              closeBasicEmojiPanel();
            });
            basicPickerEl.appendChild(b);
          });
          document.body.appendChild(basicPickerEl);
          basicDocCloseHandler = (ev) => {
            if (!basicPickerEl) return;
            if (ev && (ev.target === basicPickerEl || basicPickerEl.contains(ev.target) || ev.target === emojiBtn)) return;
            closeBasicEmojiPanel();
          };
          setTimeout(() => document.addEventListener('click', basicDocCloseHandler, true), 0);
        } catch (_) {}
      }

      const preferLocalEmojiPicker = true;
      emojiBtn.addEventListener('click', async () => {
        try {
          if (preferLocalEmojiPicker) { toggleBasicEmojiPanel(); return; }
          await ensureEmojiPicker();
          if (window.EmojiButton) {
            // Recreate picker each time to avoid stale state issues
            try { if (picker && picker.hidePicker) picker.hidePicker(); } catch (_) {}
            picker = new window.EmojiButton({ theme: 'dark', autoHide: true, position: 'top-start' });
            picker.on('emoji', selection => {
              try {
                const emoji = selection && (selection.emoji || selection);
                if (emoji) {
                  const start = input.selectionStart || input.value.length;
                  const end = input.selectionEnd || input.value.length;
                  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
                  input.focus();
                  try { picker.hidePicker(); } catch (_) {}
                }
              } catch (_) {}
            });
            try { picker.showPicker(emojiBtn); } catch (_) { picker.togglePicker(emojiBtn); }
            return;
          }
          throw new Error('EmojiButton not available');
        } catch (e) {
          toggleBasicEmojiPanel();
        }
      });

      // Drag & drop / paste image upload
      // show uploading overlay/icon (disabled overlay for drag)
      let dropOverlay = null;
      function ensureDropOverlay() { return null; }
      function showOverlay() { return; }
      function hideOverlay() { return; }

      function addNotice(text, tone) {
        try {
          const row = document.createElement('div');
          row.style.padding = '6px 10px';
          row.style.fontSize = '12px';
          row.style.color = tone === 'error' ? '#fca5a5' : '#9ca3af';
          row.textContent = text;
          messages.appendChild(row);
          messages.scrollTop = messages.scrollHeight;
          setTimeout(() => { try { row.remove(); } catch(_){} }, 5000);
        } catch (_) {}
      }

      // --- Client-side slow mode ---
      const SLOW_MODE_MAX = 5; // msgs
      const SLOW_MODE_WINDOW_MS = 5000; // 5s
      const sendTimestamps = [];
      function canSendNow() {
        const now = Date.now();
        // prune old
        while (sendTimestamps.length && now - sendTimestamps[0] > SLOW_MODE_WINDOW_MS) sendTimestamps.shift();
        if (sendTimestamps.length >= SLOW_MODE_MAX) {
          const waitMs = SLOW_MODE_WINDOW_MS - (now - sendTimestamps[0]);
          const secs = Math.ceil(waitMs / 1000);
          addNotice(`Slow mode: please wait ${secs}s before sending again.`, 'error');
          return false;
        }
        return true;
      }

      async function uploadFile(file) {
        try {
          if (!file) return;
          const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          if (!allowed.includes(String(file.type || ''))) {
            addNotice('Upload blocked: only JPG/PNG/GIF/WebP allowed.', 'error');
            return;
          }
          if (file.size > 200 * 1024) {
            const kb = Math.ceil(file.size / 1024);
            addNotice(`Image too large (${kb} KB). Max 200 KB.`, 'error');
            return;
          }
          const form = new FormData();
          form.append('file', file);
          // show a temporary uploading row
          const tempRow = renderMessageRow({ userName: 'Uploading…', avatarUrl: null, text: '', attachments: null });
          const spinner = document.createElement('div');
          spinner.textContent = 'Uploading…'; spinner.style.fontSize = '12px'; spinner.style.color = '#9ca3af'; spinner.style.marginTop = '4px';
          tempRow.lastChild && tempRow.lastChild.appendChild(spinner);
          messages.appendChild(tempRow); messages.scrollTop = messages.scrollHeight;

          const res = await fetch((cfg.endpoints && cfg.endpoints.uploadUrl) || '/api/chat/upload', { method: 'POST', body: form, credentials: 'include' });
          let j = null; try { j = await res.json(); } catch(_){}
          if (!res.ok || !j || j.ok === false) {
            try { tempRow.remove(); } catch(_){}
            addNotice(`Upload failed${j && j.error ? `: ${j.error}` : ''}`, 'error');
            return;
          }
          // Send message with attachment
          socket.emit('chat:message', { text: '', attachments: [{ type: 'image', url: j.url, thumbUrl: j.thumbUrl }] });
          // remove temp row
          try { tempRow.remove(); } catch(_) {}
        } catch (e) { addNotice('Upload failed. Please try again.', 'error'); }
      }

      function handlePaste(ev) {
        try {
          const items = ev.clipboardData && ev.clipboardData.items;
          if (!items) return;
          for (let i = 0; i < items.length; i += 1) {
            const it = items[i];
            if (it && it.kind === 'file') {
              const file = it.getAsFile();
              uploadFile(file);
              ev.preventDefault();
              break;
            }
          }
        } catch (_) {}
      }
      function handleDrop(ev) {
        ev.preventDefault();
        try {
          const files = ev.dataTransfer && ev.dataTransfer.files;
          if (!files || files.length === 0) return;
          uploadFile(files[0]);
        } catch (_) {}
      }
      function preventDefaults(ev) { try { ev.preventDefault(); ev.stopPropagation(); } catch(_){} }
      panel.addEventListener('paste', handlePaste);
      // Remove drag listeners to disable drag-over uploads
      try {
        panel.removeEventListener && panel.removeEventListener('dragenter', ()=>{}, true);
        panel.removeEventListener && panel.removeEventListener('dragover', ()=>{}, true);
        panel.removeEventListener && panel.removeEventListener('dragleave', ()=>{}, true);
        panel.removeEventListener && panel.removeEventListener('drop', ()=>{}, true);
      } catch(_){}

      // Render attachments in messages
      function renderMessageRow(msg) {
        const isMine = msg && auth && String(msg.userId || '') === String(auth.userId || '');
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '8px';
        row.style.padding = '6px 0';

        const avatar = document.createElement('img');
        const fallbackAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
        avatar.src = (msg && msg.avatarUrl) ? String(msg.avatarUrl) : fallbackAvatar;
        avatar.alt = (msg && msg.userName) ? `${msg.userName}'s avatar` : 'avatar';
        avatar.width = 24; avatar.height = 24;
        avatar.style.borderRadius = '50%';
        avatar.style.flexShrink = '0';

        const body = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.textContent = String((msg && msg.userName) || 'User');
        nameEl.style.fontWeight = '600';
        nameEl.style.fontSize = '12px';
        nameEl.style.color = '#e5e7eb';
        const textEl = document.createElement('div');
        textEl.textContent = String((msg && msg.text) || '');
        textEl.style.fontSize = '13px';
        textEl.style.color = '#d1d5db';
        body.appendChild(nameEl);
        body.appendChild(textEl);

        // attachments
        try {
          const atts = Array.isArray(msg && msg.attachments) ? msg.attachments : [];
          atts.forEach(a => {
            if (!a || a.type !== 'image' || !a.url) return;
            const img = document.createElement('img');
            img.src = a.thumbUrl || a.url;
            img.alt = 'attachment';
            img.style.display = 'block';
            img.style.maxWidth = '220px';
            img.style.borderRadius = '6px';
            img.style.marginTop = '4px';
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => { try { window.open(a.url, '_blank', 'noopener'); } catch(_) {} });
            body.appendChild(img);
          });
        } catch (_) {}

        row.appendChild(avatar);
        row.appendChild(body);
        return row;
      }

      socket.on('message:new', (m) => {
        try { console.log('[SiteChat] message:new', m && m.source, (m && m.text ? String(m.text).slice(0,60) : '')); } catch (_) {}
        // track last chat time for recency ordering
        try {
          if (m && m.userId) {
            lastChatAtByUser.set(String(m.userId), { t: Date.now(), userName: m.userName, avatarUrl: m.avatarUrl });
          }
        } catch(_){}
        // snippet + unread when closed
        try {
          const snippetText = (m && m.text && m.text.trim()) ? m.text.trim() : (Array.isArray(m && m.attachments) && m.attachments.length>0 ? '📷 image' : '');
          if (!open) {
            lastSnippet = snippetText.length > 28 ? snippetText.slice(0, 28) + '…' : snippetText || 'New message';
            saveSnippet(lastSnippet);
            unreadCount += 1; saveUnread(unreadCount);
            setBubbleClosedVisual(); animateBubblePulse();
            if (lastSnippet) showSnippetPill(lastSnippet);
          }
        } catch(_){}
        messages.appendChild(renderMessageRow(m));
        messages.scrollTop = messages.scrollHeight;
      });
      socket.on('message:delete', (p) => {
        try {
          const id = p && p.id;
          if (!id) return;
          const row = messages.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
          if (row && row.parentNode) row.parentNode.removeChild(row);
          else addNotice('A message was removed by a manager.', '');
        } catch(_){}
      });
      //
    }
  };
})();


