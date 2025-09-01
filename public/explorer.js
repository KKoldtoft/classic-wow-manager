function getActiveEventId() {
    try {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('event');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    } catch {}
    const fromLs = localStorage.getItem('activeEventSession');
    return fromLs || '';
}

function formatNumber(n){
    try { const v = Number(n)||0; return v.toLocaleString('en-US'); } catch { return String(n||0); }
}

async function loadSummaries(eventId){
    const raidMetaEl = document.getElementById('raid-summary-meta');
    const raidTableEl = document.getElementById('raid-summary-table');
    const playersTableEl = document.getElementById('players-summary-table');
    raidMetaEl.textContent = 'Loading...';
    raidTableEl.innerHTML = '';
    playersTableEl.innerHTML = '';

    try {
        const [raidResp, playersResp, fightsResp, deathsResp, abilitiesResp, targetsResp, rawPagesResp, rawMetaResp] = await Promise.all([
            fetch(`/api/wcl/summary/raid/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/summary/players/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/summary/fights/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/summary/deaths/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/summary/abilities/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/summary/targets/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/raw/event-pages/${encodeURIComponent(eventId)}`),
            fetch(`/api/wcl/raw/report-meta/${encodeURIComponent(eventId)}`)
        ]);
        const raid = await raidResp.json();
        const players = await playersResp.json();
        const fights = await fightsResp.json();
        const deaths = await deathsResp.json();
        const abilities = await abilitiesResp.json();
        const targets = await targetsResp.json();
        if (!raid.ok) throw new Error(raid.error||'Failed raid summary');
        if (!players.ok) throw new Error(players.error||'Failed players summary');
        if (!fights.ok) throw new Error(fights.error||'Failed fights summary');
        if (!deaths.ok) throw new Error(deaths.error||'Failed deaths summary');
        if (!abilities.ok) throw new Error(abilities.error||'Failed abilities summary');
        if (!targets.ok) throw new Error(targets.error||'Failed targets summary');
        const rawPages = await rawPagesResp.json();
        const rawMeta = await rawMetaResp.json();

        const durationMin = raid.timeRange && (Math.max(0, (raid.timeRange.max - raid.timeRange.min)) / 60000);
        raidMetaEl.textContent = `Report ${raid.reportCode||'-'} • Events: ${formatNumber(raid.totalEvents)} • Duration: ${durationMin?durationMin.toFixed(1):'0.0'} min`;

        // Raid totals by source table
        const rows = Object.entries(raid.bySource||{}).map(([name, rec])=>({name, dmg: rec.dmg||0, heal: rec.heal||0, deaths: rec.deaths||0}));
        rows.sort((a,b)=> (b.dmg+b.heal) - (a.dmg+a.heal));
        let html = '<table class="data-table"><thead><tr><th>Player</th><th>Damage</th><th>Healing</th><th>Deaths</th></tr></thead><tbody>';
        rows.forEach(r=>{
            html += `<tr><td>${r.name}</td><td>${formatNumber(r.dmg)}</td><td>${formatNumber(r.heal)}</td><td>${r.deaths}</td></tr>`;
        });
        html += '</tbody></table>';
        raidTableEl.innerHTML = html;

        // Players summary table (duplicates but ensures both endpoints wired)
        const rows2 = Object.entries(players.players||{}).map(([name, rec])=>({name, dmg: rec.dmg||0, heal: rec.heal||0, deaths: rec.deaths||0}));
        rows2.sort((a,b)=> (b.dmg+b.heal) - (a.dmg+a.heal));
        let html2 = '<table class="data-table"><thead><tr><th>Player</th><th>Damage</th><th>Healing</th><th>Deaths</th></tr></thead><tbody>';
        rows2.forEach(r=>{
            html2 += `<tr><td>${r.name}</td><td>${formatNumber(r.dmg)}</td><td>${formatNumber(r.heal)}</td><td>${r.deaths}</td></tr>`;
        });
        html2 += '</tbody></table>';
        playersTableEl.innerHTML = html2;

        // Append extended sections
        const content = document.querySelector('.content');

        // Fights section
        let fightsEl = document.getElementById('fights-summary');
        if (!fightsEl) {
            fightsEl = document.createElement('section');
            fightsEl.id = 'fights-summary';
            fightsEl.style.marginTop = '24px';
            content.appendChild(fightsEl);
        }
        let fhtml = '<h2 style="margin-bottom:8px;">Fights</h2>';
        fhtml += '<table class="data-table"><thead><tr><th>Fight</th><th>Kill</th><th>Duration</th></tr></thead><tbody>';
        (fights.fights||[]).forEach(f=>{
            const dur = f.durationMs ? (f.durationMs/1000).toFixed(1)+'s' : '-';
            fhtml += `<tr><td>${f.name}</td><td>${f.kill?'Yes':'No'}</td><td>${dur}</td></tr>`;
        });
        fhtml += '</tbody></table>';
        fightsEl.innerHTML = fhtml;

        // Deaths section
        let deathsEl = document.getElementById('deaths-summary');
        if (!deathsEl) {
            deathsEl = document.createElement('section');
            deathsEl.id = 'deaths-summary';
            deathsEl.style.marginTop = '24px';
            content.appendChild(deathsEl);
        }
        const deathRows = Object.entries(deaths.totals||{}).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
        let dhtml = '<h2 style="margin-bottom:8px;">Deaths</h2>';
        dhtml += '<table class="data-table"><thead><tr><th>Player</th><th>Deaths</th></tr></thead><tbody>';
        deathRows.forEach(r=>{ dhtml += `<tr><td>${r.name}</td><td>${r.total}</td></tr>`; });
        dhtml += '</tbody></table>';
        deathsEl.innerHTML = dhtml;

        // Abilities section
        let abEl = document.getElementById('abilities-summary');
        if (!abEl) {
            abEl = document.createElement('section');
            abEl.id = 'abilities-summary';
            abEl.style.marginTop = '24px';
            content.appendChild(abEl);
        }
        let ahtml = '<h2 style="margin-bottom:8px;">Abilities</h2>';
        ahtml += '<h3 style="margin:8px 0;">Damage</h3>';
        ahtml += '<table class="data-table"><thead><tr><th>Ability</th><th>Total</th><th>Hits</th></tr></thead><tbody>';
        (abilities.damage||[]).slice(0,50).forEach(r=>{ ahtml += `<tr><td>${r.ability}</td><td>${formatNumber(r.total)}</td><td>${r.hits}</td></tr>`; });
        ahtml += '</tbody></table>';
        ahtml += '<h3 style="margin:8px 0;">Healing</h3>';
        ahtml += '<table class="data-table"><thead><tr><th>Ability</th><th>Total</th><th>Hits</th></tr></thead><tbody>';
        (abilities.healing||[]).slice(0,50).forEach(r=>{ ahtml += `<tr><td>${r.ability}</td><td>${formatNumber(r.total)}</td><td>${r.hits}</td></tr>`; });
        ahtml += '</tbody></table>';
        abEl.innerHTML = ahtml;

        // Targets section
        let tgtEl = document.getElementById('targets-summary');
        if (!tgtEl) {
            tgtEl = document.createElement('section');
            tgtEl.id = 'targets-summary';
            tgtEl.style.marginTop = '24px';
            content.appendChild(tgtEl);
        }
        let thtml = '<h2 style="margin-bottom:8px;">Targets</h2>';
        thtml += '<h3 style="margin:8px 0;">Damage To</h3>';
        thtml += '<table class="data-table"><thead><tr><th>Target</th><th>Total</th></tr></thead><tbody>';
        (targets.damage||[]).slice(0,50).forEach(r=>{ thtml += `<tr><td>${r.name}</td><td>${formatNumber(r.total)}</td></tr>`; });
        thtml += '</tbody></table>';
        thtml += '<h3 style="margin:8px 0;">Healing On</h3>';
        thtml += '<table class="data-table"><thead><tr><th>Target</th><th>Total</th></tr></thead><tbody>';
        (targets.healing||[]).slice(0,50).forEach(r=>{ thtml += `<tr><td>${r.name}</td><td>${formatNumber(r.total)}</td></tr>`; });
        thtml += '</tbody></table>';
        tgtEl.innerHTML = thtml;

        // RAW dumps section
        let rawEl = document.getElementById('raw-dumps');
        if (!rawEl) {
            rawEl = document.createElement('section');
            rawEl.id = 'raw-dumps';
            rawEl.style.marginTop = '24px';
            content.appendChild(rawEl);
        }
        let rhtml = '<h2 style="margin-bottom:8px;">Raw Data (Database)</h2>';
        rhtml += '<h3 style="margin:8px 0;">wcl_event_pages</h3>';
        rhtml += `<div class="endpoint-data-scroll" style="max-height:300px; overflow:auto; background:#111; padding:8px; border:1px solid #333;"><pre>${escapeHtml(JSON.stringify(rawPages, null, 2))}</pre></div>`;
        rhtml += '<h3 style="margin:8px 0;">wcl_report_meta</h3>';
        rhtml += `<div class="endpoint-data-scroll" style="max-height:300px; overflow:auto; background:#111; padding:8px; border:1px solid #333;"><pre>${escapeHtml(JSON.stringify(rawMeta, null, 2))}</pre></div>`;
        rawEl.innerHTML = rhtml;
    } catch (err) {
        raidMetaEl.textContent = `Error: ${err && err.message ? err.message : String(err)}`;
    }
}

function escapeHtml(str){
    return String(str||'')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
    const eventInput = document.getElementById('explorer-event-id');
    const loadBtn = document.getElementById('explorer-load-btn');
    const active = getActiveEventId();
    if (active) eventInput.value = active;
    loadBtn.addEventListener('click', ()=>{
        const ev = (eventInput.value||'').trim();
        if (!ev) return;
        loadSummaries(ev);
    });
    if (eventInput.value) loadSummaries(eventInput.value);
});


