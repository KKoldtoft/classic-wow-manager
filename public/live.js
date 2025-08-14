(() => {
    const $ = (sel) => document.querySelector(sel);
    const stream = () => $('#stream');
	const statsEl = () => $('#stats');
    const encounterFeed = () => $('#encounter-feed');
    const statusEl = () => $('#status');
    const input = () => $('#reportInput');
	const startBtn = () => $('#startBtn');
	const pauseBtn = () => $('#pauseBtn');
	const jumpFirstBtn = () => $('#jumpFirstBtn');
	const jumpNextBtn = () => $('#jumpNextBtn');
	const startSharedBtn = () => $('#startSharedBtn');
	const hh = () => $('#hh');
	const mm = () => $('#mm');
	const ss = () => $('#ss');
	// Filters removed per user request

	let isRunning = false;
	let isPaused = false;
    let nextCursor = 0;
    let reportParam = '';
    let pollTimer = null;
    const POLL_INTERVAL_MS = 1500;
    const WINDOW_MS = 15000;
	// Filters removed per user request
	let fightsCache = [];
    let assignedMap = null; // name(lowercased) -> { class, spec, color, partyId, slotId }

    // Rolling 10s event buffer by actor name/id for death analysis
    const rollingBuffer = new Map(); // key: actorKey -> array of events
    const MAX_BUFFER_MS = 10000;
    const MAX_BUFFER_EVENTS = 2000;
    const deathCards = new Map(); // key: actorKey@timestamp -> DOM element

    function setStatus(text) { statusEl().textContent = text || ''; }

    function formatMs(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        const msPart = (ms % 1000).toString().padStart(3, '0');
        return `${h}:${m}:${s}.${msPart}`;
    }

    function parseHexColor(hex) {
        if (!hex) return null;
        let h = String(hex).trim();
        if (h.startsWith('#')) h = h.slice(1);
        if (h.length === 3) {
            const r = parseInt(h[0] + h[0], 16);
            const g = parseInt(h[1] + h[1], 16);
            const b = parseInt(h[2] + h[2], 16);
            return { r, g, b };
        }
        if (h.length === 6) {
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return { r, g, b };
        }
        return null;
    }

    function rgbaFromHex(hex, alpha) {
        const c = parseHexColor(hex);
        if (!c) return null;
        const a = Math.max(0, Math.min(1, Number(alpha)));
        return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
    }

    function parseRgbColor(str) {
        if (!str) return null;
        let s = String(str).trim();
        let m = s.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
        if (m) {
            const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
            const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
            const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
            return { r, g, b };
        }
        m = s.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
        if (m) {
            const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
            const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
            const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
            return { r, g, b };
        }
        return null;
    }

    function colorToRgba(color, alpha) {
        const cHex = parseHexColor(color);
        if (cHex) return `rgba(${cHex.r}, ${cHex.g}, ${cHex.b}, ${Math.max(0, Math.min(1, Number(alpha)))})`;
        const cRgb = parseRgbColor(color);
        if (cRgb) return `rgba(${cRgb.r}, ${cRgb.g}, ${cRgb.b}, ${Math.max(0, Math.min(1, Number(alpha)))})`;
        return null;
    }

    function getReadableTextColor(color) {
        let c = parseHexColor(color) || parseRgbColor(color);
        if (!c) return '#ffffff';
        // Relative luminance
        const srgb = [c.r, c.g, c.b].map(v => v / 255);
        const lin = srgb.map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        return L > 0.5 ? '#000000' : '#ffffff';
    }

    function appendLines(events, reportStartTime, meta) {
        const container = stream();
        const frag = document.createDocumentFragment();
        const actors = (meta && meta.actorsById) || {};
        const abilities = (meta && meta.abilitiesById) || {};
        for (const ev of events) {
            // Update rolling buffer for damage/heal tracking
            const typeLower = String(ev.type || 'event').toLowerCase();
            // Encounter feed lines
            if ((typeLower === 'encounterstart' || typeLower === 'encounterend') && encounterFeed()) {
                const line = document.createElement('div');
                line.className = 'encounter-line ' + (typeLower === 'encounterstart' ? 'encounter-start' : 'encounter-end');
                const rel = (typeof ev.timestamp === 'number') ? ev.timestamp : 0;
                const when = formatMs(rel);
                const name = ev && (ev.encounterName || ev.bossName || ev.name || '') || '';
                line.textContent = `${typeLower === 'encounterstart' ? 'Encounter started' : 'Encounter ended'}: ${name} @ ${when}`;
                encounterFeed().appendChild(line);
            }
            const srcId = ev.sourceID ?? ev.source?.id;
            const tgtId = ev.targetID ?? ev.target?.id;
            const srcName = (srcId != null && actors[srcId]?.name) || ev.source?.name || (srcId != null ? `#${srcId}` : '');
            const tgtName = (tgtId != null && actors[tgtId]?.name) || ev.target?.name || (tgtId != null ? `#${tgtId}` : '');
            const relTs = (typeof ev.timestamp === 'number') ? ev.timestamp : 0;
            if (typeLower === 'damage' || typeLower === 'heal') {
                // Only track events the actor TOOK (as target), not what they did to others
                if (tgtName) {
                    const key = `tgt:${tgtName}`;
                    let arr = rollingBuffer.get(key);
                    if (!arr) { arr = []; rollingBuffer.set(key, arr); }
                    arr.push({ ts: relTs, type: typeLower, ev });
                    const cutoff = relTs - MAX_BUFFER_MS;
                    while (arr.length && (arr[0].ts < cutoff || arr.length > MAX_BUFFER_EVENTS)) arr.shift();
                }
            }

            const line = document.createElement('div');
            line.className = 'line';
            const ts = document.createElement('span');
            ts.className = 'timestamp';
            const rel = (typeof ev.timestamp === 'number') ? ev.timestamp : 0;
            ts.textContent = `[${formatMs(rel)}]`;
            const text = document.createElement('span');
            const type = ev.type || 'event';
            // Add type-based class for color coding
            const normalized = String(type).toLowerCase();
            const typeClass = 'type-' + normalized.replace(/[^a-z0-9]+/g, '');
            line.classList.add(typeClass);
            // srcId, tgtId, srcName, tgtName already computed above
            const abilityId = ev.abilityGameID ?? ev.ability?.guid;
            const abilityName = (abilityId != null && abilities[abilityId]?.name) || ev.ability?.name || (abilityId != null ? `#${abilityId}` : '');

            const renderVal = (v) => {
                if (v === null) return 'null';
                if (v === undefined) return 'undefined';
                if (typeof v === 'string') return JSON.stringify(v);
                if (typeof v === 'number' || typeof v === 'boolean') return String(v);
                try { return JSON.stringify(v); } catch (_) { return '[Unserializable]'; }
            };

            const pairs = [];
            pairs.push(`type=${type}`);
            pairs.push(`timestampMs=${rel}`);
            if (srcId != null) pairs.push(`sourceID=${srcId}`);
            if (srcName) pairs.push(`sourceName=${renderVal(srcName)}`);
            if (tgtId != null) pairs.push(`targetID=${tgtId}`);
            if (tgtName) pairs.push(`targetName=${renderVal(tgtName)}`);
            if (abilityId != null) pairs.push(`abilityGameID=${abilityId}`);
            if (abilityName) pairs.push(`abilityName=${renderVal(abilityName)}`);

            const preferredOrder = [
                'amount','overkill','absorbed','mitigated','multistrike','blocked','critical','hitType','tick',
                'resourceChange','resourceChangeType','waste','maxResourceAmount','classResources','stack',
                'duration','fight','sourceInstance','targetInstance','breadcrumb','otherInstance',
                'garbage', 'followerID'
            ];
            const added = new Set(['timestamp','type','sourceID','targetID','abilityGameID']);
            for (const key of preferredOrder) {
                if (Object.prototype.hasOwnProperty.call(ev, key)) {
                    pairs.push(`${key}=${renderVal(ev[key])}`);
                    added.add(key);
                }
            }
            const remainingKeys = Object.keys(ev).filter(k => !added.has(k) && k !== 'timestamp' && k !== 'type');
            remainingKeys.sort();
            for (const key of remainingKeys) {
                pairs.push(`${key}=${renderVal(ev[key])}`);
            }

            text.textContent = ' ' + pairs.join(' ');
            line.appendChild(ts);
            line.appendChild(text);
            frag.appendChild(line);

            // Death card creation - only for assigned players in active event
            if (typeLower === 'death' && tgtName && assignedMap && assignedMap[tgtName.toLowerCase()]) {
                const key = `${tgtName}@${rel}`;
                if (!deathCards.has(key)) {
                    const card = document.createElement('div');
                    card.className = 'death-card';
                    const header = document.createElement('div');
                    header.className = 'title';
                    const nameEl = document.createElement('span');
                    nameEl.textContent = tgtName;
                    const timeEl = document.createElement('span');
                    const ms = rel;
                    const totalSeconds = Math.floor(ms / 1000);
                    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
                    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
                    const s = (totalSeconds % 60).toString().padStart(2, '0');
                    timeEl.textContent = `${h}.${m}.${s}`;
                    header.appendChild(nameEl);
                    header.appendChild(timeEl);
                    const mini = document.createElement('div');
                    mini.className = 'mini-stream';
                    // Gather last 10s for this actor (as target or source) for damage/heal only
                    const eventsFor = [];
                    const buffers = [rollingBuffer.get(`tgt:${tgtName}`) || []];
                    const cutoff = rel - MAX_BUFFER_MS;
                    for (const arr of buffers) {
                        for (const item of arr) {
                            if (item.ts >= cutoff && (item.type === 'damage' || item.type === 'heal')) {
                                eventsFor.push(item);
                            }
                        }
                    }
                    if (eventsFor.length === 0) {
                        // Skip creating an empty death card
                        continue;
                    }
                    eventsFor.sort((a,b) => a.ts - b.ts);
                    const fragMini = document.createDocumentFragment();
                    for (const it of eventsFor) {
                        const lineMini = document.createElement('div');
                        const ms2 = it.ts;
                        const totS = Math.floor(ms2 / 1000);
                        const hh2 = Math.floor(totS / 3600).toString().padStart(2, '0');
                        const mm2 = Math.floor((totS % 3600) / 60).toString().padStart(2, '0');
                        const ss2 = (totS % 60).toString().padStart(2, '0');
                        const amt = (it.ev && it.ev.amount != null) ? ` amount=${it.ev.amount}` : '';
                        const sId = it.ev.sourceID ?? it.ev.source?.id;
                        const aId = it.ev.abilityGameID ?? it.ev.ability?.guid;
                        const sName = (sId != null && actors[sId]?.name) || it.ev.source?.name || (sId != null ? `#${sId}` : '');
                        const aName = (aId != null && abilities[aId]?.name) || it.ev.ability?.name || (aId != null ? `#${aId}` : '');
                        const who = sName ? ` ${sName}` : '';
                        const what = aName ? ` [${aName}]` : '';
                        lineMini.textContent = `[${hh2}:${mm2}:${ss2}] ${it.type}${who}${what}${amt}`;
                        lineMini.style.color = it.type === 'heal' ? '#6bff7a' : '#ff6b6b';
                        fragMini.appendChild(lineMini);
                    }
                    mini.appendChild(fragMini);
                    card.appendChild(header);
                    card.appendChild(mini);
                    statsEl().appendChild(card);
                    deathCards.set(key, card);

                    // Header + background class color if available
                    const info = assignedMap[tgtName.toLowerCase()];
                    if (info && info.color) {
                        const bg = colorToRgba(info.color, 0.2) || info.color;
                        card.style.borderColor = info.color;
                        card.style.background = bg;
                        header.style.color = getReadableTextColor(info.color);
                    }
                }
            }
        }
        container.appendChild(frag);
        container.scrollTop = container.scrollHeight;
    }

    async function pollOnce() {
        if (!isRunning || isPaused) return;
        try {
            const params = new URLSearchParams({ report: reportParam, cursor: String(nextCursor), windowMs: String(WINDOW_MS) });
            const resp = await fetch(`/api/wcl/events?${params.toString()}`, { headers: { 'Accept': 'application/json' } });
            let body;
            if (!resp.ok) {
                try { body = await resp.json(); } catch (_) { /* ignore */ }
                const msg = (body && (body.details || body.error)) ? `${body.error || 'error'}: ${body.details || ''}` : `HTTP ${resp.status}`;
                throw new Error(msg);
            }
            body = await resp.json();
            if (Array.isArray(body.events) && body.events.length > 0) {
                appendLines(body.events, body.reportStartTime || 0, body.meta || null);
            }
			if (typeof body.nextCursor === 'number') {
                nextCursor = body.nextCursor;
            } else {
                nextCursor += WINDOW_MS;
            }
            setStatus(`cursor=${nextCursor}`);
            setStartTimeFromCursor(nextCursor);
            // Filters removed
        } catch (err) {
            setStatus(`error: ${err.message}`);
        } finally {
            if (isRunning) {
                pollTimer = setTimeout(pollOnce, POLL_INTERVAL_MS);
            }
        }
    }

    function start() {
        if (isRunning) return;
        const value = (input().value || '').trim();
        if (!value) {
            input().focus();
            return;
        }
        reportParam = value;
        // Load fights list for jumping controls
        loadFights();
        // Load assigned character map for active event if present
        try {
            const eventId = localStorage.getItem('activeEventSession');
            if (eventId) {
                fetch(`/api/events/${encodeURIComponent(eventId)}/assigned-characters`, { headers: { 'Accept': 'application/json' } })
                    .then(r => r.ok ? r.json() : null)
                    .then(j => { assignedMap = j && j.assigned ? j.assigned : null; })
                    .catch(() => {});
            } else {
                assignedMap = null;
            }
        } catch (_) { assignedMap = null; }
        // Reset state
        $('#stream').innerHTML = '';
        nextCursor = getStartTimeMs();
        isRunning = true;
        isPaused = false;
        setStatus('starting...');
        startBtn().textContent = 'Stop';
        pollOnce();
    }

    function stop() {
        isRunning = false;
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        setStatus('stopped');
        startBtn().textContent = 'Start';
    }

    function getStartTimeMs() {
        const h = Math.max(0, Number(hh().value || 0));
        const m = Math.max(0, Number(mm().value || 0));
        const s = Math.max(0, Number(ss().value || 0));
        return (h * 3600 + m * 60 + s) * 1000;
    }

    function setStartTimeFromCursor(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        hh().value = String(h);
        mm().value = String(m);
        ss().value = String(s);
    }

    function togglePause() {
        isPaused = !isPaused;
        pauseBtn().textContent = isPaused ? 'Resume' : 'Pause';
        if (!isPaused && isRunning) {
            pollOnce();
        }
    }

	async function loadFights() {
		if (!reportParam) return [];
		try {
			const params = new URLSearchParams({ report: reportParam });
			const resp = await fetch(`/api/wcl/fights?${params.toString()}`, { headers: { 'Accept': 'application/json' } });
			if (!resp.ok) return [];
			const body = await resp.json();
			fightsCache = Array.isArray(body.fights) ? body.fights : [];
			return fightsCache;
		} catch (_) { return []; }
	}

	function jumpTo(ms) {
		setStartTimeFromCursor(ms);
		nextCursor = ms;
		$('#stream').innerHTML = '';
		if (!isRunning) start();
	}

	function jumpToFirstFight() {
		if (!fightsCache.length) return;
		const first = fightsCache.reduce((min, f) => (min == null || (f.startTime < min.startTime) ? f : min), null);
		if (first) jumpTo(Math.max(0, Math.floor(first.startTime) - 5000));
	}

	function jumpToNextFight() {
		if (!fightsCache.length) return;
		const candidates = fightsCache.filter(f => typeof f.startTime === 'number' && f.startTime > nextCursor + 1000);
		if (!candidates.length) return;
		candidates.sort((a,b) => a.startTime - b.startTime);
		const next = candidates[0];
		jumpTo(Math.max(0, Math.floor(next.startTime) - 5000));
	}

    // Filters removed

    window.addEventListener('DOMContentLoaded', () => {
        startBtn().addEventListener('click', () => { if (isRunning) stop(); else start(); });
        if (pauseBtn()) pauseBtn().addEventListener('click', togglePause);
		if (jumpFirstBtn()) jumpFirstBtn().addEventListener('click', jumpToFirstFight);
		if (jumpNextBtn()) jumpNextBtn().addEventListener('click', jumpToNextFight);
        // Filters removed
        input().addEventListener('keydown', (e) => {
            if (e.key === 'Enter') start();
        });
        // Autostart from query string
        const params = new URLSearchParams(window.location.search);
        const prefill = params.get('report');
        if (prefill) {
            input().value = prefill;
			start();
        }

        // Live indicator
        const indicator = document.getElementById('live-indicator');
        const liveLink = document.getElementById('live-view-link');
        async function refreshLiveStatus() {
            try {
                const resp = await fetch('/api/wcl/live/status', { headers: { 'Accept': 'application/json' } });
                const body = await resp.json();
                const on = body && body.active;
                if (indicator) {
                    indicator.style.background = on ? '#2ecc71' : '#e74c3c';
                    indicator.style.boxShadow = on ? '0 0 6px #2ecc71' : '0 0 6px #e74c3c';
                }
                if (on && body.live && body.live.reportInput && !reportParam) {
                    // Auto-start viewing active live report for viewers without management
                    input().value = body.live.reportInput;
                    reportParam = body.live.reportInput;
                    // Respect starter's cursor if provided
                    const startMs = Math.max(0, Number(body.live.currentCursorMs || body.live.startCursorMs || 0));
                    if (startMs > 0) {
                        hh().value = String(Math.floor(startMs / 3600000));
                        mm().value = String(Math.floor((startMs % 3600000) / 60000));
                        ss().value = String(Math.floor((startMs % 60000) / 1000));
                        nextCursor = startMs;
                    }
                    if (!isRunning) start();
                }
            } catch (_) {}
        }
        setInterval(refreshLiveStatus, 3000);
        refreshLiveStatus();

        // Show management-only Start Shared button
        (async () => {
            try {
                const userResp = await fetch('/user');
                const user = await userResp.json();
                if (user && user.loggedIn && user.hasManagementRole && startSharedBtn()) {
                    startSharedBtn().style.display = 'inline-block';
                    startSharedBtn().addEventListener('click', async () => {
                        const report = (input().value || '').trim();
                        if (!report) { input().focus(); return; }
                        const startCursorMs = getStartTimeMs();
                        try {
                            const resp = await fetch('/api/wcl/live/start', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ report, startCursorMs })
                            });
                            const body = await resp.json();
                            if (!resp.ok) throw new Error(body && (body.details || body.error) || 'Failed to start');
                            setStatus('Shared live session started');
                        } catch (err) {
                            setStatus(`error: ${err.message}`);
                        }
                    });
                } else {
                    // Viewer: hide controls and make time readonly
                    if (startBtn()) startBtn().style.display = 'none';
                    if (pauseBtn()) pauseBtn().style.display = 'none';
                    if (jumpFirstBtn()) jumpFirstBtn().style.display = 'none';
                    if (jumpNextBtn()) jumpNextBtn().style.display = 'none';
                    if (startSharedBtn()) startSharedBtn().style.display = 'none';
                    const reportInputEl = document.getElementById('reportInput');
                    if (reportInputEl) { reportInputEl.style.display = 'none'; }
                    if (hh()) hh().readOnly = true;
                    if (mm()) mm().readOnly = true;
                    if (ss()) ss().readOnly = true;
                }
            } catch (_) {}
        })();
    });
})();


