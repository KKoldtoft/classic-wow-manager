// Live Viewer - WCL Analysis Display
(() => {
    // DOM Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const viewerCount = document.getElementById('viewerCount');
    const countdownSection = document.getElementById('countdownSection');
    const countdownBar = document.getElementById('countdownBar');
    const countdownTime = document.getElementById('countdownTime');
    
    // Highlight panels
    const pwsList = document.getElementById('pwsList');
    const pwsCount = document.getElementById('pwsCount');
    const bloodrageList = document.getElementById('bloodrageList');
    const bloodrageCount = document.getElementById('bloodrageCount');
    const chargeList = document.getElementById('chargeList');
    const chargeCount = document.getElementById('chargeCount');
    const renewList = document.getElementById('renewList');
    const renewCount = document.getElementById('renewCount');
    
    // New panel elements
    const interruptList = document.getElementById('interruptList');
    const interruptCount = document.getElementById('interruptCount');
    const decurseList = document.getElementById('decurseList');
    const decurseCount = document.getElementById('decurseCount');
    const sunderList = document.getElementById('sunderList');
    const sunderCount = document.getElementById('sunderCount');
    const scorchList = document.getElementById('scorchList');
    const scorchCount = document.getElementById('scorchCount');
    const disarmList = document.getElementById('disarmList');
    const disarmCount = document.getElementById('disarmCount');
    const deathsList = document.getElementById('deathsList');
    const deathsCount = document.getElementById('deathsCount');
    const curseDamageList = document.getElementById('curseDamageList');
    const curseDamageCount = document.getElementById('curseDamageCount');
    const sporeList = document.getElementById('sporeList');
    const sporeCount = document.getElementById('sporeCount');

    // Leaderboard elements
    const leaderboardsGrid = document.getElementById('leaderboardsGrid');
    const damageList = document.getElementById('damageList');
    const healingList = document.getElementById('healingList');
    
    // Highlights grid
    const highlightsGrid = document.getElementById('highlightsGrid');
    
    // Too Low panels elements
    const tooLowGrid = document.getElementById('tooLowGrid');
    const tooLowDamageList = document.getElementById('tooLowDamageList');
    const tooLowDamageCount = document.getElementById('tooLowDamageCount');
    const tooLowHealingList = document.getElementById('tooLowHealingList');
    const tooLowHealingCount = document.getElementById('tooLowHealingCount');
    
    // Healer classes (always considered healers for "Too Low Healing")
    const HEALER_CLASSES = new Set(['priest', 'shaman', 'druid']);
    
    // Store top damage/healing for reference bars
    let topDamage = 0;
    let topHealing = 0;
    
    // Modal elements
    const detailModalOverlay = document.getElementById('detailModalOverlay');
    const detailModalBody = document.getElementById('detailModalBody');
    const detailModalTitle = document.getElementById('detailModalTitle');
    const detailModalClose = document.getElementById('detailModalClose');
    
    // State
    let eventSource = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 3000;
    
    // Cached data for lookups
    let fightsData = [];
    let tankNames = new Set();
    
    // Raid Info Panel elements
    const raidInfoPanel = document.getElementById('raidInfoPanel');
    const raidDungeonIcon = document.getElementById('raidDungeonIcon');
    const raidDungeonName = document.getElementById('raidDungeonName');
    const raidEventName = document.getElementById('raidEventName');
    const raidHostName = document.getElementById('raidHostName');
    const raidBossCount = document.getElementById('raidBossCount');
    const raidViewerCountEl = document.getElementById('raidViewerCount');
    const raidTimer = document.getElementById('raidTimer');
    
    // Boss Encounters Panel elements
    const bossEncountersPanel = document.getElementById('bossEncountersPanel');
    const bossEncountersGrid = document.getElementById('bossEncountersGrid');
    const bossEncountersCount = document.getElementById('bossEncountersCount');
    
    // Raid timer state
    let raidStartTime = null;
    let timerInterval = null;
    
    // Boss thumbnail mapping (Cloudinary URLs)
    const BOSS_THUMBNAILS = {
        // Naxxramas
        "anub'rekhan": 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png',
        'grand widow faerlina': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754815959/3kvUdFR_kx7gif.png',
        'faerlina': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754815959/3kvUdFR_kx7gif.png',
        'maexxna': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754984024/Maexx15928_o8jkro.png',
        'noth the plaguebringer': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755074097/16590_ezmekl.png',
        'noth': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755074097/16590_ezmekl.png',
        'heigan the unclean': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755075234/16309_kpg0jp.png',
        'heigan': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755075234/16309_kpg0jp.png',
        'loatheb': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755080534/Fungal_monster_s0zutr.webp',
        'instructor razuvious': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp',
        'razuvious': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp',
        'gothik the harvester': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1768217339/25200_gkfm0m.webp',
        'gothik': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1768217339/25200_gkfm0m.webp',
        'the four horsemen': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993478/-16062_absih8.png',
        'four horsemen': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993478/-16062_absih8.png',
        'patchwerk': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755085582/patchwerk_wfd5z4.gif',
        'grobbulus': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755086620/24792_gahise.png',
        'gluth': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087393/27103_rdbmzc.png',
        'thaddius': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087787/dfka9xt-cbdf45c1-45b9-460b-a997-5a46c4de0a65_txsidf.png',
        'sapphiron': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755093137/oUwfSmi_mp74xg.gif',
        "kel'thuzad": 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755110522/15945_eop7se.png',
        'kelthuzad': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755110522/15945_eop7se.png',
        // AQ40
        'the prophet skeram': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756629772/prohpet_skarem_mjxxzt.png',
        'skeram': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756629772/prohpet_skarem_mjxxzt.png',
        'battleguard sartura': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630715/sartura_soipg5.png',
        'sartura': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630715/sartura_soipg5.png',
        'fankriss the unyielding': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630878/fankriss_ju6b9b.png',
        'fankriss': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630878/fankriss_ju6b9b.png',
        'viscidus': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631416/viscidus_whpcsx.png',
        'princess huhuran': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/huhuran_uhgd1p.png',
        'huhuran': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/huhuran_uhgd1p.png',
        'twin emperors': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631414/twins_ufymht.png',
        "emperor vek'lor": 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631414/twins_ufymht.png',
        "emperor vek'nilash": 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631414/twins_ufymht.png',
        'ouro': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631413/ouro_vvmd0k.png',
        "c'thun": 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/cthun_ke0e7s.png',
        'cthun': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/cthun_ke0e7s.png',
        'bug trio': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630087/bug_trio_ofvrvg.png',
        'silithid royalty': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630087/bug_trio_ofvrvg.png',
        // Default
        'default': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png'
    };
    
    // Dungeon icons
    const DUNGEON_ICONS = {
        'naxxramas': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755110522/15945_eop7se.png',
        'naxx': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755110522/15945_eop7se.png',
        'aq40': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/cthun_ke0e7s.png',
        "temple of ahn'qiraj": 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/cthun_ke0e7s.png',
        'default': 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png'
    };
    
    // Get boss thumbnail URL
    function getBossThumbnail(bossName) {
        const name = (bossName || '').toLowerCase().trim();
        // Try exact match first
        if (BOSS_THUMBNAILS[name]) return BOSS_THUMBNAILS[name];
        // Try partial match
        for (const [key, url] of Object.entries(BOSS_THUMBNAILS)) {
            if (name.includes(key) || key.includes(name)) return url;
        }
        return BOSS_THUMBNAILS['default'];
    }
    
    // Get dungeon icon
    function getDungeonIcon(dungeonName) {
        const name = (dungeonName || '').toLowerCase().trim();
        for (const [key, url] of Object.entries(DUNGEON_ICONS)) {
            if (name.includes(key)) return url;
        }
        return DUNGEON_ICONS['default'];
    }
    
    // Format raid timer (h:mm)
    function formatRaidTimer(ms) {
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
    
    // Update raid timer
    function updateRaidTimer() {
        if (!raidStartTime || !raidTimer) return;
        const elapsed = Date.now() - raidStartTime;
        raidTimer.textContent = formatRaidTimer(elapsed);
    }
    
    // Start raid timer
    function startRaidTimer(startMs) {
        if (timerInterval) clearInterval(timerInterval);
        raidStartTime = startMs;
        updateRaidTimer();
        timerInterval = setInterval(updateRaidTimer, 1000);
    }
    
    // Update raid timer from all fights (includes trash and bosses)
    function updateRaidTimerFromFights(fights) {
        if (!fights || fights.length === 0) return;
        
        // Find the earliest startTime among ALL fights (trash + bosses)
        const validFights = fights.filter(f => f.startTime && f.startTime > 0);
        if (validFights.length === 0) return;
        
        const earliest = Math.min(...validFights.map(f => f.startTime));
        // Find the latest endTime among all fights
        const fightsWithEnd = validFights.filter(f => f.endTime && f.endTime > 0);
        const latest = fightsWithEnd.length > 0 
            ? Math.max(...fightsWithEnd.map(f => f.endTime))
            : Math.max(...validFights.map(f => f.startTime));
        
        // Calculate raid duration based on WCL timestamps (ms)
        const raidDuration = latest - earliest;
        
        console.log('[LIVE] Timer calc: earliest=', earliest, 'latest=', latest, 'duration=', raidDuration);
        
        // Update timer to show duration
        if (raidTimer && raidDuration > 0) {
            raidTimer.textContent = formatRaidTimer(raidDuration);
        }
    }
    
    // Display boss encounters
    // Cache key to prevent unnecessary re-renders (avoids image blink)
    let lastBossEncountersKey = '';
    
    function displayBossEncounters(fights) {
        console.log('[LIVE] displayBossEncounters called with', fights?.length || 0, 'fights');
        
        if (!bossEncountersGrid || !bossEncountersPanel) {
            console.warn('[LIVE] Boss panel elements not found');
            return;
        }
        
        // Update raid timer from ALL fights (trash + bosses)
        updateRaidTimerFromFights(fights);
        
        // Filter to only boss encounters (encounterID > 0)
        const bossEncounters = (fights || []).filter(f => f.encounterID && f.encounterID > 0);
        console.log('[LIVE] Boss encounters:', bossEncounters.length);
        
        // Count unique bosses killed vs unique bosses attempted (by encounterID)
        // A boss that was wiped on and then killed should only count once as "killed"
        const bossMap = new Map(); // encounterID -> { name, killed, wipes }
        for (const f of bossEncounters) {
            const key = f.encounterID || f.name;
            if (!bossMap.has(key)) {
                bossMap.set(key, { name: f.name, killed: false, wipes: 0 });
            }
            const entry = bossMap.get(key);
            if (f.kill) {
                entry.killed = true;
            } else {
                entry.wipes++;
            }
        }
        const uniqueBosses = bossMap.size;
        const uniqueKills = Array.from(bossMap.values()).filter(b => b.killed).length;
        const totalWipes = Array.from(bossMap.values()).reduce((sum, b) => sum + b.wipes, 0);
        
        if (raidBossCount) {
            const wipeText = totalWipes > 0 ? ` (${totalWipes} wipe${totalWipes !== 1 ? 's' : ''})` : '';
            raidBossCount.textContent = `${uniqueKills} / ${uniqueBosses}${wipeText}`;
            console.log('[LIVE] Updated boss count:', uniqueKills, '/', uniqueBosses, 'wipes:', totalWipes);
        }
        
        if (bossEncounters.length === 0) {
            bossEncountersGrid.innerHTML = '<div class="boss-encounters-empty">No boss encounters yet</div>';
            bossEncountersPanel.classList.remove('active');
            if (bossEncountersCount) bossEncountersCount.textContent = '0';
            lastBossEncountersKey = '';
            return;
        }
        
        bossEncountersPanel.classList.add('active');
        if (bossEncountersCount) bossEncountersCount.textContent = bossEncounters.length;
        
        // Create a key to check if data actually changed (avoid re-render blink)
        const newKey = bossEncounters.map(f => `${f.id}:${f.kill}:${f.deaths || 0}`).join('|');
        if (newKey === lastBossEncountersKey) {
            console.log('[LIVE] Boss encounters unchanged, skipping re-render');
            return; // Data unchanged, don't re-render
        }
        lastBossEncountersKey = newKey;
        
        bossEncountersGrid.innerHTML = '';
        
        for (const fight of bossEncounters) {
            const card = document.createElement('div');
            card.className = `boss-encounter-card ${fight.kill ? 'kill' : 'wipe'}`;
            
            const thumbnail = getBossThumbnail(fight.name);
            const duration = fight.endTime && fight.startTime 
                ? Math.round((fight.endTime - fight.startTime) / 1000) 
                : 0;
            const durationStr = duration >= 60 
                ? `${Math.floor(duration / 60)}m ${duration % 60}s` 
                : `${duration}s`;
            const deaths = fight.deaths || 0;
            const deathsHtml = deaths > 0 
                ? `<span class="boss-encounter-deaths"><i class="fas fa-skull"></i> ${deaths}</span>` 
                : '';
            
            card.innerHTML = `
                <img class="boss-encounter-image" src="${thumbnail}" alt="${fight.name}" loading="lazy">
                <div class="boss-encounter-info">
                    <div class="boss-encounter-name">${fight.name || 'Unknown Boss'}</div>
                    <div class="boss-encounter-times">${formatTimeShort(fight.startTime)} → ${formatTimeShort(fight.endTime)}</div>
                    <div class="boss-encounter-meta">
                        <span class="boss-encounter-duration">${durationStr}</span>
                        ${deathsHtml}
                        <span class="boss-encounter-result ${fight.kill ? 'kill' : 'wipe'}">${fight.kill ? '✓ Kill' : '✗ Wipe'}</span>
                    </div>
                </div>
            `;
            
            bossEncountersGrid.appendChild(card);
        }
    }
    
    // Fetch and display event info
    async function fetchEventInfo(eventId) {
        if (!eventId || !raidInfoPanel) return;
        
        // Helper to update UI from event data
        const updateFromEvent = async (event) => {
            // Update dungeon info
            let dungeonName = 'Raid';
            if (event.channelName) {
                // Extract dungeon from channel name (e.g., "naxx-run-1" -> "Naxxramas")
                const channelLower = event.channelName.toLowerCase();
                if (channelLower.includes('naxx')) dungeonName = 'Naxxramas';
                else if (channelLower.includes('aq40') || channelLower.includes('aq-40')) dungeonName = "Temple of Ahn'Qiraj";
                else if (channelLower.includes('bwl')) dungeonName = 'Blackwing Lair';
                else if (channelLower.includes('mc')) dungeonName = 'Molten Core';
                else if (channelLower.includes('ony')) dungeonName = "Onyxia's Lair";
                else {
                    // Clean channel name for display
                    dungeonName = event.channelName
                        .replace(/[^\w\s-]/g, '')
                        .replace(/-/g, ' ')
                        .trim()
                        .split(' ')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                }
            }
            
            if (raidDungeonName) raidDungeonName.textContent = dungeonName;
            if (raidEventName) raidEventName.textContent = event.title || event.channelName || 'Live Raid';
            
            // Fetch channel background image from admin settings
            if (event.channelId && raidDungeonIcon) {
                try {
                    const bgResp = await fetch(`/api/channel-background/${event.channelId}`);
                    if (bgResp.ok) {
                        const bgData = await bgResp.json();
                        if (bgData.success && bgData.backgroundUrl) {
                            raidDungeonIcon.src = bgData.backgroundUrl;
                        } else {
                            // Fallback to default dungeon icon
                            raidDungeonIcon.src = getDungeonIcon(dungeonName);
                        }
                    }
                } catch (bgErr) {
                    console.warn('[LIVE] Could not fetch channel background:', bgErr);
                    raidDungeonIcon.src = getDungeonIcon(dungeonName);
                }
            } else if (raidDungeonIcon) {
                raidDungeonIcon.src = getDungeonIcon(dungeonName);
            }
            
            raidInfoPanel.classList.add('active');
            return true;
        };
        
        let found = false;
        
        try {
            // Try to fetch event details from the events cache
            const eventsResp = await fetch('/api/events');
            if (eventsResp.ok) {
                const eventsData = await eventsResp.json();
                const allEvents = eventsData.scheduledEvents || [];
                const event = allEvents.find(e => String(e.id) === String(eventId));
                
                if (event) {
                    found = await updateFromEvent(event);
                }
            }
        } catch (err) {
            console.warn('[LIVE] Could not fetch event info:', err);
        }
        
        // Also try historic events if not found
        if (!found) {
            try {
                const historicResp = await fetch('/api/events/historic');
                if (historicResp.ok) {
                    const historicData = await historicResp.json();
                    const allEvents = historicData.scheduledEvents || [];
                    const event = allEvents.find(e => String(e.id) === String(eventId));
                    
                    if (event) {
                        await updateFromEvent(event);
                    }
                }
            } catch (err) {
                // Silent fail for historic
            }
        }
    }

    // Format number with commas
    function formatNumber(n) {
        return (n || 0).toLocaleString();
    }

    // Format timestamp (without milliseconds for display)
    function formatTimeShort(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Format timestamp (with milliseconds for modal)
    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const millis = ms % 1000;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    }

    // Format duration
    function formatDuration(ms) {
        return `${(ms / 1000).toFixed(1)}s`;
    }

    // Format large amounts (4.51M, 456.7K)
    function formatAmount(n) {
        if (n >= 1000000) {
            return (n / 1000000).toFixed(2) + 'M';
        } else if (n >= 1000) {
            return (n / 1000).toFixed(1) + 'K';
        }
        return String(n);
    }

    // Format DPS/HPS with one decimal (913.2, 1.2K)
    function formatPerSecond(n) {
        if (n >= 1000) {
            return (n / 1000).toFixed(1) + 'K';
        }
        return n.toFixed(1);
    }

    // Get bar class color for leaderboard bars
    function getBarClassColor(wowClass) {
        const classMap = {
            'warrior': 'bar-warrior',
            'paladin': 'bar-paladin',
            'hunter': 'bar-hunter',
            'rogue': 'bar-rogue',
            'priest': 'bar-priest',
            'shaman': 'bar-shaman',
            'mage': 'bar-mage',
            'warlock': 'bar-warlock',
            'druid': 'bar-druid'
        };
        return classMap[(wowClass || '').toLowerCase()] || 'bar-unknown';
    }

    // Find encounter at a given timestamp
    function findEncounterAtTime(timestamp) {
        for (const fight of fightsData) {
            if (fight.encounterID > 0 && timestamp >= fight.startTime && timestamp <= fight.endTime) {
                return fight;
            }
        }
        return null;
    }

    // Set status
    function setStatus(state, message) {
        statusText.textContent = message;
        statusDot.className = 'status-dot';
        if (state === 'connected') {
            statusDot.classList.add('connected');
        } else if (state === 'waiting') {
            statusDot.classList.add('waiting');
        }
    }

    // Get CSS class for WoW class
    function getClassColor(wowClass) {
        const classMap = {
            'warrior': 'class-warrior',
            'paladin': 'class-paladin',
            'hunter': 'class-hunter',
            'rogue': 'class-rogue',
            'priest': 'class-priest',
            'shaman': 'class-shaman',
            'mage': 'class-mage',
            'warlock': 'class-warlock',
            'druid': 'class-druid'
        };
        return classMap[(wowClass || '').toLowerCase()] || 'class-unknown';
    }

    // Create highlight item (no inline icons - icons are in panel headers now)
    function createHighlightItem(event, isClickable = true) {
        const item = document.createElement('div');
        item.className = 'highlight-item' + (isClickable ? ' clickable' : '');
        
        const time = formatTimeShort(event.timestamp || 0);
        const source = event.sourceName || 'Unknown';
        const target = event.targetName || '';
        const sourceClass = getClassColor(event.sourceSubType);
        const targetClass = getClassColor(event.targetSubType);
        
        item.innerHTML = `
            <span class="time">${time}</span>
            <span class="source ${sourceClass}">${source}</span>
            ${target ? `<span class="target ${targetClass}">${target}</span>` : ''}
        `;
        
        return item;
    }

    // Display PW:S events - aggregated by player with red bars
    function displayPwsEvents(data) {
        const events = data.events || [];
        pwsCount.textContent = events.length;

        if (events.length === 0) {
            pwsList.innerHTML = '<div class="highlight-empty">No shields cast yet</div>';
            return;
        }

        // Aggregate by source player, storing events
        const byPlayer = {};
        for (const event of events) {
            const name = event.sourceName || 'Unknown';
            if (!byPlayer[name]) {
                byPlayer[name] = { count: 0, sourceSubType: event.sourceSubType, events: [] };
            }
            byPlayer[name].count++;
            byPlayer[name].events.push(event);
        }

        // Sort by count (highest first)
        const sorted = Object.entries(byPlayer).sort((a, b) => b[1].count - a[1].count);
        const maxCount = sorted[0]?.[1].count || 1;

        pwsList.innerHTML = '';

        for (const [name, player] of sorted) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(255, 100, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#ff6b6b">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(name, player.events, 'pws'));
            pwsList.appendChild(item);
        }
    }

    // Display Renew events - aggregated by player with red bars
    function displayRenewEvents(data) {
        const events = data.events || [];
        renewCount.textContent = events.length;

        if (events.length === 0) {
            renewList.innerHTML = '<div class="highlight-empty">No renews on tanks yet</div>';
            return;
        }

        // Aggregate by source player, storing events
        const byPlayer = {};
        for (const event of events) {
            const name = event.sourceName || 'Unknown';
            if (!byPlayer[name]) {
                byPlayer[name] = { count: 0, sourceSubType: event.sourceSubType, events: [] };
            }
            byPlayer[name].count++;
            byPlayer[name].events.push(event);
        }

        // Sort by count (highest first)
        const sorted = Object.entries(byPlayer).sort((a, b) => b[1].count - a[1].count);
        const maxCount = sorted[0]?.[1].count || 1;

        renewList.innerHTML = '';

        for (const [name, player] of sorted) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(255, 100, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#ff6b6b">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(name, player.events, 'renew'));
            renewList.appendChild(item);
        }
    }

    // Display bad bloodrages - aggregated by player with red bars
    function displayBloodrages(data) {
        const badBloodrages = data.badBloodrages || [];
        bloodrageCount.textContent = badBloodrages.length;

        if (badBloodrages.length === 0) {
            bloodrageList.innerHTML = '<div class="highlight-empty">No bad bloodrages detected</div>';
            return;
        }

        // Aggregate by player, storing events
        const byPlayer = {};
        for (const br of badBloodrages) {
            const name = br.sourceName || 'Unknown';
            if (!byPlayer[name]) {
                byPlayer[name] = { count: 0, sourceSubType: br.sourceSubType, events: [] };
            }
            byPlayer[name].count++;
            byPlayer[name].events.push(br);
        }

        // Sort by count (highest first)
        const sorted = Object.entries(byPlayer).sort((a, b) => b[1].count - a[1].count);
        const maxCount = sorted[0]?.[1].count || 1;

        bloodrageList.innerHTML = '';

        for (const [name, player] of sorted) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(255, 100, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#ff6b6b">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(name, player.events, 'bloodrage'));
            bloodrageList.appendChild(item);
        }
    }

    // Display bad charges - aggregated by player with red bars
    function displayCharges(data) {
        const charges = data.charges || [];
        // Filter to only show bad charges (stunnable mobs or no tank hit first)
        const badCharges = charges.filter(c => !c.tankHitFirst || c.isStunnableMob);

        chargeCount.textContent = badCharges.length;

        if (badCharges.length === 0) {
            chargeList.innerHTML = '<div class="highlight-empty">No bad charges detected</div>';
            return;
        }

        // Aggregate by player, storing events
        const byPlayer = {};
        for (const charge of badCharges) {
            const name = charge.sourceName || 'Unknown';
            if (!byPlayer[name]) {
                byPlayer[name] = { count: 0, sourceSubType: charge.sourceSubType, events: [] };
            }
            byPlayer[name].count++;
            byPlayer[name].events.push(charge);
        }

        // Sort by count (highest first)
        const sorted = Object.entries(byPlayer).sort((a, b) => b[1].count - a[1].count);
        const maxCount = sorted[0]?.[1].count || 1;

        chargeList.innerHTML = '';

        for (const [name, player] of sorted) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(255, 100, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#ff6b6b">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(name, player.events, 'charge'));
            chargeList.appendChild(item);
        }
    }

    // Display interrupts - player leaderboard with green bars
    function displayInterrupts(data) {
        const playerStats = data.playerStats || [];
        if (interruptCount) interruptCount.textContent = data.totalInterrupts || 0;

        if (!interruptList) return;

        if (playerStats.length === 0) {
            interruptList.innerHTML = '<div class="highlight-empty">No interrupts found</div>';
            return;
        }

        interruptList.innerHTML = '';
        const maxCount = playerStats[0]?.count || 1;

        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(100, 200, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#6c6">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(player.name, player.events || [], 'interrupt'));
            interruptList.appendChild(item);
        }
    }

    // Display decurses - player leaderboard with green bars
    function displayDecurses(data) {
        const playerStats = data.playerStats || [];
        if (decurseCount) decurseCount.textContent = data.totalDecurses || 0;

        if (!decurseList) return;

        if (playerStats.length === 0) {
            decurseList.innerHTML = '<div class="highlight-empty">No decurses found</div>';
            return;
        }

        decurseList.innerHTML = '';
        const maxCount = playerStats[0]?.count || 1;

        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(100, 200, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#6c6">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(player.name, player.events || [], 'decurse'));
            decurseList.appendChild(item);
        }
    }

    // Display effective sunders - player leaderboard with green bars
    function displaySunders(data) {
        const playerStats = data.playerStats || [];
        const effective = data.effectiveSunders || 0;
        const total = data.totalSunders || 0;

        if (sunderCount) sunderCount.textContent = effective;

        if (!sunderList) return;

        if (playerStats.length === 0) {
            sunderList.innerHTML = '<div class="highlight-empty">No sunders found</div>';
            return;
        }

        sunderList.innerHTML = '';
        const maxCount = playerStats[0]?.effective || 1;

        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.effective / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(100, 200, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#6c6">${player.effective}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(player.name, player.events || [], 'sunder'));
            sunderList.appendChild(item);
        }
    }

    // Display effective scorches - player leaderboard with green bars
    function displayScorches(data) {
        const playerStats = data.playerStats || [];
        const effective = data.effectiveScorches || 0;
        const total = data.totalScorches || 0;

        if (scorchCount) scorchCount.textContent = effective;

        if (!scorchList) return;

        if (playerStats.length === 0) {
            scorchList.innerHTML = '<div class="highlight-empty">No scorches found</div>';
            return;
        }

        scorchList.innerHTML = '';
        const maxCount = playerStats[0]?.effective || 1;

        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.effective / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(100, 200, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#6c6">${player.effective}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(player.name, player.events || [], 'scorch'));
            scorchList.appendChild(item);
        }
    }

    // Display disarms - player leaderboard with green bars
    function displayDisarms(data) {
        const playerStats = data.playerStats || [];
        if (disarmCount) disarmCount.textContent = data.totalDisarms || 0;

        if (!disarmList) return;

        if (playerStats.length === 0) {
            disarmList.innerHTML = '<div class="highlight-empty">No disarms found</div>';
            return;
        }

        disarmList.innerHTML = '';
        const maxCount = playerStats[0]?.count || 1;

        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const sourceClass = getClassColor(player.sourceSubType);
            const barWidth = (player.count / maxCount) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(100, 200, 100, 0.3);"></div>
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#6c6">${player.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(player.name, player.events || [], 'disarm'));
            disarmList.appendChild(item);
        }
    }

    // Display player deaths - aggregated per player like damage meter
    function displayDeaths(data) {
        const deaths = data.deaths || [];
        if (deathsCount) deathsCount.textContent = deaths.length;

        if (!deathsList) return;

        if (deaths.length === 0) {
            deathsList.innerHTML = '<div class="highlight-empty">No deaths recorded</div>';
            return;
        }

        // Aggregate deaths per player, storing individual events
        const deathsByPlayer = {};
        for (const death of deaths) {
            const name = death.playerName || 'Unknown';
            if (!deathsByPlayer[name]) {
                deathsByPlayer[name] = { count: 0, events: [] };
            }
            deathsByPlayer[name].count++;
            deathsByPlayer[name].events.push(death);
        }

        // Sort by death count (highest first)
        const sortedPlayers = Object.entries(deathsByPlayer)
            .sort((a, b) => b[1].count - a[1].count);

        deathsList.innerHTML = '';
        const maxDeaths = sortedPlayers[0]?.[1].count || 1;

        for (const [playerName, playerData] of sortedPlayers) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            // Calculate bar width as percentage of max deaths
            const barWidth = (playerData.count / maxDeaths) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(255, 100, 100, 0.3);"></div>
                <span class="source">${playerName}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#ff6b6b">${playerData.count}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(playerName, playerData.events, 'death'));
            deathsList.appendChild(item);
        }
    }

    // Display mage damage while curses were active - red bars with damage amount
    function displayCurseDamage(data) {
        const playerStats = data.playerStats || [];
        const totalDamage = data.totalDamage || 0;
        if (curseDamageCount) curseDamageCount.textContent = formatNumber(totalDamage);

        if (!curseDamageList) return;

        if (playerStats.length === 0) {
            curseDamageList.innerHTML = '<div class="highlight-empty">No curse damage data</div>';
            return;
        }

        curseDamageList.innerHTML = '';
        const maxDamage = playerStats[0]?.damage || 1;

        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';

            const barWidth = (player.damage / maxDamage) * 100;

            item.innerHTML = `
                <div class="highlight-bar" style="width: ${barWidth}%; background: rgba(255, 100, 100, 0.3);"></div>
                <span class="source class-mage">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold;color:#ff6b6b">${formatNumber(player.damage)}</span>
            `;

            item.addEventListener('click', () => showPlayerEventsDetail(player.name, player.events || [], 'curseDamage'));
            curseDamageList.appendChild(item);
        }
    }

    // Store player class mapping and spore assignments
    let playerClassMap = {};
    let sporeAssignments = {}; // { groupNumber: [playerNames] }

    // Fetch spore assignments for the event
    async function fetchSporeAssignments(eventId) {
        if (!eventId) return {};
        try {
            const response = await fetch(`/api/assignments/${eventId}`);
            if (!response.ok) return {};
            const data = await response.json();
            
            // Extract spore assignments from panels
            const assignments = {};
            for (const panel of (data.panels || [])) {
                for (const entry of (panel.entries || [])) {
                    // Format: __SPORE__:{groupNumber}:{slotNumber}
                    const match = String(entry.assignment || '').match(/^__SPORE__:(\d+):(\d+)$/);
                    if (match) {
                        const groupNum = Number(match[1]);
                        const charName = entry.character_name;
                        if (!assignments[groupNum]) assignments[groupNum] = [];
                        assignments[groupNum].push(charName);
                    }
                }
            }
            console.log('[SPORES] Loaded assignments:', assignments);
            return assignments;
        } catch (err) {
            console.error('[SPORES] Failed to fetch assignments:', err);
            return {};
        }
    }

    // Display Loatheb spore groups (first 8 spores in 4x2 grid)
    async function displaySpores(data) {
        const sporeGroups = data.sporeGroups || [];
        const totalSpores = data.totalSpores || 0;
        if (sporeCount) sporeCount.textContent = totalSpores;

        // Fetch spore assignments if we have an event ID
        const eventId = localStorage.getItem('activeEventSession');
        if (eventId) {
            sporeAssignments = await fetchSporeAssignments(eventId);
        }

        // Update each spore cell (1-8)
        for (let i = 1; i <= 8; i++) {
            const timeEl = document.getElementById(`spore${i}Time`);
            const playersEl = document.getElementById(`spore${i}Players`);
            
            if (!timeEl || !playersEl) continue;
            
            // Find spore data for this spore number
            const sporeData = sporeGroups.find(s => s.sporeNumber === i);
            
            if (sporeData) {
                // Format timestamp as mm:ss from fight start
                const timeInSeconds = Math.floor(sporeData.timestamp / 1000);
                const minutes = Math.floor(timeInSeconds / 60);
                const seconds = timeInSeconds % 60;
                timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Display players who got the buff
                if (sporeData.players && sporeData.players.length > 0) {
                    const assignedPlayers = sporeAssignments[i] || [];
                    
                    playersEl.innerHTML = sporeData.players.map(name => {
                        const playerClass = playerClassMap[name] || 'unknown';
                        const classColor = getClassColor(playerClass);
                        const isWrongAssignment = assignedPlayers.length > 0 && !assignedPlayers.includes(name);
                        const wrongClass = isWrongAssignment ? ' wrong-assignment' : '';
                        
                        return `<span class="spore-player ${classColor}${wrongClass}" title="${name}">${name}</span>`;
                    }).join('');
                } else {
                    playersEl.innerHTML = '<span class="spore-cell-empty">No players</span>';
                }
            } else {
                timeEl.textContent = '--:--';
                playersEl.innerHTML = '<span class="spore-cell-empty">Waiting...</span>';
            }
        }
    }

    // Helper function to format numbers (e.g., 1234567 -> 1.23M)
    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    // Display damage leaderboard
    function displayDamageLeaderboard(players) {
        if (!damageList) return;
        
        // Show the leaderboards grid
        if (leaderboardsGrid) leaderboardsGrid.style.display = 'grid';
        
        if (!players || players.length === 0) {
            damageList.innerHTML = '<div class="leaderboard-empty">No damage data</div>';
            return;
        }
        
        damageList.innerHTML = '';
        
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            const rank = i + 1;
            
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            
            // Rank
            const rankSpan = document.createElement('span');
            rankSpan.className = 'leaderboard-rank';
            if (rank === 1) rankSpan.className += ' top1';
            else if (rank === 2) rankSpan.className += ' top2';
            else if (rank === 3) rankSpan.className += ' top3';
            rankSpan.textContent = rank;
            
            // Player info with bar
            const playerDiv = document.createElement('div');
            playerDiv.className = 'leaderboard-player';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'leaderboard-name ' + getClassColor(player.class);
            nameSpan.textContent = player.name;
            
            const barContainer = document.createElement('div');
            barContainer.className = 'leaderboard-bar-container';
            
            const bar = document.createElement('div');
            bar.className = 'leaderboard-bar ' + getBarClassColor(player.class);
            bar.style.width = `${player.percent || 0}%`;
            
            barContainer.appendChild(bar);
            playerDiv.appendChild(nameSpan);
            playerDiv.appendChild(barContainer);
            
            // Amount with DPS
            const amountSpan = document.createElement('span');
            amountSpan.className = 'leaderboard-amount damage';
            const dpsText = player.dps ? ` (${formatPerSecond(player.dps)} DPS)` : '';
            amountSpan.innerHTML = `${formatAmount(player.amount)}<span class="leaderboard-ps">${dpsText}</span>`;
            
            row.appendChild(rankSpan);
            row.appendChild(playerDiv);
            row.appendChild(amountSpan);
            
            damageList.appendChild(row);
        }
    }
    
    // Display healing leaderboard
    function displayHealingLeaderboard(players) {
        if (!healingList) return;
        
        // Show the leaderboards grid
        if (leaderboardsGrid) leaderboardsGrid.style.display = 'grid';
        
        if (!players || players.length === 0) {
            healingList.innerHTML = '<div class="leaderboard-empty">No healing data</div>';
            return;
        }
        
        healingList.innerHTML = '';
        
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            const rank = i + 1;
            
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            
            // Rank
            const rankSpan = document.createElement('span');
            rankSpan.className = 'leaderboard-rank';
            if (rank === 1) rankSpan.className += ' top1';
            else if (rank === 2) rankSpan.className += ' top2';
            else if (rank === 3) rankSpan.className += ' top3';
            rankSpan.textContent = rank;
            
            // Player info with bar
            const playerDiv = document.createElement('div');
            playerDiv.className = 'leaderboard-player';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'leaderboard-name ' + getClassColor(player.class);
            nameSpan.textContent = player.name;
            
            const barContainer = document.createElement('div');
            barContainer.className = 'leaderboard-bar-container';
            
            const bar = document.createElement('div');
            bar.className = 'leaderboard-bar ' + getBarClassColor(player.class);
            bar.style.width = `${player.percent || 0}%`;
            
            barContainer.appendChild(bar);
            playerDiv.appendChild(nameSpan);
            playerDiv.appendChild(barContainer);
            
            // Amount with HPS
            const amountSpan = document.createElement('span');
            amountSpan.className = 'leaderboard-amount healing';
            const hpsText = player.hps ? ` (${formatPerSecond(player.hps)} HPS)` : '';
            amountSpan.innerHTML = `${formatAmount(player.amount)}<span class="leaderboard-ps">${hpsText}</span>`;
            
            row.appendChild(rankSpan);
            row.appendChild(playerDiv);
            row.appendChild(amountSpan);
            
            healingList.appendChild(row);
        }
    }
    
    // Display Too Low Damage panel (using pre-calculated DPS from backend)
    // Thresholds match raidlogs_admin: < 150 = -100, < 200 = -50, < 250 = -25
    function displayTooLowDamageFromStats(damagePlayers) {
        if (!tooLowDamageList) return;
        if (!tooLowGrid) return;
        
        // Show the too-low grid
        tooLowGrid.style.display = 'grid';
        
        // Filter to DPS players only:
        // - Exclude healer classes (Priest, Shaman, Druid)
        // - Exclude tanks
        const dpsPlayers = damagePlayers.filter(player => {
            const playerClass = (player.class || '').toLowerCase();
            const playerName = player.name;
            
            // Exclude healer classes
            if (HEALER_CLASSES.has(playerClass)) {
                return false;
            }
            
            // Exclude tanks
            if (tankNames.has(playerName)) {
                return false;
            }
            
            return true;
        });
        
        // Calculate points based on DPS thresholds (matching raidlogs_admin)
        const playersWithPenalties = dpsPlayers.map(player => {
            const dps = player.dps || 0;
            let points = 0;
            if (dps < 150) {
                points = -100;
            } else if (dps < 200) {
                points = -50;
            } else if (dps < 250) {
                points = -25;
            }
            return { ...player, points };
        }).filter(p => p.points < 0); // Only show players with penalties
        
        // Sort by DPS ascending (worst first)
        playersWithPenalties.sort((a, b) => (a.dps || 0) - (b.dps || 0));
        
        if (tooLowDamageCount) {
            tooLowDamageCount.textContent = playersWithPenalties.length;
        }
        
        if (playersWithPenalties.length === 0) {
            tooLowDamageList.innerHTML = '<div class="too-low-empty">✅ All DPS above 250 threshold</div>';
            return;
        }
        
        tooLowDamageList.innerHTML = '';
        
        for (const player of playersWithPenalties) {
            const row = document.createElement('div');
            row.className = 'too-low-row';
            
            // Player info with bar
            const playerDiv = document.createElement('div');
            playerDiv.className = 'too-low-player';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'too-low-name ' + getClassColor(player.class);
            nameSpan.textContent = player.name;
            
            const barContainer = document.createElement('div');
            barContainer.className = 'too-low-bar-container';
            
            const bar = document.createElement('div');
            bar.className = 'too-low-bar ' + getBarClassColor(player.class);
            // Bar relative to top damage
            const percent = topDamage > 0 ? (player.amount / topDamage) * 100 : 0;
            bar.style.width = `${percent}%`;
            
            barContainer.appendChild(bar);
            playerDiv.appendChild(nameSpan);
            playerDiv.appendChild(barContainer);
            
            // Amount
            const amountSpan = document.createElement('span');
            amountSpan.className = 'too-low-amount';
            amountSpan.textContent = formatAmount(player.amount);
            
            // DPS
            const dpsSpan = document.createElement('span');
            dpsSpan.className = 'too-low-dps';
            dpsSpan.textContent = `${Math.round(player.dps || 0)}`;
            
            // Points penalty
            const pointsSpan = document.createElement('span');
            pointsSpan.className = 'too-low-points';
            if (player.points === -100) {
                pointsSpan.classList.add('severe');
            } else if (player.points === -50) {
                pointsSpan.classList.add('moderate');
            } else {
                pointsSpan.classList.add('minor');
            }
            pointsSpan.textContent = player.points;
            
            row.appendChild(playerDiv);
            row.appendChild(amountSpan);
            row.appendChild(dpsSpan);
            row.appendChild(pointsSpan);
            
            tooLowDamageList.appendChild(row);
        }
    }
    
    // Display Too Low Healing panel (using pre-calculated HPS from backend)
    // Thresholds match raidlogs_admin: < 85 = -100, < 100 = -50, < 125 = -25
    function displayTooLowHealingFromStats(healingPlayers) {
        if (!tooLowHealingList) return;
        if (!tooLowGrid) return;
        
        // Show the too-low grid
        tooLowGrid.style.display = 'grid';
        
        // Filter to healer classes only (Priest, Shaman, Druid)
        const healers = healingPlayers.filter(player => {
            const playerClass = (player.class || '').toLowerCase();
            return HEALER_CLASSES.has(playerClass);
        });
        
        // Calculate points based on HPS thresholds (matching raidlogs_admin)
        const playersWithPenalties = healers.map(player => {
            const hps = player.hps || 0;
            let points = 0;
            if (hps < 85) {
                points = -100;
            } else if (hps < 100) {
                points = -50;
            } else if (hps < 125) {
                points = -25;
            }
            return { ...player, points };
        }).filter(p => p.points < 0); // Only show healers with penalties
        
        // Sort by HPS ascending (worst first)
        playersWithPenalties.sort((a, b) => (a.hps || 0) - (b.hps || 0));
        
        if (tooLowHealingCount) {
            tooLowHealingCount.textContent = playersWithPenalties.length;
        }
        
        if (playersWithPenalties.length === 0) {
            tooLowHealingList.innerHTML = '<div class="too-low-empty">✅ All healers above 125 threshold</div>';
            return;
        }
        
        tooLowHealingList.innerHTML = '';
        
        for (const player of playersWithPenalties) {
            const row = document.createElement('div');
            row.className = 'too-low-row';
            
            // Player info with bar
            const playerDiv = document.createElement('div');
            playerDiv.className = 'too-low-player';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'too-low-name ' + getClassColor(player.class);
            nameSpan.textContent = player.name;
            
            const barContainer = document.createElement('div');
            barContainer.className = 'too-low-bar-container';
            
            const bar = document.createElement('div');
            bar.className = 'too-low-bar ' + getBarClassColor(player.class);
            // Bar relative to top healing
            const percent = topHealing > 0 ? (player.amount / topHealing) * 100 : 0;
            bar.style.width = `${percent}%`;
            
            barContainer.appendChild(bar);
            playerDiv.appendChild(nameSpan);
            playerDiv.appendChild(barContainer);
            
            // Amount
            const amountSpan = document.createElement('span');
            amountSpan.className = 'too-low-amount';
            amountSpan.textContent = formatAmount(player.amount);
            
            // HPS
            const hpsSpan = document.createElement('span');
            hpsSpan.className = 'too-low-dps';
            hpsSpan.textContent = `${Math.round(player.hps || 0)}`;
            
            // Points penalty
            const pointsSpan = document.createElement('span');
            pointsSpan.className = 'too-low-points';
            if (player.points === -100) {
                pointsSpan.classList.add('severe');
            } else if (player.points === -50) {
                pointsSpan.classList.add('moderate');
            } else {
                pointsSpan.classList.add('minor');
            }
            pointsSpan.textContent = player.points;
            
            row.appendChild(playerDiv);
            row.appendChild(amountSpan);
            row.appendChild(hpsSpan);
            row.appendChild(pointsSpan);
            
            tooLowHealingList.appendChild(row);
        }
    }

    // Show player events detail modal - lists all events for a player
    function showPlayerEventsDetail(playerName, events, type) {
        const typeConfig = {
            'pws': { icon: '🛡️', name: 'Shields on Tanks', showTarget: true, targetLabel: 'Target' },
            'renew': { icon: '💚', name: 'Renews on Tanks', showTarget: true, targetLabel: 'Target' },
            'bloodrage': { icon: '💢', name: 'Bad Bloodrages', showTarget: false },
            'charge': { icon: '⚡', name: 'Risky Charges', showTarget: true, targetLabel: 'Target' },
            'interrupt': { icon: '🤚', name: 'Interrupts', showTarget: true, targetLabel: 'Spell Interrupted' },
            'decurse': { icon: '✨', name: 'Decurses', showTarget: true, targetLabel: 'Curse Removed' },
            'sunder': { icon: '🔨', name: 'Effective Sunders', showTarget: true, targetLabel: 'Target' },
            'scorch': { icon: '🔥', name: 'Effective Scorches', showTarget: true, targetLabel: 'Target' },
            'disarm': { icon: '🗡️', name: 'Disarms', showTarget: true, targetLabel: 'Target' },
            'death': { icon: '💀', name: 'Deaths', showTarget: false, showAbility: true, abilityLabel: 'Killed By' },
            'curseDamage': { icon: '☠️', name: 'Damage While Curse Up', showCurseDamageDetails: true }
        };

        const config = typeConfig[type] || { icon: '📌', name: 'Events', showTarget: false };
        
        detailModalTitle.textContent = `${config.icon} ${playerName} - ${config.name}`;

        let html = `
            <div class="detail-section">
                <div class="detail-section-title">${events.length} Event${events.length !== 1 ? 's' : ''}</div>
                <div class="player-events-list">
        `;

        // Sort by timestamp
        const sorted = [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        for (const event of sorted) {
            const time = formatTimeShort(event.timestamp || 0);
            let details = '';
            
            if (config.showTarget && event.targetName) {
                details = `<span class="event-target">${config.targetLabel}: ${event.targetName}</span>`;
            }
            if (config.showAbility && event.abilityName) {
                details = `<span class="event-ability">${config.abilityLabel}: ${event.abilityName}</span>`;
            }
            if (config.showAmount && event.amount) {
                details = `<span class="event-target">Damage: ${event.amount.toLocaleString()}</span>`;
            }
            if (config.showCurseDamageDetails) {
                details = `<span class="event-ability">${event.abilityName || 'Unknown'}</span> → <span class="event-target">${event.targetName || 'Unknown'}</span> <span style="color:#ff6b6b">(${event.amount?.toLocaleString() || 0})</span>`;
            }
            if (type === 'interrupt' && event.extraAbilityName) {
                details = `<span class="event-target">Interrupted: ${event.extraAbilityName}</span>`;
            }
            if (type === 'decurse' && event.extraAbilityName) {
                details = `<span class="event-target">Removed: ${event.extraAbilityName}</span>`;
            }

            html += `
                <div class="player-event-item">
                    <span class="event-time">${time}</span>
                    ${details}
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        detailModalBody.innerHTML = html;
        detailModalOverlay.classList.add('active');
    }

    // Show event detail modal (PW:S, Renew)
    function showEventDetail(event, type) {
        let html = '';
        
        const typeLabels = {
            'pws': { icon: '🛡️', name: 'Power Word: Shield' },
            'renew': { icon: '💚', name: 'Renew' },
            'charge': { icon: '⚡', name: 'Charge' }
        };
        
        const typeInfo = typeLabels[type] || { icon: '📌', name: 'Event' };
        
        // Update modal title
        detailModalTitle.textContent = `${typeInfo.icon} ${typeInfo.name} Details`;
        
        // Caster & Target section
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Cast Details</div>
                <div class="detail-grid">
                    <span class="detail-label">Caster</span>
                    <span class="detail-value">${event.sourceName || '#' + event.sourceID}</span>
                    <span class="detail-label">Target</span>
                    <span class="detail-value">${event.targetName || (event.targetID != null ? '#' + event.targetID : 'N/A')}</span>
                    <span class="detail-label">Time</span>
                    <span class="detail-value">${formatTime(event.timestamp)}</span>
                    <span class="detail-label">Ability</span>
                    <span class="detail-value">${event.abilityName || typeInfo.name}</span>
                </div>
            </div>
        `;
        
        // Check if target is a tank
        if (tankNames.size > 0) {
            const targetName = event.targetName || '';
            const isTank = tankNames.has(targetName);
            html += `
                <div class="detail-section">
                    <div class="detail-section-title">Tank Assignment</div>
                    <div class="detail-grid">
                        <span class="detail-label">Target is Tank</span>
                        <span class="detail-value ${isTank ? 'good' : ''}">${isTank ? '✅ Yes' : '❌ No'}</span>
                        <span class="detail-label">Known Tanks</span>
                        <span class="detail-value">${Array.from(tankNames).join(', ')}</span>
                    </div>
                </div>
            `;
        }
        
        // Find the encounter this happened during
        const encounter = findEncounterAtTime(event.timestamp);
        html += `<div class="detail-section">
            <div class="detail-section-title">Encounter (if any)</div>`;
        
        if (encounter) {
            const encDuration = encounter.endTime && encounter.startTime 
                ? Math.round((encounter.endTime - encounter.startTime) / 1000) 
                : 0;
            html += `
                <div class="detail-encounter" style="border-color: ${encounter.kill ? 'var(--success)' : 'var(--error)'}">
                    <div class="detail-encounter-name">${encounter.name || 'Fight #' + encounter.id}</div>
                    <div class="detail-encounter-time">
                        ${formatTime(encounter.startTime)} - ${formatTime(encounter.endTime)} 
                        (${encDuration}s) 
                        ${encounter.kill ? '✅ Kill' : '❌ Wipe'}
                    </div>
                </div>
            `;
        } else {
            html += `<div class="detail-no-encounter">No boss encounter at this time (trash/other)</div>`;
        }
        html += `</div>`;
        
        // Raw event data section
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Raw Event Data</div>
                <div class="detail-grid">
                    <span class="detail-label">Event Type</span>
                    <span class="detail-value">${event.type || 'cast'}</span>
                    <span class="detail-label">Source ID</span>
                    <span class="detail-value">${event.sourceID ?? 'N/A'}</span>
                    <span class="detail-label">Target ID</span>
                    <span class="detail-value">${event.targetID ?? 'N/A'}</span>
                    <span class="detail-label">Ability ID</span>
                    <span class="detail-value">${event.abilityGameID ?? event.ability?.guid ?? 'N/A'}</span>
                    <span class="detail-label">Timestamp (ms)</span>
                    <span class="detail-value">${event.timestamp}</span>
                </div>
            </div>
        `;
        
        detailModalBody.innerHTML = html;
        detailModalOverlay.classList.add('active');
    }

    // Show bloodrage detail modal
    function showBloodrageDetail(br) {
        detailModalTitle.textContent = '💢 Bad Bloodrage Details';
        
        // Extract data - backend sends slightly different format
        const event = {
            timestamp: br.timestamp,
            sourceName: br.sourceName,
            sourceID: br.sourceID,
            abilityName: br.abilityName || 'Bloodrage',
            type: 'cast'
        };
        const secondsBefore = br.secondsBefore || (br.timeBeforeCombatEnd != null ? (br.timeBeforeCombatEnd / 1000).toFixed(1) : 'N/A');
        const combatStart = br.combatStart;
        const combatEnd = br.combatEnd;
        const combatDuration = br.combatDuration;
        const firstDamage = br.firstDamage || null;
        const lastDamage = br.lastDamage || null;
        const outOfCombatDuration = br.outOfCombatDuration;
        const nextCombatStart = br.nextCombatStart;
        const nextCombatFirstDamage = br.nextCombatFirstDamage || null;
        
        let html = '';
        
        // Player & Ability section
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Bloodrage Cast</div>
                <div class="detail-grid">
                    <span class="detail-label">Player</span>
                    <span class="detail-value">${event.sourceName || '#' + event.sourceID}</span>
                    <span class="detail-label">Time</span>
                    <span class="detail-value">${formatTime(event.timestamp)}</span>
                    <span class="detail-label">Ability</span>
                    <span class="detail-value">${event.abilityName || 'Bloodrage'}</span>
                </div>
            </div>
        `;
        
        // Why it's bad section
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Why It's Bad</div>
                <div class="detail-grid">
                    <span class="detail-label">Time to End</span>
                    <span class="detail-value bad">${secondsBefore} seconds before combat ended</span>
                    <span class="detail-label">Detection</span>
                    <span class="detail-value">No raid damage for 3+ seconds after ${combatEnd ? formatTime(combatEnd) : 'N/A'}</span>
                    <span class="detail-label">Type</span>
                    <span class="detail-value">🗑️ Trash Fight</span>
                    <span class="detail-label">Verdict</span>
                    <span class="detail-value bad">Keeps healers stuck in combat - they can't drink!</span>
                </div>
            </div>
        `;
        
        // Combat segment section with detailed damage info
        const firstDamageText = firstDamage 
            ? `(${firstDamage.sourceName} → ${firstDamage.targetName}${firstDamage.amount ? ' for ' + formatNumber(firstDamage.amount) : ''})` 
            : '';
        const lastDamageText = lastDamage 
            ? `(${lastDamage.sourceName} → ${lastDamage.targetName}${lastDamage.amount ? ' for ' + formatNumber(lastDamage.amount) : ''})` 
            : '';
        const nextFirstDamageText = nextCombatFirstDamage 
            ? `(${nextCombatFirstDamage.sourceName} → ${nextCombatFirstDamage.targetName}${nextCombatFirstDamage.amount ? ' for ' + formatNumber(nextCombatFirstDamage.amount) : ''})` 
            : '';
        
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Combat Segment (Detected from ALL events)</div>
                <div class="detail-grid">
                    <span class="detail-label">Combat Start</span>
                    <span class="detail-value">${combatStart ? formatTime(combatStart) : 'N/A'} <span class="detail-damage-info">${firstDamageText}</span></span>
                    <span class="detail-label">Combat End</span>
                    <span class="detail-value">${combatEnd ? formatTime(combatEnd) : 'N/A'} <span class="detail-damage-info">${lastDamageText}</span></span>
                    <span class="detail-label">Combat Duration</span>
                    <span class="detail-value">${combatDuration || 'N/A'}s</span>
                    <span class="detail-label">Out of Combat</span>
                    <span class="detail-value">${outOfCombatDuration != null ? outOfCombatDuration + 's' : 'N/A (end of log)'}</span>
                    <span class="detail-label">Next Combat</span>
                    <span class="detail-value">${nextCombatStart ? formatTime(nextCombatStart) + ' <span class="detail-damage-info">' + nextFirstDamageText + '</span>' : 'N/A (end of log)'}</span>
                </div>
            </div>
        `;
        
        // Encounter section
        const encounter = findEncounterAtTime(event.timestamp);
        html += `<div class="detail-section">
            <div class="detail-section-title">Encounter (if any)</div>`;
        
        if (encounter) {
            const encDuration = encounter.endTime && encounter.startTime 
                ? Math.round((encounter.endTime - encounter.startTime) / 1000) 
                : 0;
            html += `
                <div class="detail-encounter" style="border-color: ${encounter.kill ? 'var(--success)' : 'var(--error)'}">
                    <div class="detail-encounter-name">${encounter.name || 'Fight #' + encounter.id}</div>
                    <div class="detail-encounter-time">
                        ${formatTime(encounter.startTime)} - ${formatTime(encounter.endTime)} 
                        (${encDuration}s) 
                        ${encounter.kill ? '✅ Kill' : '❌ Wipe'}
                    </div>
                </div>
            `;
        } else {
            html += `<div class="detail-no-encounter">No boss encounter at this time (trash/other)</div>`;
        }
        html += `</div>`;
        
        // Raw event data section
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Raw Event Data</div>
                <div class="detail-grid">
                    <span class="detail-label">Event Type</span>
                    <span class="detail-value">${event.type}</span>
                    <span class="detail-label">Source ID</span>
                    <span class="detail-value">${event.sourceID ?? 'N/A'}</span>
                    <span class="detail-label">Timestamp (ms)</span>
                    <span class="detail-value">${event.timestamp}</span>
                </div>
            </div>
        `;
        
        detailModalBody.innerHTML = html;
        detailModalOverlay.classList.add('active');
    }

    // Show charge detail modal
    function showChargeDetail(chargeData) {
        detailModalTitle.textContent = '⚡ Charge Details';
        
        let html = '';
        
        // Cast Details
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Cast Details</div>
                <div class="detail-grid">
                    <span class="detail-label">Charger</span>
                    <span class="detail-value">${chargeData.sourceName}</span>
                    <span class="detail-label">Target</span>
                    <span class="detail-value">${chargeData.targetName}</span>
                    <span class="detail-label">Time</span>
                    <span class="detail-value">${formatTime(chargeData.timestamp)}</span>
                    <span class="detail-label">Target ID</span>
                    <span class="detail-value">${chargeData.targetID}</span>
                </div>
            </div>
        `;
        
        // Stunnable Mob Check
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Mob Type Check</div>
                <div class="detail-grid">
                    <span class="detail-label">Stunnable Mob?</span>
                    <span class="detail-value ${chargeData.isStunnableMob ? 'bad' : 'good'}">${chargeData.isStunnableMob ? '💫 Yes - DO NOT CHARGE' : '✅ No - Safe to charge'}</span>
                </div>
            </div>
        `;
        
        // Tank Check
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Tank Hit Check</div>
                <div class="detail-grid">
                    <span class="detail-label">Tank Hit First?</span>
                    <span class="detail-value ${chargeData.tankHitFirst ? 'good' : 'bad'}">${chargeData.tankHitFirst ? '✅ Yes' : '❌ No'}</span>
        `;
        
        if (chargeData.firstTankHit) {
            html += `
                    <span class="detail-label">Tank Who Hit</span>
                    <span class="detail-value">${chargeData.firstTankHit.sourceName}</span>
                    <span class="detail-label">Tank Ability</span>
                    <span class="detail-value">${chargeData.firstTankHit.abilityName}</span>
                    <span class="detail-label">Tank Hit Time</span>
                    <span class="detail-value">${formatTime(chargeData.firstTankHit.timestamp)}</span>
                    <span class="detail-label">Time Before Charge</span>
                    <span class="detail-value">${Math.round((chargeData.timestamp - chargeData.firstTankHit.timestamp) / 1000)}s</span>
            `;
        } else {
            html += `
                    <span class="detail-label">Note</span>
                    <span class="detail-value bad">No tank damage on this mob before charge</span>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
        
        // Known tanks
        if (tankNames.size > 0) {
            html += `
                <div class="detail-section">
                    <div class="detail-section-title">Known Tanks</div>
                    <div class="detail-grid">
                        <span class="detail-label">Tank Names</span>
                        <span class="detail-value">${Array.from(tankNames).join(', ')}</span>
                    </div>
                </div>
            `;
        }
        
        // Verdict - list all issues
        const isGoodCharge = chargeData.tankHitFirst && !chargeData.isStunnableMob;
        let verdictLines = [];
        
        if (chargeData.isStunnableMob && !chargeData.tankHitFirst) {
            verdictLines.push('❌ Stunnable mob - tank cannot reposition while stunned');
            verdictLines.push('❌ Tank did not hit first - mob may have turned and parried');
        } else if (chargeData.isStunnableMob) {
            verdictLines.push('❌ Stunnable mob - tank cannot reposition while stunned');
        } else if (!chargeData.tankHitFirst) {
            verdictLines.push('❌ Tank did not hit first - mob may have turned and parried');
        } else {
            verdictLines.push('✅ Good charge - tank had aggro, non-stunnable mob');
        }
        
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Verdict</div>
                <div class="detail-verdict ${isGoodCharge ? 'verdict-ok' : 'verdict-bad'}">
                    ${verdictLines.join('<br>')}
                </div>
            </div>
        `;
        
        detailModalBody.innerHTML = html;
        detailModalOverlay.classList.add('active');
    }

    // Close modal
    function closeModal() {
        detailModalOverlay.classList.remove('active');
    }

    // Handle highlights update from server
    function handleHighlightsUpdate(data) {
        console.log('[LIVE] Received update:', data);
        
        switch (data.type) {
            case 'pws':
                displayPwsEvents(data.data);
                break;
            case 'renew':
                displayRenewEvents(data.data);
                break;
            case 'bloodrages':
                displayBloodrages(data.data);
                break;
            case 'charges':
                displayCharges(data.data);
                break;
            case 'interrupts':
                displayInterrupts(data.data);
                break;
            case 'decurses':
                displayDecurses(data.data);
                break;
            case 'sunders':
                displaySunders(data.data);
                break;
            case 'scorches':
                displayScorches(data.data);
                break;
            case 'disarms':
                displayDisarms(data.data);
                break;
            case 'deaths':
                displayDeaths(data.data);
                break;
            case 'curseDamage':
                displayCurseDamage(data.data);
                break;
            case 'spores':
                displaySpores(data.data);
                break;
            case 'playerstats':
                // Build player class map for spore coloring
                playerClassMap = {};
                if (data.data.damage) {
                    data.data.damage.forEach(p => {
                        if (p.name && p.class) playerClassMap[p.name] = p.class.toLowerCase();
                    });
                }
                if (data.data.healing) {
                    data.data.healing.forEach(p => {
                        if (p.name && p.class) playerClassMap[p.name] = p.class.toLowerCase();
                    });
                }
                
                // Store top values for reference bars
                if (data.data.damage && data.data.damage.length > 0) {
                    topDamage = data.data.damage[0].amount;
                }
                if (data.data.healing && data.data.healing.length > 0) {
                    topHealing = data.data.healing[0].amount;
                }
                // Display damage and healing leaderboards
                if (data.data.damage) displayDamageLeaderboard(data.data.damage);
                if (data.data.healing) displayHealingLeaderboard(data.data.healing);
                // Display too-low performance panels
                if (data.data.damage) displayTooLowDamageFromStats(data.data.damage);
                if (data.data.healing) displayTooLowHealingFromStats(data.data.healing);
                break;
            case 'meta':
                // Store fights and tanks for detail modals
                if (data.data.fights) {
                    fightsData = data.data.fights;
                    displayBossEncounters(fightsData);
                }
                if (data.data.tanks) tankNames = new Set(data.data.tanks);
                console.log('[LIVE] Meta updated:', fightsData.length, 'fights,', tankNames.size, 'tanks');
                break;
            case 'clear':
                clearAllPanels();
                fightsData = [];
                tankNames = new Set();
                setStatus('waiting', 'Highlights cleared');
                break;
            case 'stopped':
                setStatus('waiting', 'Session stopped');
                break;
            case 'session-start':
                setStatus('connected', 'Live session active - importing...');
                // Show raid info panel
                if (raidInfoPanel) raidInfoPanel.classList.add('active');
                // Show all grids
                if (highlightsGrid) highlightsGrid.style.display = 'grid';
                if (leaderboardsGrid) leaderboardsGrid.style.display = 'grid';
                if (tooLowGrid) tooLowGrid.style.display = 'grid';
                if (bossEncountersPanel) bossEncountersPanel.classList.add('active');
                // Try to get event info
                const eventId = localStorage.getItem('activeEventSession');
                if (eventId) fetchEventInfo(eventId);
                // Reset raid timer for new session
                raidStartTime = null;
                if (timerInterval) clearInterval(timerInterval);
                if (raidTimer) raidTimer.textContent = '0:00';
                // Show "analyzing" message for panels during import
                pwsList.innerHTML = '<div class="highlight-empty">⏳ Analyzing...</div>';
                renewList.innerHTML = '<div class="highlight-empty">⏳ Analyzing...</div>';
                bloodrageList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                chargeList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (interruptList) interruptList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (decurseList) decurseList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (sunderList) sunderList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (scorchList) scorchList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (disarmList) disarmList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (deathsList) deathsList.innerHTML = '<div class="highlight-empty">⏳ Counting deaths...</div>';
                if (damageList) damageList.innerHTML = '<div class="leaderboard-empty">⏳ Fetching stats...</div>';
                if (healingList) healingList.innerHTML = '<div class="leaderboard-empty">⏳ Fetching stats...</div>';
                if (tooLowDamageList) tooLowDamageList.innerHTML = '<div class="too-low-empty">⏳ Analyzing after import completes...</div>';
                if (tooLowHealingList) tooLowHealingList.innerHTML = '<div class="too-low-empty">⏳ Analyzing after import completes...</div>';
                if (bossEncountersGrid) bossEncountersGrid.innerHTML = '<div class="boss-encounters-empty">⏳ Waiting for boss encounters...</div>';
                break;
        }
    }

    // Clear all panels
    function clearAllPanels() {
        pwsList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        pwsCount.textContent = '0';
        bloodrageList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        bloodrageCount.textContent = '0';
        chargeList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        chargeCount.textContent = '0';
        renewList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        renewCount.textContent = '0';
        if (interruptList) interruptList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (interruptCount) interruptCount.textContent = '0';
        if (decurseList) decurseList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (decurseCount) decurseCount.textContent = '0';
        if (sunderList) sunderList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (sunderCount) sunderCount.textContent = '0';
        if (scorchList) scorchList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (scorchCount) scorchCount.textContent = '0';
        if (disarmList) disarmList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (disarmCount) disarmCount.textContent = '0';
        if (deathsList) deathsList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (deathsCount) deathsCount.textContent = '0';
        if (curseDamageList) curseDamageList.innerHTML = '<div class="highlight-empty">Waiting for data...</div>';
        if (curseDamageCount) curseDamageCount.textContent = '0';
        // Clear spores panel - reset all 8 spore cells
        if (sporeCount) sporeCount.textContent = '0';
        for (let i = 1; i <= 8; i++) {
            const timeEl = document.getElementById(`spore${i}Time`);
            const playersEl = document.getElementById(`spore${i}Players`);
            if (timeEl) timeEl.textContent = '--:--';
            if (playersEl) playersEl.innerHTML = '<span class="spore-cell-empty">Waiting...</span>';
        }
        // Clear leaderboards
        if (damageList) damageList.innerHTML = '<div class="leaderboard-empty">Waiting for data...</div>';
        if (healingList) healingList.innerHTML = '<div class="leaderboard-empty">Waiting for data...</div>';
        if (leaderboardsGrid) leaderboardsGrid.style.display = 'none';
        // Hide highlights grid
        if (highlightsGrid) highlightsGrid.style.display = 'none';
        // Clear too-low panels
        if (tooLowDamageList) tooLowDamageList.innerHTML = '<div class="too-low-empty">Waiting for data...</div>';
        if (tooLowDamageCount) tooLowDamageCount.textContent = '0';
        if (tooLowHealingList) tooLowHealingList.innerHTML = '<div class="too-low-empty">Waiting for data...</div>';
        if (tooLowHealingCount) tooLowHealingCount.textContent = '0';
        if (tooLowGrid) tooLowGrid.style.display = 'none';
        topDamage = 0;
        topHealing = 0;
        // Clear boss encounters panel
        if (bossEncountersGrid) bossEncountersGrid.innerHTML = '<div class="boss-encounters-empty">Waiting for encounter data...</div>';
        if (bossEncountersCount) bossEncountersCount.textContent = '0';
        if (bossEncountersPanel) bossEncountersPanel.classList.remove('active');
        lastBossEncountersKey = ''; // Reset cache key to allow re-render
        // Reset raid info
        if (raidBossCount) raidBossCount.textContent = '0 / 0';
        if (raidTimer) raidTimer.textContent = '0:00';
        raidStartTime = null;
        if (timerInterval) clearInterval(timerInterval);
    }

    // Connect to SSE
    function connect() {
        if (eventSource) {
            eventSource.close();
        }
        
        setStatus('waiting', 'Connecting...');
        
        eventSource = new EventSource('/api/live/stream');
        
        eventSource.addEventListener('init', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Connected:', data);
            
            reconnectAttempts = 0;
            
            if (data.active) {
                setStatus('connected', 'Live session active');
            } else {
                setStatus('waiting', 'Waiting for host to start session');
            }
            
            if (data.viewerCount) {
                viewerCount.textContent = `${data.viewerCount} viewer${data.viewerCount !== 1 ? 's' : ''} connected`;
                if (raidViewerCountEl) raidViewerCountEl.textContent = data.viewerCount;
            }
            
            // Display cached data FIRST so we can show panels based on available data
            let hasCachedData = false;
            if (data.cached) {
                // Load meta first for detail modals and timer
                if (data.cached.meta) {
                    console.log('[LIVE] Cached meta:', JSON.stringify(data.cached.meta).substring(0, 500));
                    if (data.cached.meta.fights && Array.isArray(data.cached.meta.fights)) {
                        fightsData = data.cached.meta.fights;
                        console.log('[LIVE] Fights loaded:', fightsData.length, 'sample:', JSON.stringify(fightsData[0] || {}));
                        displayBossEncounters(fightsData);
                        hasCachedData = fightsData.length > 0;
                    }
                    if (data.cached.meta.tanks) tankNames = new Set(data.cached.meta.tanks);
                    console.log('[LIVE] Cached meta loaded:', fightsData.length, 'fights,', tankNames.size, 'tanks, host:', data.cached.meta.hostName || 'unknown');
                }
                if (data.cached.pws) displayPwsEvents(data.cached.pws);
                if (data.cached.renew) displayRenewEvents(data.cached.renew);
                if (data.cached.bloodrages) displayBloodrages(data.cached.bloodrages);
                if (data.cached.charges) displayCharges(data.cached.charges);
                if (data.cached.interrupts) displayInterrupts(data.cached.interrupts);
                if (data.cached.decurses) displayDecurses(data.cached.decurses);
                if (data.cached.sunders) displaySunders(data.cached.sunders);
                if (data.cached.scorches) displayScorches(data.cached.scorches);
                if (data.cached.disarms) displayDisarms(data.cached.disarms);
                if (data.cached.deaths) displayDeaths(data.cached.deaths);
                if (data.cached.curseDamage) displayCurseDamage(data.cached.curseDamage);
                if (data.cached.spores) displaySpores(data.cached.spores);
                if (data.cached.playerstats) {
                    // Store top values for reference bars (needed by Too Low panels)
                    if (data.cached.playerstats.damage && data.cached.playerstats.damage.length > 0) {
                        topDamage = data.cached.playerstats.damage[0].amount;
                    }
                    if (data.cached.playerstats.healing && data.cached.playerstats.healing.length > 0) {
                        topHealing = data.cached.playerstats.healing[0].amount;
                    }
                    // Display leaderboards
                    if (data.cached.playerstats.damage) displayDamageLeaderboard(data.cached.playerstats.damage);
                    if (data.cached.playerstats.healing) displayHealingLeaderboard(data.cached.playerstats.healing);
                    // Display too-low performance panels
                    if (data.cached.playerstats.damage) displayTooLowDamageFromStats(data.cached.playerstats.damage);
                    if (data.cached.playerstats.healing) displayTooLowHealingFromStats(data.cached.playerstats.healing);
                }
            }
            
            // Show raid info panel and highlights grid if session is active OR we have cached data
            if ((data.active || hasCachedData) && raidInfoPanel) {
                raidInfoPanel.classList.add('active');
                // Try to get event info from localStorage
                const eventId = localStorage.getItem('activeEventSession');
                if (eventId) {
                    fetchEventInfo(eventId);
                }
            }
            
            // Show highlights grid when there's an active session or cached data
            if ((data.active || hasCachedData) && highlightsGrid) {
                highlightsGrid.style.display = 'grid';
            }
            
            // Update host name from session or cached meta
            if (data.session && raidHostName) {
                // Active session - use session host name
                if (data.session.hostName && data.session.hostName !== 'Unknown') {
                    raidHostName.textContent = data.session.hostName;
                } else {
                    raidHostName.textContent = 'Active Session';
                }
            } else if (data.cached && data.cached.meta && data.cached.meta.hostName && raidHostName) {
                // No active session but have cached meta with host name
                raidHostName.textContent = data.cached.meta.hostName;
            } else if (hasCachedData && raidHostName) {
                // Fallback
                raidHostName.textContent = '--';
            }
        });
        
        eventSource.addEventListener('highlights-update', (e) => {
            const data = JSON.parse(e.data);
            handleHighlightsUpdate(data);
        });
        
        // Smooth countdown animation state
        let countdownAnimationFrame = null;
        let countdownStartTime = null;
        let countdownTotalWait = null;
        
        function animateCountdown() {
            if (!countdownStartTime || !countdownTotalWait) return;
            
            const now = Date.now();
            const elapsed = now - countdownStartTime;
            const progress = Math.min(100, (elapsed / countdownTotalWait) * 100);
            
            if (countdownBar) {
                countdownBar.style.width = `${progress}%`;
            }
            
            // Calculate time remaining
            const remainingMs = Math.max(0, countdownTotalWait - elapsed);
            const seconds = Math.round(remainingMs / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            const timeStr = minutes > 0 ? `${minutes}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
            
            if (countdownTime) {
                countdownTime.textContent = timeStr;
            }
            
            // Continue animating if not complete
            if (progress < 100) {
                countdownAnimationFrame = requestAnimationFrame(animateCountdown);
            }
        }
        
        eventSource.addEventListener('heartbeat', (e) => {
            const data = JSON.parse(e.data);
            if (data.viewerCount) {
                viewerCount.textContent = `${data.viewerCount} viewer${data.viewerCount !== 1 ? 's' : ''} connected`;
                if (raidViewerCountEl) raidViewerCountEl.textContent = data.viewerCount;
            }
            
            // Show countdown timer if next refresh is known
            if (data.nextRefreshIn != null && countdownSection) {
                countdownSection.style.display = 'block';
                
                const totalWait = data.refreshCount === 1 ? 10000 : 180000; // 10s or 3min
                
                // Initialize smooth animation if not already running
                if (!countdownStartTime || !countdownAnimationFrame) {
                    countdownTotalWait = totalWait;
                    countdownStartTime = Date.now() - (totalWait - data.nextRefreshIn);
                    
                    // Cancel any existing animation
                    if (countdownAnimationFrame) {
                        cancelAnimationFrame(countdownAnimationFrame);
                    }
                    
                    // Start smooth animation
                    animateCountdown();
                }
            }
        });
        
        eventSource.onerror = () => {
            if (eventSource.readyState === EventSource.CLOSED) {
                setStatus('waiting', 'Disconnected');
                
                // Attempt to reconnect
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    setTimeout(() => {
                        console.log(`[LIVE] Reconnecting... (attempt ${reconnectAttempts})`);
                        connect();
                    }, RECONNECT_DELAY);
                } else {
                    setStatus('waiting', 'Connection lost. Refresh to retry.');
                }
            }
        };
    }

    // Event listeners
    if (detailModalClose) {
        detailModalClose.addEventListener('click', closeModal);
    }
    
    if (detailModalOverlay) {
        detailModalOverlay.addEventListener('click', (e) => {
            if (e.target === detailModalOverlay) {
                closeModal();
            }
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Check if user has management role and show host button (only if no active session)
    async function checkManagementRoleAndSession() {
        const hostSection = document.getElementById('hostSection');
        if (!hostSection) return;
        
        try {
            // Check both user role and session status
            const [userResponse, statusResponse] = await Promise.all([
                fetch('/user'),
                fetch('/api/live/status')
            ]);
            
            let isManagement = false;
            let isSessionActive = false;
            
            if (userResponse.ok) {
                const user = await userResponse.json();
                isManagement = user.loggedIn && user.hasManagementRole;
            }
            
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                isSessionActive = status.active;
            }
            
            // Only show host button if user is management AND no active session
            if (isManagement && !isSessionActive) {
                hostSection.style.display = 'block';
            } else {
                hostSection.style.display = 'none';
            }
        } catch (err) {
            // Silent fail - don't show button
            hostSection.style.display = 'none';
        }
    }
    
    // Check management role and session status on load
    checkManagementRoleAndSession();
    
    // Start connection
    connect();
})();
