// public/history.js
(function initHistoryPage(){
	const cetTimeZone = 'Europe/Copenhagen';

	function formatEventName(event){
		const eventStart = new Date(Number(event.startTime) * 1000);
		const dateStr = eventStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: cetTimeZone }).replace(/\//g, '-');
		// Build clean channel display (same rules as completed raids)
		let channel = 'Unknown Channel';
		const channelName = event.channelName;
		const channelId = event.channelId || event.channelID || event.channel_id || null;
		if (channelName && channelName.trim() && channelName !== channelId && !String(channelName).match(/^\d+$/)) {
			channel = channelName;
		} else if (channelId) {
			channel = `channel-${String(channelId).slice(-4)}`;
		}
		const clean = String(channel)
			.replace(/[^\w\s-]/g, '')
			.replace(/-/g, ' ')
			.trim()
			.split(' ')
			.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
			.join(' ');
		return `${clean} - ${dateStr}`;
	}

	function formatTime(event){
		const dt = new Date(Number(event.startTime) * 1000);
		const t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: cetTimeZone });
		const d = dt.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: cetTimeZone });
		return `${d} ${t}`;
	}

	function buildLinksCell(eventId){
		const lootHref = eventId ? `/event/${eventId}/loot` : '#';
		const logsHref = eventId ? `/event/${eventId}/logs` : '#';
		return `<a href="${lootHref}" target="_blank" rel="noopener" style="margin-right:10px;">Loot</a>`+
		       `<a href="${logsHref}" target="_blank" rel="noopener">Logs</a>`;
	}

	async function fetchLogsStatus(eventId){
		try {
			const res = await fetch(`/api/rpb-tracking/${eventId}`);
			if (!res.ok) return null;
			const data = await res.json();
			if (!data || !data.hasData || !data.data) return null;
			return data.data; // keyed by analysis_type
		} catch (_) { return null; }
	}

	async function fetchGoldPot(eventId){
		try {
			const res = await fetch(`/api/event-goldpot/${eventId}`);
			if (!res.ok) return 0;
			const data = await res.json();
			return Number(data.goldPot)||0;
		} catch (_) { return 0; }
	}

	async function loadHistory(){
		const tbody = document.getElementById('history-tbody');
		if (!tbody) return;
		tbody.innerHTML = '<tr><td colspan="7" style="padding:12px;">Loading…</td></tr>';
		try {
			const res = await fetch('/api/events/historic-24m');
			if (res.status === 401) {
				tbody.innerHTML = '<tr><td colspan="4" style="padding:12px;">Please sign in with Discord to view event history.</td></tr>';
				return;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			const list = Array.isArray(data?.scheduledEvents) ? data.scheduledEvents : [];
			if (list.length === 0){
				tbody.innerHTML = '<tr><td colspan="7" style="padding:12px;">No completed events found in the last 24 months.</td></tr>';
				return;
			}

			// Sort newest first just in case
			list.sort((a,b)=>Number(b.startTime)-Number(a.startTime));
			// Render rows; then asynchronously fill gold pot values for performance
			const rows = list.map(ev => {
				const id = ev.id;
				const name = formatEventName(ev);
				const time = formatTime(ev);
				return `
					<tr data-event-id="${id}">
						<td style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</td>
						<td>${time}</td>
						<td style="text-align:right;" id="gp-${id}">—</td>
						<td style="text-align:center;" id="rpb-${id}">—</td>
						<td style="text-align:center;" id="wb-${id}">—</td>
						<td style="text-align:center;" id="dh-${id}">—</td>
						<td>${buildLinksCell(id)}</td>
					</tr>
				`;
			}).join('');
			tbody.innerHTML = rows;

			// Stagger gold pot fetches to avoid bursts
			list.forEach((ev, i) => {
				setTimeout(async () => {
					const gold = await fetchGoldPot(ev.id);
					const cell = document.getElementById(`gp-${ev.id}`);
					if (cell) {
						if (Number(gold) > 0) {
							cell.innerHTML = `<span class="gold-color">${Number(gold).toLocaleString()}</span>`;
						} else {
							cell.innerHTML = `<span style="color:#ff6b6b;">✖</span>`;
						}
					}
				}, i * 80);
			});

			// Logs status fetch
			list.forEach((ev, i) => {
				setTimeout(async () => {
					const data = await fetchLogsStatus(ev.id);
					const rpbCell = document.getElementById(`rpb-${ev.id}`);
					const wbCell = document.getElementById(`wb-${ev.id}`);
					const dhCell = document.getElementById(`dh-${ev.id}`);
					const noIcon = '<span style="color:#ff6b6b;">✖</span>';
					const okIcon = '<span style="color:#59d17a;">✔</span>';

					// RPB
					if (rpbCell) {
						if (data && data.rpb && data.rpb.status === 'completed') rpbCell.innerHTML = okIcon; else rpbCell.innerHTML = noIcon;
					}
					// World Buffs
					if (wbCell) {
						if (data && data.world_buffs && data.world_buffs.status === 'completed') wbCell.innerHTML = okIcon; else wbCell.innerHTML = noIcon;
					}
					// Damage/Heal (via log_data)
					if (dhCell) {
						try {
							const r = await fetch(`/api/log-data/${ev.id}`);
							if (r.ok) {
								const j = await r.json();
								dhCell.innerHTML = (j && j.hasData) ? okIcon : noIcon;
							} else {
								dhCell.innerHTML = noIcon;
							}
						} catch(_) {
							dhCell.innerHTML = noIcon;
						}
					}
				}, i * 100);
			});
		} catch (err){
			console.error('Failed to load history:', err);
			tbody.innerHTML = '<tr><td colspan="7" style="padding:12px;">Failed to load data.</td></tr>';
		}
	}

	async function refreshHistory(){
		const btn = document.getElementById('refresh-history-btn');
		const status = document.getElementById('history-refresh-status');
		if (btn) btn.disabled = true;
		if (status) { status.textContent = 'Refreshing…'; status.className = 'refresh-status'; }
		try {
			const res = await fetch('/api/events/historic-24m/refresh', { method: 'POST' });
			if (!res.ok) {
				const data = await res.json().catch(()=>({}));
				throw new Error(data.message || `HTTP ${res.status}`);
			}
			if (status) { status.textContent = 'Refreshed!'; status.className = 'refresh-status success'; }
			await loadHistory();
			setTimeout(()=>{ if (status) { status.textContent = ''; status.className = 'refresh-status'; } }, 2500);
		} catch (e){
			if (status) { status.textContent = e.message || 'Failed to refresh'; status.className = 'refresh-status error'; }
		} finally {
			if (btn) btn.disabled = false;
		}
	}

	document.addEventListener('DOMContentLoaded', () => {
		loadHistory();
		const btn = document.getElementById('refresh-history-btn');
		if (btn) btn.addEventListener('click', refreshHistory);
	});
})();


