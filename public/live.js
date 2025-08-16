(() => {
    const $ = (sel) => document.querySelector(sel);
    const stream = () => $('#stream');
	const statsEl = () => $('#stats');
    const encounterFeed = () => $('#encounter-panel-body');
    const deathPanelBody = () => $('#death-panel-body');
    const topDmgList = () => $('#top-dmg-list');
    const topHealList = () => $('#top-heal-list');
    const encDmgList = () => $('#enc-dmg-list');
    const encHealList = () => $('#enc-heal-list');
    const statusEl = () => $('#status');
    const input = () => $('#reportInput');
	const startSharedBtn = () => $('#startSharedBtn');
	const stopSharedBtn = () => $('#stopSharedBtn');
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
    let isManager = false;

    // Rolling 10s event buffer by actor name/id for death analysis
    const rollingBuffer = new Map(); // key: actorKey -> array of events
    const MAX_BUFFER_MS = 10000;
    const MAX_BUFFER_EVENTS = 2000;
    const deathCards = new Map(); // key: actorKey@timestamp -> DOM element
    const totalBySource = new Map(); // sourceName -> { dmg: number, heal: number, classColor?: string }
    let currentEncounter = null; // { name: string, bySource: Map(name -> {dmg, heal, classColor}) }

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
                const box = document.createElement('div');
                box.className = 'encounter-box';
                const title = document.createElement('div');
                title.className = 'encounter-box-title';
                const rel = (typeof ev.timestamp === 'number') ? ev.timestamp : 0;
                const when = formatMs(rel);
                const name = ev && (ev.encounterName || ev.bossName || ev.name || '') || '';
                title.textContent = `${name}`;
                const time = document.createElement('div');
                time.className = 'time';
                time.textContent = `${typeLower === 'encounterstart' ? 'start' : 'end'}: ${when}`;
                box.appendChild(title);
                box.appendChild(time);
                encounterFeed().appendChild(box);

                // Manage encounter-scoped totals
                if (typeLower === 'encounterstart') {
                    currentEncounter = { name, bySource: new Map() };
                    // Clear panels immediately
                    if (encDmgList()) encDmgList().innerHTML = '';
                    if (encHealList()) encHealList().innerHTML = '';
                } else if (typeLower === 'encounterend') {
                    currentEncounter = null; // stop accumulating
                }
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
                // Aggregate totals by source
                const ownerName = ev && ev.source && ev.source.petOwner && ev.source.petOwner.name ? ev.source.petOwner.name : null;
                const tallyName = ownerName || srcName || (srcId != null ? `#${srcId}` : null);
                if (tallyName) {
                    let rec = totalBySource.get(tallyName);
                    if (!rec) { rec = { dmg: 0, heal: 0 }; totalBySource.set(tallyName, rec); }
                    // class color from assigned map if available
                    if (!rec.classColor && assignedMap && assignedMap[tallyName.toLowerCase()]) {
                        rec.classColor = assignedMap[tallyName.toLowerCase()].color || null;
                    }
                    if (!rec.classColor && assignedMap && assignedMap[tallyName.toLowerCase()]) {
                        const cls = assignedMap[tallyName.toLowerCase()].class;
                        const c = classColorFor(cls);
                        if (c) rec.classColor = c;
                    }
                    const amount = Number(ev.amount || 0);
                    if (typeLower === 'damage') rec.dmg += amount;
                    if (typeLower === 'heal') rec.heal += amount;

                    // Per-encounter accumulation: only when an encounter is active
                    if (currentEncounter) {
                        let er = currentEncounter.bySource.get(tallyName);
                        if (!er) { er = { dmg: 0, heal: 0, classColor: rec.classColor || null }; currentEncounter.bySource.set(tallyName, er); }
                        if (!er.classColor && assignedMap && assignedMap[tallyName.toLowerCase()]) {
                            const cls = assignedMap[tallyName.toLowerCase()].class;
                            const c = classColorFor(cls);
                            if (c) er.classColor = c;
                        }
                        if (typeLower === 'damage') er.dmg += amount;
                        if (typeLower === 'heal') er.heal += amount;
                    }
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
                    // Newest first
                    const container = deathPanelBody();
                    if (container && container.firstChild) container.insertBefore(card, container.firstChild); else if (container) container.appendChild(card);
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
                // Update top 5 lists after new batch
                renderTopLists();
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
        setStatus('starting...');
        pollOnce();
    }

    function stop() {
        isRunning = false;
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        setStatus('stopped');
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

    // pause removed

    function renderTopLists() {
        const dmgArr = [];
        const healArr = [];
        for (const [name, rec] of totalBySource.entries()) {
            dmgArr.push({ name, value: rec.dmg, color: rec.classColor || '#444' });
            healArr.push({ name, value: rec.heal, color: rec.classColor || '#444' });
        }
        dmgArr.sort((a,b) => b.value - a.value);
        healArr.sort((a,b) => b.value - a.value);

        const renderMeter = (container, arr) => {
            if (!container) return;
            container.innerHTML = '';
            const top = arr[0] && arr[0].value > 0 ? arr[0].value : 1;
            (arr.slice(0,5)).forEach(item => {
                const wrap = document.createElement('div');
                wrap.className = 'meter-item';
                const bar = document.createElement('div');
                bar.className = 'meter-bar';
                bar.style.width = `${Math.round((item.value / top) * 100)}%`;
                bar.style.background = colorToRgba(item.color, 0.6) || item.color;
                const row = document.createElement('div');
                row.className = 'meter-row';
                const nm = document.createElement('span');
                nm.textContent = item.name;
                const val = document.createElement('span');
                val.textContent = String(item.value);
                row.appendChild(nm);
                row.appendChild(val);
                wrap.appendChild(bar);
                wrap.appendChild(row);
                container.appendChild(wrap);
            });
        };
        renderMeter(topDmgList(), dmgArr);
        renderMeter(topHealList(), healArr);

        // Per-encounter (only if an encounter is active)
        if (currentEncounter) {
            const eDmgArr = [];
            const eHealArr = [];
            for (const [name, rec] of currentEncounter.bySource.entries()) {
                eDmgArr.push({ name, value: rec.dmg, color: rec.classColor || '#444' });
                eHealArr.push({ name, value: rec.heal, color: rec.classColor || '#444' });
            }
            eDmgArr.sort((a,b) => b.value - a.value);
            eHealArr.sort((a,b) => b.value - a.value);
            renderMeter(encDmgList(), eDmgArr);
            renderMeter(encHealList(), eHealArr);
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

    function classColorFor(name) {
        if (!name) return null;
        const n = String(name).toLowerCase();
        // map common class names
        if (n.includes('warrior')) return '#C79C6E';
        if (n.includes('paladin')) return '#F58CBA';
        if (n.includes('hunter')) return '#ABD473';
        if (n.includes('rogue')) return '#FFF569';
        if (n.includes('priest')) return '#FFFFFF';
        if (n.includes('shaman')) return '#0070DE';
        if (n.includes('mage')) return '#69CCF0';
        if (n.includes('warlock')) return '#9482C9';
        if (n.includes('druid')) return '#FF7D0A';
        return null;
    }

    window.addEventListener('DOMContentLoaded', () => {
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
        // On first load, if a shared session is active, fetch a snapshot to mirror host panels
        (async () => {
            try {
                const snap = await fetch('/api/wcl/live/snapshot', { headers: { 'Accept': 'application/json' } }).then(r=>r.json());
                if (snap && snap.active && snap.live) {
                    // Set report and cursor
                    if (snap.live.reportInput && !reportParam) {
                        input().value = snap.live.reportInput;
                        reportParam = snap.live.reportInput;
                    }
                    const startMs = Math.max(0, Number(snap.live.currentCursorMs || snap.live.startCursorMs || 0));
                    if (startMs > 0) {
                        hh().value = String(Math.floor(startMs / 3600000));
                        mm().value = String(Math.floor((startMs % 3600000) / 60000));
                        ss().value = String(Math.floor((startMs % 60000) / 1000));
                        nextCursor = startMs;
                    }
                    // Apply totals and encounter to meter maps
                    if (snap.live.stats) {
                        const totals = snap.live.stats.totalBySource || {};
                        for (const name in totals) {
                            const rec = totals[name];
                            totalBySource.set(name, { dmg: Number(rec.dmg||0), heal: Number(rec.heal||0), classColor: rec.color || null });
                        }
                        if (snap.live.stats.encounter && snap.live.stats.encounter.name) {
                            currentEncounter = { name: snap.live.stats.encounter.name, bySource: new Map() };
                            const e = snap.live.stats.encounter.bySource || {};
                            for (const name in e) {
                                const rec = e[name];
                                currentEncounter.bySource.set(name, { dmg: Number(rec.dmg||0), heal: Number(rec.heal||0), classColor: rec.color || null });
                            }
                        }
                        // Render initial meters
                        renderTopLists();
                        // Preload Encounter Log and Death Log from host snapshot so late viewers mirror host
                        try {
                            // Ensure assignedMap is available for filtering/class colors
                            const eventId = localStorage.getItem('activeEventSession');
                            if (eventId && !assignedMap) {
                                const j = await fetch(`/api/events/${encodeURIComponent(eventId)}/assigned-characters`, { headers: { 'Accept': 'application/json' } }).then(r => r.ok ? r.json() : null).catch(()=>null);
                                assignedMap = j && j.assigned ? j.assigned : null;
                            }

                            // Encounter boxes
                            if (encounterFeed) {
                                const encs = Array.isArray(snap.live.stats.encounters) ? snap.live.stats.encounters : [];
                                if (encounterFeed()) encounterFeed().innerHTML = '';
                                for (const enc of encs) {
                                    const box = document.createElement('div');
                                    box.className = 'encounter-box';
                                    const title = document.createElement('div');
                                    title.className = 'encounter-box-title';
                                    title.textContent = `${enc.name || ''}`;
                                    const time = document.createElement('div');
                                    time.className = 'time';
                                    time.textContent = `${enc.type === 'start' ? 'start' : 'end'}: ${formatMs(Number(enc.ts||0))}`;
                                    box.appendChild(title);
                                    box.appendChild(time);
                                    if (encounterFeed()) encounterFeed().appendChild(box);
                                }
                            }

                            // Encounter meters snapshot fill (ensures non-empty for viewers)
                            {
                                const eObj = snap.live.stats && snap.live.stats.encounter && snap.live.stats.encounter.bySource ? snap.live.stats.encounter.bySource : {};
                                const hasEntries = eObj && Object.keys(eObj).length > 0;
                                if (hasEntries) {
                                    if (!currentEncounter || !currentEncounter.bySource || currentEncounter.bySource.size === 0) {
                                        let inferredName = null;
                                        const encs = Array.isArray(snap.live.stats.encounters) ? snap.live.stats.encounters : [];
                                        for (let i = encs.length - 1; i >= 0; i--) { if (encs[i] && encs[i].name) { inferredName = encs[i].name; break; } }
                                        currentEncounter = { name: inferredName || '(Encounter)', bySource: new Map() };
                                        for (const n in eObj) {
                                            const r = eObj[n];
                                            currentEncounter.bySource.set(n, { dmg: Number(r.dmg||0), heal: Number(r.heal||0), classColor: r.color || null });
                                        }
                                    }
                                    // Render immediately
                                    renderTopLists();
                                }
                            }

                            // Death cards (newest on top) — only for assigned players
                            if (deathPanelBody) {
                                const deaths = Array.isArray(snap.live.stats.deaths) ? snap.live.stats.deaths : [];
                                if (deathPanelBody()) deathPanelBody().innerHTML = '';
                                if (assignedMap) {
                                    for (const d of deaths) {
                                        const name = d && d.name ? String(d.name) : null;
                                        if (!name) continue;
                                        if (!assignedMap[name.toLowerCase()]) continue; // filter to assigned players
                                        const key = `${name}@${Number(d.ts||0)}`;
                                        if (!deathCards.has(key)) {
                                            const card = document.createElement('div');
                                            card.className = 'death-card';
                                            const header = document.createElement('div');
                                            header.className = 'title';
                                            const nm = document.createElement('span');
                                            nm.textContent = name;
                                            const tm = document.createElement('span');
                                            tm.textContent = formatMs(Number(d.ts||0)).replace(/:/g, '.');
                                            header.appendChild(nm);
                                            header.appendChild(tm);

                                            // Class color background/border like meters
                                            const info = assignedMap[name.toLowerCase()] || null;
                                            let colorHex = info && info.color ? info.color : null;
                                            if (!colorHex && info && info.class) colorHex = classColorFor(info.class) || null;
                                            if (colorHex) {
                                                const bg = colorToRgba(colorHex, 0.2) || colorHex;
                                                card.style.background = bg;
                                                card.style.border = `1px solid ${colorHex}`;
                                                header.style.color = getReadableTextColor(bg);
                                            }
                                            card.appendChild(header);

                                            const mini = document.createElement('div');
                                            mini.className = 'mini-stream';
                                            const lines = Array.isArray(d.lines) ? d.lines : [];
                                            for (const ln of lines) {
                                                const row = document.createElement('div');
                                                const isHeal = String(ln.type||'').toLowerCase() === 'heal';
                                                row.style.color = isHeal ? 'rgb(107, 255, 122)' : 'rgb(255, 107, 107)';
                                                const time = formatMs(Number(ln.ts||0));
                                                const src = ln.source || '';
                                                const ability = ln.ability || '';
                                                const amt = Number(ln.amount||0);
                                                row.textContent = `[${time}] ${isHeal ? 'heal' : 'damage'} ${src} [${ability}] amount=${amt}`;
                                                mini.appendChild(row);
                                            }
                                            card.appendChild(mini);
                                            const container = deathPanelBody();
                                            if (container && container.firstChild) container.insertBefore(card, container.firstChild); else if (container) container.appendChild(card);
                                            deathCards.set(key, card);
                                        }
                                    }
                                }
                            }
                        } catch (_) {}
                    }
                    if (!isRunning && reportParam) start();
                }
            } catch (_) {}
        })();
        async function refreshLiveStatus() {
            try {
                const resp = await fetch('/api/wcl/live/status', { headers: { 'Accept': 'application/json' } });
                const body = await resp.json();
                const on = body && body.active;
                if (indicator) {
                    indicator.style.background = on ? '#2ecc71' : '#e74c3c';
                    indicator.style.boxShadow = on ? '0 0 6px #2ecc71' : '0 0 6px #e74c3c';
                }
                // Toggle management buttons
                if (isManager) {
                    if (startSharedBtn()) startSharedBtn().style.display = on ? 'none' : 'inline-block';
                    if (stopSharedBtn()) stopSharedBtn().style.display = on ? 'inline-block' : 'none';
                }
                if (!on) {
                    // Shared session ended; stop any local streaming
                    if (isRunning) stop();
                    return;
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

        // Show management-only Start/Stop buttons (host-only). On /live viewers, always hide controls.
        (async () => {
            try {
                const userResp = await fetch('/user');
                const user = await userResp.json();
                isManager = !!(user && user.loggedIn && user.hasManagementRole);
                const isHostPage = location.pathname === '/livehost';
                if (isHostPage && isManager && startSharedBtn()) {
                    // Initial visibility handled by refreshLiveStatus
                    startSharedBtn().addEventListener('click', async () => {
                        const report = (input().value || '').trim();
                        if (!report) { input().focus(); return; }
                        const startCursorMs = getStartTimeMs();
                        const eventId = localStorage.getItem('activeEventSession') || null;
                        try {
                            const resp = await fetch('/api/wcl/live/start', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ report, startCursorMs, eventId })
                            });
                            const body = await resp.json();
                            if (!resp.ok) throw new Error(body && (body.details || body.error) || 'Failed to start');
                            setStatus('Shared live session started');
                        } catch (err) {
                            setStatus(`error: ${err.message}`);
                        }
                    });
                    if (stopSharedBtn()) {
                        stopSharedBtn().addEventListener('click', async () => {
                            try {
                                const resp = await fetch('/api/wcl/live/stop', { method: 'POST' });
                                const body = await resp.json();
                                if (!resp.ok) throw new Error(body && (body.details || body.error) || 'Failed to stop');
                                setStatus('Shared live session stopped');
                                // Immediately stop local streaming without refresh
                                if (isRunning) stop();
                            } catch (err) {
                                setStatus(`error: ${err.message}`);
                            }
                        });
                    }
                } else {
                    // Viewer or non-host page: hide management controls and make time readonly
                    if (startSharedBtn()) startSharedBtn().style.display = 'none';
                    if (stopSharedBtn()) stopSharedBtn().style.display = 'none';
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


