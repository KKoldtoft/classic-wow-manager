(function StatsPage() {
    let fullItems = [];
    async function fetchUser() {
        try { const r = await fetch('/user'); return r.ok ? r.json() : { loggedIn:false }; } catch { return { loggedIn:false }; }
    }

    function showAuthGate() {
        // Reuse raidlogs auth gate style in a lightweight inline element if needed in future
        const container = document.querySelector('#top-item-chart');
        if (container) container.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-lock"></i><h3>Log in to view stats</h3><p>Please sign in with Discord.</p></div></div>';
    }

    function formatCurrency(v) { try { return new Intl.NumberFormat('en-US').format(v); } catch { return String(v); } }

    function buildSeries(items) {
        // items: [{ itemKey, itemName, iconLink, wowheadLink, maxPrice, points:[{x,y,eventId,channelName,playerName}]}]
        const palette = [
            '#00E396','#FEB019','#FF4560','#775DD0','#3F51B5','#546E7A','#D4526E','#8D5B4C','#F86624','#2E294E',
            '#16A34A','#DB2777','#0EA5E9','#A855F7','#F59E0B'
        ];
        return items.map((it, idx) => ({
            name: it.itemName,
            data: it.points.map(p => ({ x: p.x, y: p.y, meta: { item: it, point: p } })),
            color: palette[idx % palette.length]
        }));
    }

    function renderList(items) {
        const list = document.getElementById('top-item-list');
        if (!list) return;
        list.innerHTML = '';
        items.forEach((it, idx) => {
            const avg = it.points.length ? Math.round(it.points.reduce((a,b)=>a + (Number(b.y)||0),0) / it.points.length) : 0;
            const buyers = Array.from(new Set(it.points.map(p => p.playerName).filter(Boolean))).join(', ');
            const div = document.createElement('div');
            div.className = 'hall-of-fame-item';
            div.dataset.seriesIndex = String(idx);
            div.innerHTML = `
                <div class="hall-of-fame-content">
                    <img src="${it.iconLink || ''}" alt="" class="item-icon-small item-icon-large" style="width:54px;height:54px;margin-right:10px;border-radius:6px;${it.iconLink? '' : 'display:none;'}">
                    <div class="hall-of-fame-details">
                        <div class="hall-of-fame-item-name" style="color:#a335ee;">
                            ${it.wowheadLink ? `<a href="${it.wowheadLink}" target="_blank" rel="noopener noreferrer">${it.itemName}</a>` : it.itemName}
                        </div>
                        <div class="hall-of-fame-price" style="color:#FFD700;">${avg}g (average price)</div>
                        <div class="hall-of-fame-info">${buyers || ''}</div>
                    </div>
                </div>
            `;
            div.addEventListener('mouseenter', () => emphasizeSeries(idx));
            div.addEventListener('mouseleave', () => resetEmphasis());
            list.appendChild(div);
        });
    }

    function renderChart(items) {
        const el = document.querySelector('#top-item-chart');
        if (!el) return;

        const series = buildSeries(items);
        const options = {
            chart: {
                type: 'line',
                height: 520,
                foreColor: '#e0e0e0',
                background: '#1e1e1e',
                toolbar: { show: true },
                zoom: { enabled: true }
            },
            theme: { mode: 'dark' },
            stroke: { width: 3, curve: 'straight' },
            grid: { borderColor: '#333' },
            legend: { show: false },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false,
                    style: { colors: '#a0a0a0' }
                }
            },
            yaxis: {
                labels: {
                    formatter: (val) => `${formatCurrency(Math.round(val))}g`,
                    style: { colors: '#a0a0a0' }
                }
            },
            tooltip: {
                shared: false,
                intersect: true,
                theme: 'dark',
                x: { format: 'dd MMM yyyy HH:mm' },
                y: {
                    formatter: (val, opts) => `${formatCurrency(Math.round(val))} gold`
                },
                custom: ({ seriesIndex, dataPointIndex, w }) => {
                    try {
                        const d = w.config.series[seriesIndex].data[dataPointIndex];
                        const meta = d && d.meta;
                        if (!meta) return undefined;
                        const item = meta.item; const p = meta.point;
                        const icon = item.iconLink ? `<img src="${item.iconLink}" alt="" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;border-radius:3px;">` : '';
                        const name = item.wowheadLink ? `<a href="${item.wowheadLink}" target="_blank" rel="noopener noreferrer">${item.itemName}</a>` : item.itemName;
                        const buyer = p.playerName ? `Buyer: ${p.playerName}` : '';
                        const channel = p.channelName ? `Channel: ${p.channelName}` : '';
                        return `<div class="apexcharts-tooltip-dark" style="padding:10px 12px;">
                            <div>${icon}<strong>${name}</strong></div>
                            <div style="margin-top:4px;">${formatCurrency(p.y)} gold</div>
                            <div style="margin-top:4px; font-size:12px; opacity:.85;">${buyer}</div>
                            <div style="font-size:12px; opacity:.85;">${channel}</div>
                        </div>`;
                    } catch { return undefined; }
                }
            },
            markers: { size: 4 },
            series
        };

        const chart = new ApexCharts(el, options);
        chart.render();
        window.__statsChart = chart; // expose for hover highlighting
    }

    function emphasizeSeries(activeIdx) {
        const chart = window.__statsChart;
        if (!chart || !chart.w || !chart.w.globals || !chart.w.globals.dom) return;
        const total = (chart.w.config.series || []).length;
        for (let i = 0; i < total; i++) {
            const opacity = i === activeIdx ? 1 : 0.15;
            try {
                const paths = chart.w.globals.dom.baseEl.querySelectorAll(`.apexcharts-series[data\\:realIndex="${i}"] path`);
                paths.forEach(n => n.style.opacity = String(opacity));
                const markers = chart.w.globals.dom.baseEl.querySelectorAll(`
                    .apexcharts-series[data\\:realIndex="${i}"] .apexcharts-marker,
                    .apexcharts-series[data\\:realIndex="${i}"] circle.apexcharts-marker
                `);
                markers.forEach(n => n.style.opacity = String(opacity));
            } catch {}
        }
    }

    function resetEmphasis() {
        const chart = window.__statsChart;
        if (!chart || !chart.w || !chart.w.globals || !chart.w.globals.dom) return;
        const total = (chart.w.config.series || []).length;
        for (let i = 0; i < total; i++) {
            try {
                const paths = chart.w.globals.dom.baseEl.querySelectorAll(`.apexcharts-series[data\\:realIndex="${i}"] path`);
                paths.forEach(n => n.style.opacity = '1');
                const markers = chart.w.globals.dom.baseEl.querySelectorAll(`
                    .apexcharts-series[data\\:realIndex="${i}"] .apexcharts-marker,
                    .apexcharts-series[data\\:realIndex="${i}"] circle.apexcharts-marker
                `);
                markers.forEach(n => n.style.opacity = '1');
            } catch {}
        }
    }

    async function load() {
        const user = await fetchUser();
        if (!user || !user.loggedIn) { showAuthGate(); return; }

        try {
            const r = await fetch('/api/stats/top-item-price-history');
            const j = await r.json();
            if (!r.ok || !j || !j.success) throw new Error(j && j.message || 'Failed to load');
            const items = Array.isArray(j.items) ? j.items : [];
            if (items.length === 0) {
                const el = document.querySelector('#top-item-chart');
                if (el) el.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-chart-line"></i><h3>No data</h3><p>No loot sales found.</p></div></div>';
                return;
            }
            fullItems = items;
            wireControls();
            applyFiltersAndRender();
            await loadGoldpots();
            await loadT3Averages();
            await Promise.all([
                loadRaidClassRace(),
                loadGuildClassRace()
            ]);
            await loadAvgGoldpotByClass();
        } catch (e) {
            const el = document.querySelector('#top-item-chart');
            if (el) el.innerHTML = `<div class="error-display"><div class="error-content"><h3>Error</h3><p>${(e && e.message) || 'Failed to load stats'}</p></div></div>`;
        }
    }

    function wireControls() {
        const hide = document.getElementById('hideOver100k');
        if (hide) hide.addEventListener('change', applyFiltersAndRender);
    }

    function applyFiltersAndRender() {
        const hide = document.getElementById('hideOver100k');
        const over = hide && hide.checked;
        let items = fullItems.slice();
        if (over) {
            items = items.filter(it => {
                const avg = it.points.length ? (it.points.reduce((a,b)=>a + (Number(b.y)||0),0) / it.points.length) : 0;
                return avg <= 100000;
            });
        }
        // Clear chart containers
        const chartEl = document.getElementById('top-item-chart');
        if (chartEl) chartEl.innerHTML = '';
        renderList(items);
        renderChart(items);
    }

    function renderGoldpotList(series) {
        const list = document.getElementById('goldpot-list');
        if (!list) return;
        list.innerHTML = '';
        const colors = ['#f59e0b','#10b981','#60a5fa'];
        series.forEach((s, idx) => {
            const avg = s.points.length ? Math.round(s.points.reduce((a,b)=>a + (Number(b.y)||0),0) / s.points.length) : 0;
            const div = document.createElement('div');
            div.className = 'hall-of-fame-item';
            div.dataset.seriesIndex = String(idx);
            div.innerHTML = `
                <div class="hall-of-fame-content">
                    <div class="item-icon-small item-icon-large" style="width:54px;height:54px;margin-right:10px;border-radius:6px;background:${colors[idx%colors.length]};"></div>
                    <div class="hall-of-fame-details">
                        <div class="hall-of-fame-item-name" style="color:#a335ee;">${s.name}</div>
                        <div class="hall-of-fame-price" style="color:#FFD700;">${avg}g (average size)</div>
                        <div class="hall-of-fame-info">${s.points.length} events</div>
                    </div>
                </div>
            `;
            div.addEventListener('mouseenter', () => emphasizeGoldSeries(idx));
            div.addEventListener('mouseleave', () => resetGoldEmphasis());
            list.appendChild(div);
        });
    }

    function renderGoldpotChart(series) {
        const el = document.getElementById('goldpot-chart');
        if (!el) return;
        const colors = ['#f59e0b','#10b981','#60a5fa'];
        const apexSeries = series.map((s, i) => ({ name: s.name, data: s.points, color: colors[i%colors.length] }));
        const chart = new ApexCharts(el, {
            chart: { type: 'line', height: 520, foreColor: '#e0e0e0', background: '#1e1e1e', toolbar: { show: true }, zoom: { enabled: true } },
            theme: { mode: 'dark' },
            stroke: { width: 3, curve: 'straight' },
            grid: { borderColor: '#333' },
            legend: { show: false },
            xaxis: { type: 'datetime', labels: { datetimeUTC: false, style: { colors: '#a0a0a0' } } },
            yaxis: { labels: { formatter: (v)=>`${formatCurrency(Math.round(v))}g`, style: { colors: '#a0a0a0' } } },
            markers: { size: 4 },
            tooltip: { theme: 'dark', x: { format: 'dd MMM yyyy HH:mm' }, y: { formatter: (v)=>`${formatCurrency(Math.round(v))} gold` } },
            series: apexSeries
        });
        chart.render();
        window.__goldChart = chart;
    }

    function emphasizeGoldSeries(activeIdx) {
        const chart = window.__goldChart;
        if (!chart || !chart.w || !chart.w.globals || !chart.w.globals.dom) return;
        const total = (chart.w.config.series || []).length;
        for (let i = 0; i < total; i++) {
            const opacity = i === activeIdx ? 1 : 0.15;
            try {
                const paths = chart.w.globals.dom.baseEl.querySelectorAll(`.apexcharts-series[data\\:realIndex="${i}"] path`);
                paths.forEach(n => n.style.opacity = String(opacity));
                const markers = chart.w.globals.dom.baseEl.querySelectorAll(`.apexcharts-series[data\\:realIndex="${i}"] .apexcharts-marker, .apexcharts-series[data\\:realIndex="${i}"] circle.apexcharts-marker`);
                markers.forEach(n => n.style.opacity = String(opacity));
            } catch {}
        }
    }

    function resetGoldEmphasis() {
        const chart = window.__goldChart;
        if (!chart || !chart.w || !chart.w.globals || !chart.w.globals.dom) return;
        const total = (chart.w.config.series || []).length;
        for (let i = 0; i < total; i++) {
            try {
                const paths = chart.w.globals.dom.baseEl.querySelectorAll(`.apexcharts-series[data\\:realIndex="${i}"] path`);
                paths.forEach(n => n.style.opacity = '1');
                const markers = chart.w.globals.dom.baseEl.querySelectorAll(`.apexcharts-series[data\\:realIndex="${i}"] .apexcharts-marker, .apexcharts-series[data\\:realIndex="${i}"] circle.apexcharts-marker`);
                markers.forEach(n => n.style.opacity = '1');
            } catch {}
        }
    }

    async function loadGoldpots() {
        try {
            const r = await fetch('/api/stats/goldpot-history');
            const j = await r.json();
            if (!r.ok || !j || !j.success) throw new Error(j && j.message || 'Failed to load gold pots');
            const series = Array.isArray(j.series) ? j.series : [];
            renderGoldpotList(series);
            renderGoldpotChart(series);
        } catch (e) {
            const el = document.getElementById('goldpot-chart');
            if (el) el.innerHTML = `<div class="error-display"><div class=\"error-content\"><h3>Error</h3><p>${(e && e.message) || 'Failed to load gold pots'}</p></div></div>`;
        }
    }

    function classColor(cls) {
        const map = { warrior:'#C79C6E', paladin:'#F58CBA', hunter:'#ABD473', rogue:'#FFF569', priest:'#FFFFFF', shaman:'#0070DE', mage:'#69CCF0', warlock:'#9482C9', druid:'#FF7D0A' };
        return map[cls] || '#a0a0a0';
    }

    function classIconUrl(cls) {
        const map = {
            warrior: 'https://wow.zamimg.com/images/wow/icons/large/classicon_warrior.jpg',
            paladin: 'https://wow.zamimg.com/images/wow/icons/large/classicon_paladin.jpg',
            hunter: 'https://wow.zamimg.com/images/wow/icons/large/classicon_hunter.jpg',
            rogue: 'https://wow.zamimg.com/images/wow/icons/large/classicon_rogue.jpg',
            priest: 'https://wow.zamimg.com/images/wow/icons/large/classicon_priest.jpg',
            shaman: 'https://wow.zamimg.com/images/wow/icons/large/classicon_shaman.jpg',
            mage: 'https://wow.zamimg.com/images/wow/icons/large/classicon_mage.jpg',
            warlock: 'https://wow.zamimg.com/images/wow/icons/large/classicon_warlock.jpg',
            druid: 'https://wow.zamimg.com/images/wow/icons/large/classicon_druid.jpg'
        };
        return map[cls] || '';
    }

    function raceColor(race) {
        const map = {
            human: '#64B5F6',
            dwarf: '#FFB74D',
            'night elf': '#BA68C8',
            gnome: '#FF8A80',
            orc: '#66BB6A',
            undead: '#90A4AE',
            tauren: '#A1887F',
            troll: '#26C6DA',
            'blood elf': '#F06292',
            'draenei': '#4DD0E1',
            'worgen': '#9575CD',
            'goblin': '#AED581',
            unknown: '#9E9E9E'
        };
        const key = String(race || '').toLowerCase();
        return map[key] || '#9E9E9E';
    }

    function renderPieChart(elId, labels, values, colors, titleText) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (!values || values.reduce((a,b)=>a+(Number(b)||0),0) === 0) {
            el.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-chart-pie"></i><h3>No data</h3></div></div>';
            return;
        }
        const chart = new ApexCharts(el, {
            chart: { type: 'pie', height: 440, foreColor: '#e0e0e0', background: '#1e1e1e', dropShadow: { enabled: true, top: 0, left: 0, blur: 4, color: '#000', opacity: 0.35 } },
            theme: { mode: 'dark' },
            labels,
            series: values,
            colors,
            stroke: { show: true, width: 3, colors: ['#000000'], lineCap: 'round' },
            fill: { opacity: 0.98 },
            legend: { position: 'bottom', markers: { width: 12, height: 12, radius: 12, strokeColor: '#000000', strokeWidth: 2 } },
            dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%` },
            tooltip: { theme: 'dark', fillSeriesColor: false, y: { formatter: (v)=> String(v) } },
            title: titleText ? { text: titleText, align: 'center', style: { color: '#c8c8c8' } } : undefined
        });
        chart.render();
        return chart;
    }

    function normalizeCountsToArrays(countsObj, preferredOrder = [], allowedKeys = null) {
        let entries = Object.entries(countsObj || {}).filter(([,v]) => Number(v) > 0);
        if (allowedKeys && allowedKeys.length) {
            const allowed = new Set(allowedKeys.map(k => String(k).toLowerCase()));
            entries = entries.filter(([k]) => allowed.has(String(k).toLowerCase()));
        }
        const orderMap = new Map(preferredOrder.map((k,i)=>[k,i]));
        entries.sort((a,b)=>{
            const ak = String(a[0]); const bk = String(b[0]);
            const ai = orderMap.has(ak) ? orderMap.get(ak) : Number.MAX_SAFE_INTEGER;
            const bi = orderMap.has(bk) ? orderMap.get(bk) : Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return String(ak).localeCompare(String(bk));
        });
        const labels = entries.map(([k])=>k.replace(/\b\w/g, c=>c.toUpperCase()));
        const values = entries.map(([,v])=>Number(v)||0);
        return { labels, values };
    }

    async function loadRaidClassRace() {
        try {
            const r = await fetch('/api/stats/raid-class-race');
            const j = await r.json();
            if (!r.ok || !j || !j.success) throw new Error(j && j.message || 'Failed to load raid class/race');
            const classOrder = ['warrior','paladin','shaman','rogue','hunter','druid','mage','priest','warlock'];
            const { labels: classLabels, values: classValues } = normalizeCountsToArrays(j.classCounts, classOrder, classOrder);
            const classColors = classLabels.map(l => classColor(String(l).toLowerCase()));
            renderPieChart('raid-class-pie', classLabels, classValues, classColors, 'By class');

            const raceCounts = j.raceCounts || {};
            const classicRaces = ['human','dwarf','night elf','gnome','orc','undead','tauren','troll'];
            const { labels: raceLabels, values: raceValues } = normalizeCountsToArrays(raceCounts, classicRaces, classicRaces);
            const raceColors = raceLabels.map(l => raceColor(l));
            renderPieChart('raid-race-pie', raceLabels, raceValues, raceColors, 'By race');
        } catch (e) {
            const lc = document.getElementById('raid-class-pie');
            const lr = document.getElementById('raid-race-pie');
            const msg = `<div class="error-display"><div class="error-content"><h3>Error</h3><p>${(e && e.message) || 'Failed to load raid class & race'}</p></div></div>`;
            if (lc) lc.innerHTML = msg;
            if (lr) lr.innerHTML = msg;
        }
    }

    async function loadGuildClassRace() {
        try {
            const r = await fetch('/api/guild-members');
            const j = await r.json();
            if (!r.ok || !j || !j.success) throw new Error(j && j.message || 'Failed to load guild members');
            const members = Array.isArray(j.members) ? j.members : [];
            const classCounts = {};
            const raceCounts = {};
            for (const m of members) {
                const cls = String(m.class || m.character_class || '').toLowerCase();
                const race = String(m.race || '').toLowerCase() || 'unknown';
                if (cls) classCounts[cls] = (classCounts[cls]||0)+1;
                if (race) raceCounts[race] = (raceCounts[race]||0)+1;
            }
            const classOrder = ['warrior','paladin','shaman','rogue','hunter','druid','mage','priest','warlock'];
            const { labels: classLabels, values: classValues } = normalizeCountsToArrays(classCounts, classOrder, classOrder);
            const classColors = classLabels.map(l => classColor(String(l).toLowerCase()));
            renderPieChart('guild-class-pie', classLabels, classValues, classColors, 'By class');

            const { labels: raceLabels, values: raceValues } = normalizeCountsToArrays(raceCounts);
            const raceColors = raceLabels.map(l => raceColor(l));
            renderPieChart('guild-race-pie', raceLabels, raceValues, raceColors, 'By race');
        } catch (e) {
            const lc = document.getElementById('guild-class-pie');
            const lr = document.getElementById('guild-race-pie');
            const msg = `<div class="error-display"><div class="error-content"><h3>Error</h3><p>${(e && e.message) || 'Failed to load guild class & race'}</p></div></div>`;
            if (lc) lc.innerHTML = msg;
            if (lr) lr.innerHTML = msg;
        }
    }

    async function loadAvgGoldpotByClass() {
        const el = document.getElementById('avg-goldpot-by-class-chart');
        if (!el) return;
        try {
            // Use last 10 tracked events from goldpot history
            const ghRes = await fetch('/api/stats/goldpot-history');
            const gh = await ghRes.json();
            if (!ghRes.ok || !gh || !gh.success) throw new Error('Failed to load goldpot history');
            const points = [];
            (Array.isArray(gh.series) ? gh.series : []).forEach(s => (s.points || []).forEach(p => { if (p && p.eventId && p.x) points.push({ id: p.eventId, x: p.x }); }));
            points.sort((a,b)=>a.x-b.x);
            const seen = new Set();
            const orderedEventIds = [];
            for (const p of points) { const id = String(p.id); if (!seen.has(id)) { seen.add(id); orderedEventIds.push(id); } }
            const recentEventIds = orderedEventIds.slice(-10);
            if (recentEventIds.length === 0) { el.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-chart-bar"></i><h3>No data</h3></div></div>'; return; }

            async function computeClassAvgForEvent(eventId) {
                // Fetch datasets for one event
                const endpoints = [
                    [`/api/log-data/${eventId}`, 'logData'],
                    ['/api/reward-settings', 'rewardSettings'],
                    [`/api/abilities-data/${eventId}`, 'abilitiesData'],
                    [`/api/mana-potions-data/${eventId}`, 'manaPotionsData'],
                    [`/api/runes-data/${eventId}`, 'runesData'],
                    [`/api/windfury-data/${eventId}`, 'windfuryData'],
                    [`/api/interrupts-data/${eventId}`, 'interruptsData'],
                    [`/api/disarms-data/${eventId}`, 'disarmsData'],
                    [`/api/sunder-data/${eventId}`, 'sunderData'],
                    [`/api/curse-data/${eventId}`, 'curseData'],
                    [`/api/curse-shadow-data/${eventId}`, 'curseShadowData'],
                    [`/api/curse-elements-data/${eventId}`, 'curseElementsData'],
                    [`/api/faerie-fire-data/${eventId}`, 'faerieFireData'],
                    [`/api/scorch-data/${eventId}`, 'scorchData'],
                    [`/api/demo-shout-data/${eventId}`, 'demoShoutData'],
                    [`/api/polymorph-data/${eventId}`, 'polymorphData'],
                    [`/api/power-infusion-data/${eventId}`, 'powerInfusionData'],
                    [`/api/decurses-data/${eventId}`, 'decursesData'],
                    [`/api/frost-resistance-data/${eventId}`, 'frostResistanceData'],
                    [`/api/world-buffs-data/${eventId}`, 'worldBuffsData'],
                    [`/api/void-damage/${eventId}`, 'voidDamageData'],
                    [`/api/manual-rewards/${eventId}`, 'manualRewardsData'],
                    [`/api/player-streaks/${eventId}`, 'playerStreaks'],
                    [`/api/guild-members/${eventId}`, 'guildMembers'],
                    [`/api/player-role-mapping/${eventId}/primary-roles`, 'primaryRoles']
                ];
                const fetches = await Promise.all(endpoints.map(([url]) => fetch(url).catch(()=>null)));
                const ds = { datasets: {}, primaryRoles: null };
                for (let i = 0; i < endpoints.length; i++) {
                    const key = endpoints[i][1]; const resp = fetches[i];
                    try {
                        if (resp && resp.ok) {
                            const json = await resp.json();
                            if (key === 'logData') ds.logData = json.data || [];
                            else if (key === 'rewardSettings') ds.rewardSettings = json.settings || {};
                            else if (key === 'primaryRoles') ds.primaryRoles = json.primaryRoles || null;
                            else ds.datasets[key] = json.data || [];
                        } else { if (key !== 'primaryRoles') ds.datasets[key] = []; }
                    } catch { if (key !== 'primaryRoles') ds.datasets[key] = []; }
                }
                const gpRes = await fetch(`/api/event-goldpot/${eventId}`);
                const gp = await gpRes.json();
                const totalGold = gp && gp.success ? Number(gp.goldPot) || 0 : 0;
                const baseShared = Math.floor(totalGold * 0.85);
                const manualGold = (ds.datasets.manualRewardsData || []).reduce((acc, e) => {
                    const isGold = !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description || ''))));
                    return isGold ? acc + (Number(e.points) || 0) : acc;
                }, 0);
                const sharedAdjusted = Math.max(0, baseShared - manualGold);

                const lower = s => String(s || '').toLowerCase();
                const players = new Map();
                (ds.logData || []).forEach(p => { if (!p || !p.character_name) return; const k=lower(p.character_name); if (!players.has(k)) players.set(k, { name:p.character_name, class:String(p.character_class||'').toLowerCase(), points:0, gold:0 }); });
                if (players.size === 0) return null;
                players.forEach(v => { v.points += 100; });

                const damagePoints = ds.rewardSettings?.damage?.points_array || [];
                const damageSorted = (ds.logData || [])
                    .filter(p => (parseInt(p.damage_amount) || 0) > 0 && ((String(p.role_detected || '').toLowerCase() === 'dps') || (String(p.role_detected || '').toLowerCase() === 'tank')))
                    .sort((a, b) => (parseInt(b.damage_amount) || 0) - (parseInt(a.damage_amount) || 0));
                damageSorted.forEach((p, idx) => { const pts = idx < damagePoints.length ? (damagePoints[idx] || 0) : 0; if (!pts) return; const v=players.get(lower(p.character_name)); if (v) v.points += pts; });
                const healingPoints = ds.rewardSettings?.healing?.points_array || [];
                const healers = (ds.logData || [])
                    .filter(p => (parseInt(p.healing_amount) || 0) > 0 && (String(p.role_detected || '').toLowerCase() === 'healer'))
                    .sort((a, b) => (parseInt(b.healing_amount) || 0) - (parseInt(a.healing_amount) || 0));
                healers.forEach((p, idx) => { const pts = idx < healingPoints.length ? (healingPoints[idx] || 0) : 0; if (!pts) return; const v=players.get(lower(p.character_name)); if (v) v.points += pts; });

                const addFrom = (arr) => { (arr || []).forEach(row => { const k=lower(row.character_name || row.player_name); const v=players.get(k); if(!v) return; const pts=Number(row.points)||0; if(pts) v.points += pts; }); };
                addFrom(ds.datasets.abilitiesData);
                addFrom(ds.datasets.manaPotionsData);
                addFrom(ds.datasets.runesData);
                addFrom(ds.datasets.interruptsData);
                addFrom(ds.datasets.disarmsData);
                if (ds.primaryRoles) { (ds.datasets.sunderData||[]).forEach(row=>{ const k=lower(row.character_name||row.player_name); const v=players.get(k); if(!v) return; const pr=String(ds.primaryRoles[k]||'').toLowerCase(); if(pr==='tank') return; const pts=Number(row.points)||0; if(pts) v.points+=pts; }); } else { addFrom(ds.datasets.sunderData); }
                addFrom(ds.datasets.curseData);
                addFrom(ds.datasets.curseShadowData);
                addFrom(ds.datasets.curseElementsData);
                addFrom(ds.datasets.faerieFireData);
                addFrom(ds.datasets.scorchData);
                addFrom(ds.datasets.demoShoutData);
                addFrom(ds.datasets.polymorphData);
                addFrom(ds.datasets.powerInfusionData);
                addFrom(ds.datasets.decursesData);
                if (ds.primaryRoles) { (ds.datasets.frostResistanceData||[]).forEach(row=>{ const k=lower(row.character_name||row.player_name); const v=players.get(k); if(!v) return; const pr=String(ds.primaryRoles[k]||'').toLowerCase(); if(pr!=='dps') return; const pts=Number(row.points)||0; if(pts) v.points+=pts; }); } else { addFrom(ds.datasets.frostResistanceData); }
                addFrom(ds.datasets.worldBuffsData);
                addFrom(ds.datasets.voidDamageData);
                addFrom(ds.datasets.windfuryData);

                (ds.datasets.playerStreaks || []).forEach(row => { const k=lower(row.character_name||''); const v=players.get(k); if(!v) return; const s=Number(row.player_streak)||0; let pts=0; if(s>=8)pts=15; else if(s===7)pts=12; else if(s===6)pts=9; else if(s===5)pts=6; else if(s===4)pts=3; if(pts) v.points += pts; });
                (ds.datasets.guildMembers || []).forEach(row => { const k=lower(row.character_name||''); const v=players.get(k); if(v) v.points += 10; });
                (ds.datasets.manualRewardsData || []).forEach(e=>{ const isGold=!!(e&&(e.is_gold||/\[GOLD\]/i.test(String(e.description||'')))); if(isGold) return; const k=lower(e.player_name||''); const v=players.get(k); if(v) v.points += (Number(e.points)||0); });

                let totalPts = 0; players.forEach(v=>{ totalPts += Math.max(0, v.points); });
                const gpp = (sharedAdjusted>0 && totalPts>0) ? sharedAdjusted/totalPts : 0;
                players.forEach(v=>{ v.gold = Math.floor(Math.max(0, v.points) * gpp); });
                (ds.datasets.manualRewardsData||[]).forEach(e=>{ const isGold=!!(e&&(e.is_gold||/\[GOLD\]/i.test(String(e.description||'')))); if(!isGold) return; const k=lower(e.player_name||''); const v=players.get(k); if(v) v.gold = Math.max(0, (Number(v.gold)||0) + (Number(e.points)||0)); });

                const byClass = new Map(); players.forEach(v=>{ const cls=v.class||'unknown'; if(!byClass.has(cls)) byClass.set(cls,{sum:0,n:0}); const b=byClass.get(cls); b.sum += Number(v.gold)||0; b.n += 1; });
                const out = {}; byClass.forEach((rec, cls)=>{ if(rec.n>0) out[cls] = Math.round(rec.sum/rec.n); });
                return out;
            }

            const perEvent = await Promise.all(recentEventIds.map(id => computeClassAvgForEvent(id)));
            const finalByClass = new Map();
            perEvent.forEach(map => { if(!map) return; Object.keys(map).forEach(cls => { const v=Number(map[cls])||0; if(!v) return; if(!finalByClass.has(cls)) finalByClass.set(cls,{sum:0,n:0}); const rec=finalByClass.get(cls); rec.sum+=v; rec.n+=1; }); });
            const classOrder = ['warrior','paladin','shaman','rogue','hunter','druid','mage','priest','warlock'];
            const data = classOrder
                .map(cls=>{ const rec=finalByClass.get(cls); return { cls, val: rec&&rec.n>0 ? Math.round(rec.sum/rec.n) : 0 }; })
                .filter(d=>d.val>0)
                .sort((a,b)=> b.val - a.val);

            if (data.length === 0) { el.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-chart-bar"></i><h3>No data</h3></div></div>'; return; }

            const labels = data.map(d => d.cls.replace(/\b\w/g, c => c.toUpperCase()));
            const series = [{ name: 'Avg gold per player (last 5 raids)', data: data.map(d => d.val) }];
            const colors = data.map(d => classColor(d.cls));
            const chart = new ApexCharts(el, {
                chart: { type: 'bar', height: 360, foreColor: '#e0e0e0', background: '#1e1e1e', toolbar: { show: false } },
                theme: { mode: 'dark' },
                grid: { borderColor: '#333' },
                plotOptions: { bar: { horizontal: false, columnWidth: '35%', distributed: true } },
                dataLabels: { enabled: false },
                xaxis: { categories: labels, labels: { style: { colors: '#a0a0a0' } } },
                yaxis: { labels: { formatter: (v)=>`${formatCurrency(Math.round(v))}g`, style: { colors: '#a0a0a0' } } },
                tooltip: { theme: 'dark', y: { formatter: (v)=>`${formatCurrency(Math.round(v))} gold` } },
                series,
                colors
            });
            chart.render();
        } catch (e) {
            el.innerHTML = `<div class=\"error-display\"><div class=\"error-content\"><h3>Error</h3><p>${(e && e.message) || 'Failed to load averages'}</p></div></div>`;
        }
    }

    function renderT3GroupSection(groupTitle, tokens, tokenMap, color) {
        const container = document.getElementById('t3-averages-container');
        if (!container) return;
        const section = document.createElement('div');
        section.className = 't3-class-section';
        section.style.padding = '12px';
        section.style.border = '1px solid #2a2a2a';
        section.style.borderRadius = '8px';
        section.style.background = '#151515';

        const title = document.createElement('div');
        title.className = 't3-class-header';
        title.style.margin = '0 0 8px 0';
        title.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;color:${color};font-weight:600;font-size:14px;line-height:18px;">
                <span>${groupTitle}</span>
            </div>
        `;

        const chartEl = document.createElement('div');
        chartEl.className = 'stats-item-chart';
        chartEl.style.height = String(Math.max(280, tokens.length * 32)) + 'px';

        section.appendChild(title);
        section.appendChild(chartEl);
        container.appendChild(section);

        // Categories are tokens with avg price appended
        const categories = tokens.map(t => {
            const rec = tokenMap.get(String(t).toLowerCase());
            const avg = rec ? Math.round(Number(rec.avgPrice) || 0) : 0;
            return `${t} (${formatCurrency(avg)}g)`;
        });
        const maxSalesLen = Math.max(0, ...tokens.map(t => (tokenMap.get(String(t).toLowerCase())?.sales || []).length));
        const series = [];
        // Vibrant, high-contrast palette for dark mode
        const salePalette = ['#FF1744','#FF9100','#FFC400','#00E676','#00B0FF','#651FFF','#D500F9','#FF4081','#40C4FF','#76FF03'];
        for (let i = 0; i < maxSalesLen; i++) {
            series.push({
                name: `Sale ${i+1}`,
                data: tokens.map(t => {
                    const rec = tokenMap.get(String(t).toLowerCase());
                    const arr = (rec && Array.isArray(rec.sales)) ? rec.sales : [];
                    return (i < arr.length) ? Number(arr[i]) || 0 : 0;
                }),
                color: salePalette[i % salePalette.length]
            });
        }

        const chart = new ApexCharts(chartEl, {
            chart: { type: 'bar', height: chartEl.style.height, foreColor: '#e0e0e0', background: '#1e1e1e', toolbar: { show: false } },
            theme: { mode: 'dark' },
            grid: { borderColor: '#333' },
            plotOptions: { bar: { horizontal: false, columnWidth: '28%' } },
            dataLabels: { enabled: false },
            stroke: { width: 1, colors: ['#1e1e1e'] },
            fill: { opacity: 1 },
            xaxis: { categories, labels: { rotate: -30, style: { colors: '#a0a0a0' } } },
            yaxis: { labels: { formatter: (v)=>`${formatCurrency(Math.round(v))}g`, style: { colors: '#a0a0a0' } } },
            tooltip: { theme:'dark', y: { formatter: (v)=>`${formatCurrency(Math.round(v))} gold` } },
            legend: { show: false },
            series
        });
        chart.render();

        // Full set average cost under chart
        const fullSet = Math.round(tokens.reduce((sum, tk) => {
            const rec = tokenMap.get(String(tk).toLowerCase());
            return sum + (rec ? (Number(rec.avgPrice) || 0) : 0);
        }, 0));
        const fullSetDiv = document.createElement('div');
        fullSetDiv.className = 't3-full-set';
        fullSetDiv.style.marginTop = '8px';
        fullSetDiv.style.color = '#c8c8c8';
        fullSetDiv.style.fontSize = '13px';
        fullSetDiv.innerHTML = `<strong style="color:${color}">Full set average cost</strong>: ${formatCurrency(fullSet)}g`;
        section.appendChild(fullSetDiv);
    }

    async function loadT3Averages() {
        try {
            const r = await fetch('/api/stats/t3-token-averages');
            const j = await r.json();
            if (!r.ok || !j || !j.success) throw new Error(j && j.message || 'Failed to load T3 averages');
            const container = document.getElementById('t3-averages-container');
            if (!container) return;
            container.innerHTML = '';
            const tokens = Array.isArray(j.tokens) ? j.tokens : [];
            const tokenMap = new Map(tokens.map(t => [String(t.tokenName||'').toLowerCase(), t]));

            // Corrected groups and token mappings
            const grp1 = ['Desecrated Helmet','Desecrated Pauldrons','Desecrated Breastplate','Desecrated Gauntlets','Desecrated Bracers','Desecrated Waistguard','Desecrated Legplates','Desecrated Sabatons'];
            const grp2 = ['Desecrated Circlet','Desecrated Shoulderpads','Desecrated Robe','Desecrated Gloves','Desecrated Bindings','Desecrated Belt','Desecrated Leggings','Desecrated Sandals'];
            const grp3 = ['Desecrated Sandals','Desecrated Spaulders','Desecrated Tunic','Desecrated Handguards','Desecrated Wristguards','Desecrated Girdle','Desecrated Legguards','Desecrated Boots'];

            renderT3GroupSection('Warrior, Rogue', grp1, tokenMap, '#C79C6E');
            renderT3GroupSection('Priest, Mage, Warlock', grp2, tokenMap, '#69CCF0');
            renderT3GroupSection('Paladin, Hunter, Shaman, Druid', grp3, tokenMap, '#ABD473');
        } catch (e) {
            const container = document.getElementById('t3-averages-container');
            if (container) container.innerHTML = `<div class="error-display"><div class="error-content"><h3>Error</h3><p>${(e && e.message) || 'Failed to load T3 averages'}</p></div></div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();


