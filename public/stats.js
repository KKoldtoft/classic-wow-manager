(function StatsPage() {
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
            renderList(items);
            renderChart(items);
        } catch (e) {
            const el = document.querySelector('#top-item-chart');
            if (el) el.innerHTML = `<div class="error-display"><div class="error-content"><h3>Error</h3><p>${(e && e.message) || 'Failed to load stats'}</p></div></div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();


