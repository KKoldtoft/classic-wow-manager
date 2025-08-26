document.addEventListener('DOMContentLoaded', async () => {
    const formatDateDDMMYYYY = (epochSeconds) => {
        if (!epochSeconds) return '';
        try {
            const d = new Date(epochSeconds * 1000);
            const fmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });
            return fmt.format(d); // dd/mm/yyyy
        } catch (_) {
            return '';
        }
    };
    const status = document.getElementById('itemlogStatus');
    const colSunday = document.getElementById('colSunday');
    const colThursday = document.getElementById('colThursday');
    const colFriday = document.getElementById('colFriday');
    if (!colSunday || !colThursday || !colFriday) return;

    status.textContent = 'Loading items...';
    try {
        const [res, histRes] = await Promise.all([
            fetch('/api/items-log'),
            fetch('/api/events/historic')
        ]);
        if (res.status === 401) {
            status.textContent = 'Please sign in with Discord to view the item log.';
            return;
        }
        if (!res.ok) {
            status.textContent = 'Failed to load items.';
            return;
        }
        const data = await res.json();
        let historic = { scheduledEvents: [] };
        try { historic = await histRes.json(); } catch {}
        const histEvents = Array.isArray(historic.scheduledEvents) ? historic.scheduledEvents : [];
        const eventMap = new Map();
        histEvents.forEach(ev => {
            const id = ev?.eventId || ev?.eventID || ev?.id || ev?.event_id;
            if (!id) return;
            eventMap.set(String(id), {
                channelName: ev.channelName || ev.title || ev.name || '',
                startTime: ev.startTime || null
            });
        });

        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0) {
            status.textContent = 'No items found yet.';
            return;
        }

        status.textContent = '';

        // Group items by eventId (raid)
        const itemsByEvent = new Map();
        items.forEach(item => {
            const id = String(item.eventId || '');
            if (!id) return;
            if (!itemsByEvent.has(id)) itemsByEvent.set(id, []);
            itemsByEvent.get(id).push(item);
        });

        // Build raid objects with display title and day-of-week
        const raids = [];
        itemsByEvent.forEach((list, id) => {
            // find one representative for meta
            const sample = list[0];
            let channelNameRaw = sample.channelName;
            if ((!channelNameRaw || !channelNameRaw.trim() || /^\d+$/.test(channelNameRaw)) && eventMap.has(id)) {
                const ev = eventMap.get(id);
                channelNameRaw = ev.channelName || channelNameRaw;
                if (!sample.startTime && ev.startTime) sample.startTime = ev.startTime;
            }

            // Clean channel name
            let cleanName = 'Unknown Raid';
            if (channelNameRaw && channelNameRaw.trim() && !/^\d+$/.test(channelNameRaw)) {
                cleanName = String(channelNameRaw)
                    .replace(/[^\w\s-]/g, '')
                    .replace(/-/g, ' ')
                    .trim()
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
            }

            // Date
            let dateStr = '';
            let dayName = 'Sunday';
            if (sample.startTime) {
                dateStr = formatDateDDMMYYYY(sample.startTime);
                const d = new Date(sample.startTime * 1000);
                const optionsDay = { weekday: 'long', timeZone: 'Europe/Copenhagen' };
                dayName = d.toLocaleDateString('en-US', optionsDay);
            }

            // Sort items by gold ascending
            const sortedItems = list.slice().sort((a,b) => (a.goldAmount||0) - (b.goldAmount||0));

            const raidStart = Number(sample.startTime || (eventMap.get(id)?.startTime || 0));
            raids.push({ id, cleanName, dateStr, dayName, items: sortedItems, start: raidStart });
        });

        // Sort raids by date DESC (newest first) so latest raids are at the top
        raids.sort((a,b) => (b.start || 0) - (a.start || 0));

        // Clear columns
        colSunday.innerHTML = '';
        colThursday.innerHTML = '';
        colFriday.innerHTML = '';

        // Helper to create card
        function createItemCard(item) {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('hall-of-fame-item');

            const iconHtml = item.iconLink ? 
                `<img src="${item.iconLink}" alt="${item.itemName}" class="item-icon-large" style="width: 60px; height: 60px; border-radius: 8px; margin-right: 12px; vertical-align: top;">` : 
                `<div style="width: 60px; height: 60px; background: #666; border-radius: 8px; margin-right: 12px; display: inline-block; vertical-align: top;"></div>`;

            // Resolve channel name: prefer item.channelName, fallback to historic map by eventId
            let channelNameRaw = item.channelName;
            const eventIdStr = String(item.eventId || '');
            if ((!channelNameRaw || !channelNameRaw.trim() || /^\d+$/.test(channelNameRaw)) && eventMap.has(eventIdStr)) {
                const ev = eventMap.get(eventIdStr);
                channelNameRaw = ev.channelName || channelNameRaw;
                if (!item.startTime && ev.startTime) item.startTime = ev.startTime;
            }

            // Format raid/channel name similar to front page
            let raidName = 'Unknown Raid';
            if (channelNameRaw && channelNameRaw.trim() && !/^\d+$/.test(channelNameRaw)) {
                raidName = String(channelNameRaw)
                    .replace(/[^\w\s-]/g, '')
                    .replace(/-/g, ' ')
                    .trim()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
            }

            let dateStr = '';
            if (item.startTime) {
                const eventDate = new Date(item.startTime * 1000);
                const options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' };
                dateStr = ` - ${eventDate.toLocaleDateString('en-GB', options)}`;
            }

            const nameHtml = item.wowheadLink ? `<a href="${item.wowheadLink}" target="_blank" rel="noopener noreferrer" style="color:#a335ee; text-decoration: none;">${item.itemName}</a>` : item.itemName;

            itemDiv.innerHTML = `
                <div class="hall-of-fame-content">
                    ${iconHtml}
                    <div class="hall-of-fame-details">
                        <div class="hall-of-fame-item-name" style="color: #a335ee; font-weight: bold; font-size: 14px;">${nameHtml}</div>
                        <div class="hall-of-fame-price" style="color: #FFD700; font-weight: bold; margin: 2px 0;">${item.goldAmount}g</div>
                        <div class="hall-of-fame-info" style="font-size: 12px; margin-top: 2px;">${item.playerName}</div>
                    </div>
                </div>
            `;
            return itemDiv;
        }

        // Render raids into their columns by day
        raids.forEach(raid => {
            const col = raid.dayName.startsWith('Sun') ? colSunday : raid.dayName.startsWith('Thu') ? colThursday : raid.dayName.startsWith('Fri') ? colFriday : colSunday;
            const raidBlock = document.createElement('div');
            raidBlock.className = 'itemlog-raid';
            const title = document.createElement('div');
            title.className = 'itemlog-raid-title';
            // Avoid duplicating weekday if already included in channel name
            const cleaned = raid.cleanName.toLowerCase().startsWith(raid.dayName.toLowerCase())
                ? raid.cleanName.slice(raid.dayName.length).trim()
                : raid.cleanName;
            title.textContent = `${raid.dayName} ${cleaned} - ${raid.dateStr}`.trim();
            const itemsWrap = document.createElement('div');
            itemsWrap.className = 'itemlog-raid-items';
            raid.items.forEach(it => itemsWrap.appendChild(createItemCard(it)));
            raidBlock.appendChild(title);
            raidBlock.appendChild(itemsWrap);
            col.appendChild(raidBlock);
        });
    } catch (e) {
        status.textContent = 'An error occurred while loading items.';
        // eslint-disable-next-line no-console
        console.error(e);
    }
});


