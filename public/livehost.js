// Live Host - WCL Event Streaming Client
(() => {
    // DOM Elements
    const reportInput = document.getElementById('reportInput');
    const eventIdDisplay = document.getElementById('eventIdDisplay');
    const goBtn = document.getElementById('goBtn');
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusDot = document.getElementById('statusDot');
    const statusMessage = document.getElementById('statusMessage');
    const eventCount = document.getElementById('eventCount');
    const statsGrid = document.getElementById('statsGrid');
    const statEvents = document.getElementById('statEvents');
    const statPages = document.getElementById('statPages');
    const statFights = document.getElementById('statFights');
    const statActors = document.getElementById('statActors');
    const fightsPanel = document.getElementById('fightsPanel');
    const fightsList = document.getElementById('fightsList');
    const eventStream = document.getElementById('eventStream');
    const eventTableBody = document.getElementById('eventTableBody');
    const emptyState = document.getElementById('emptyState');
    const clearBtn = document.getElementById('clearBtn');
    const scrollBtn = document.getElementById('scrollBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const phaseTracker = document.getElementById('phaseTracker');
    const phaseList = document.getElementById('phaseList');

    // State
    let eventSource = null;
    let autoScroll = true;
    let totalEvents = 0;
    let pagesStored = 0;
    let actorCount = 0;
    let fightsCount = 0;
    let phases = {}; // Track phase completion
    let eventsBuffer = []; // Virtual scroll buffer - only keep last N events in DOM
    const MAX_DOM_EVENTS = 500; // Reduced for production
    let currentReportCode = null; // Track current report code for saving highlights
    let isHostingSession = false; // Track if actively hosting a session
    let titleFlashInterval = null; // For flashing browser tab title
    const originalTitle = document.title;
    
    // Phase Tracker Functions
    function addPhase(id, label) {
        if (phases[id]) return; // Already exists
        phases[id] = { label, status: 'pending', element: null };
        
        const phaseEl = document.createElement('div');
        phaseEl.id = `phase-${id}`;
        phaseEl.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);';
        phaseEl.innerHTML = `
            <span style="width: 20px; text-align: center;">⏳</span>
            <span style="flex: 1;">${label}</span>
            <span style="font-size: 11px; color: var(--text-dim);">pending</span>
        `;
        
        phaseList.appendChild(phaseEl);
        phases[id].element = phaseEl;
        phaseTracker.style.display = 'block';
    }
    
    function updatePhaseStatus(id, status, message = '') {
        if (!phases[id]) {
            addPhase(id, message || id);
        }
        
        const phase = phases[id];
        phase.status = status;
        
        let icon = '⏳';
        let statusText = 'pending';
        let color = 'var(--text-dim)';
        
        if (status === 'running') {
            icon = '⚙️';
            statusText = 'running';
            color = 'var(--warning)';
        } else if (status === 'complete') {
            icon = '✅';
            statusText = 'OK';
            color = 'var(--success)';
        } else if (status === 'error') {
            icon = '❌';
            statusText = 'error';
            color = 'var(--error)';
        }
        
        phase.element.innerHTML = `
            <span style="width: 20px; text-align: center;">${icon}</span>
            <span style="flex: 1;">${phase.label}</span>
            <span style="font-size: 11px; color: ${color}; font-weight: 600;">${statusText}</span>
        `;
    }
    
    function clearPhases() {
        phases = {};
        phaseList.innerHTML = '';
        phaseTracker.style.display = 'none';
    }

    // Flash the browser tab title when hosting to prevent accidental close
    function startTitleFlash() {
        if (titleFlashInterval) return; // Already flashing
        let showLive = true;
        titleFlashInterval = setInterval(() => {
            document.title = showLive ? '🟢 LIVE | Hosting Session' : '⚫ LIVE | Hosting Session';
            showLive = !showLive;
        }, 333); // ~3 blinks per second
        // Set initial title immediately
        document.title = '🟢 LIVE | Hosting Session';
    }
    
    function stopTitleFlash() {
        if (titleFlashInterval) {
            clearInterval(titleFlashInterval);
            titleFlashInterval = null;
        }
        document.title = originalTitle;
    }
    
    // Prevent accidental page close while hosting
    window.addEventListener('beforeunload', (e) => {
        if (isHostingSession) {
            e.preventDefault();
            e.returnValue = 'You are currently hosting a live session. Are you sure you want to leave? This will end the session for all viewers.';
            return e.returnValue;
        }
    });
    
    // Throttle for sending highlights during import
    let lastPwsSendTime = 0;
    let lastRenewSendTime = 0;
    const HIGHLIGHT_SEND_INTERVAL = 2000; // Send updates every 2 seconds
    
    // Highlight tracking
    let allEvents = []; // Store all events for analysis
    let combatSegments = []; // Detected combat segments { startTime, endTime }
    const COMBAT_GAP_MS = 3000; // 3 seconds of no damage from ANYONE = combat ended
    
    // Highlight panels
    const pwsPanel = document.getElementById('pwsPanel');
    const pwsList = document.getElementById('pwsList');
    const bloodragePanel = document.getElementById('bloodragePanel');
    const bloodrageList = document.getElementById('bloodrageList');
    const chargePanel = document.getElementById('chargePanel');
    const chargeList = document.getElementById('chargeList');
    const renewPanel = document.getElementById('renewPanel');
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
    
    // Spores panel elements
    const sporesPanel = document.getElementById('sporesPanel');
    const sporesGrid = document.getElementById('sporesGrid');
    const sporeCount = document.getElementById('sporeCount');
    
    // Leaderboard elements
    const leaderboardsGrid = document.getElementById('leaderboardsGrid');
    const damageList = document.getElementById('damageList');
    const healingList = document.getElementById('healingList');
    
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
    
    // Tank names from assignments (fetched from event)
    let tankNames = new Set();
    let isImporting = false;

    // Highlight counters
    const pwsCount = document.getElementById('pwsCount');
    const bloodrageCount = document.getElementById('bloodrageCount');
    const chargeCount = document.getElementById('chargeCount');
    const highlightsGrid = document.getElementById('highlightsGrid');
    const statProcessed = document.getElementById('statProcessed');
    const statDamage = document.getElementById('statDamage');
    let processedCount = 0;
    let damageEventCount = 0;
    
    // Modal elements
    const detailModalOverlay = document.getElementById('detailModalOverlay');
    const detailModalBody = document.getElementById('detailModalBody');
    const detailModalTitle = document.getElementById('detailModalTitle');
    const detailModalClose = document.getElementById('detailModalClose');
    
    // Fights data for encounter matching
    let fightsData = [];
    
    // Highlight data
    let pwsEvents = [];
    let chargeEvents = [];
    let renewEvents = [];
    let damageTimestamps = []; // For combat detection
    
    // Format timestamp with milliseconds
    function formatTime(ms) {
        if (ms == null) return '--:--:--';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSec % 60).toString().padStart(2, '0');
        const msP = (ms % 1000).toString().padStart(3, '0');
        return `${h}:${m}:${s}.${msP}`;
    }
    
    // Format timestamp without milliseconds (for highlight panels)
    function formatTimeShort(ms) {
        if (ms == null) return '--:--:--';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    // Format number with commas
    function formatNumber(n) {
        if (n == null) return '';
        return n.toLocaleString();
    }

    // Get event type class
    function getTypeClass(type) {
        const t = String(type || '').toLowerCase();
        return `type-${t}`;
    }

    // Get hit type description
    function getHitType(hitType) {
        const types = {
            1: '',        // Normal
            2: 'crit',    // Critical
            4: 'crush',   // Crushing
            8: 'glance',  // Glancing
            16: 'dodge',
            32: 'parry',
            64: 'block',
            128: 'miss',
            256: 'evade',
            512: 'immune',
            1024: 'deflect',
            2048: 'absorb',
            4096: 'resist',
        };
        return types[hitType] || '';
    }

    // Detect combat segments from damage timestamps
    function detectCombatSegments() {
        if (damageTimestamps.length === 0) return [];
        
        const sorted = [...damageTimestamps].sort((a, b) => a - b);
        const segments = [];
        let segmentStart = sorted[0];
        let lastTime = sorted[0];
        
        for (let i = 1; i < sorted.length; i++) {
            const gap = sorted[i] - lastTime;
            if (gap > COMBAT_GAP_MS) {
                // End current segment, start new one
                segments.push({ startTime: segmentStart, endTime: lastTime });
                segmentStart = sorted[i];
            }
            lastTime = sorted[i];
        }
        
        // Add final segment
        segments.push({ startTime: segmentStart, endTime: lastTime });
        
        return segments;
    }
    
    // Check if a bloodrage is "bad"
    // ONLY checks TRASH fights - boss encounters are completely excluded
    function isNearCombatEnd(timestamp, segments) {
        // First check if this is during a boss encounter - if so, skip entirely
        const encounter = findEncounterAtTime(timestamp);
        if (encounter) {
            // During a boss fight - never flag (too unreliable with phase transitions, etc.)
            return { isBad: false };
        }
        
        // TRASH ONLY: Use damage gap detection
        for (const seg of segments) {
            if (timestamp >= seg.startTime && timestamp <= seg.endTime) {
                const timeToCombatEnd = seg.endTime - timestamp;
                if (timeToCombatEnd <= 3000) {
                    return { 
                        isBad: true, 
                        secondsBefore: Math.round(timeToCombatEnd / 1000),
                        combatStart: seg.startTime,
                        combatEnd: seg.endTime,
                        combatDuration: Math.round((seg.endTime - seg.startTime) / 1000),
                        encounter: null,
                        reason: 'trash'
                    };
                }
            }
        }
        return { isBad: false };
    }
    
    // Process event for highlights
    function processEventForHighlights(event) {
        processedCount++;
        if (statProcessed) statProcessed.textContent = formatNumber(processedCount);
        
        const abilityName = event.abilityName || event.ability?.name || '';
        const type = String(event.type || '').toLowerCase();
        
        // Track damage timestamps for combat detection
        if (type === 'damage' && event.timestamp) {
            damageTimestamps.push(event.timestamp);
            damageEventCount++;
            if (statDamage) statDamage.textContent = formatNumber(damageEventCount);
        }
        
        // Power Word: Shield - cast or applybuff (case-insensitive check)
        // Only include if cast on a tank (not self-cast)
        if ((type === 'cast' || type === 'applybuff') && abilityName.toLowerCase().includes('power word: shield')) {
            const targetName = event.targetName || '';
            const sourceName = event.sourceName || '';
            // Only add if target is a tank and not self-cast
            if (tankNames.size === 0 || (tankNames.has(targetName) && targetName !== sourceName)) {
                pwsEvents.push(event);
            }
        }
        
        // Renew - cast or applybuff on tanks
        if ((type === 'cast' || type === 'applybuff') && abilityName.toLowerCase() === 'renew') {
            const targetName = event.targetName || '';
            // Only add if target is a tank
            if (tankNames.size === 0 || tankNames.has(targetName)) {
                renewEvents.push(event);
            }
        }
        
        // Charge - cast only (case-insensitive)
        if (type === 'cast' && abilityName.toLowerCase() === 'charge') {
            chargeEvents.push(event);
        }
        
        // Bloodrage - tracked server-side for accurate combat detection
        // (no client-side collection needed)
    }
    
    // Render highlight item (no inline icons - icons are in panel headers now)
    function createHighlightItem(event, isBad = false, meta = '') {
        const item = document.createElement('div');
        item.className = `highlight-item${isBad ? ' bad' : ''}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'time';
        timeSpan.textContent = formatTimeShort(event.timestamp);
        
        const sourceSpan = document.createElement('span');
        // Add class color based on sourceSubType (the player's class)
        const sourceClass = getClassColor(event.sourceSubType);
        sourceSpan.className = `source ${sourceClass}`;
        sourceSpan.textContent = event.sourceName || `#${event.sourceID}`;
        
        const targetSpan = document.createElement('span');
        // Add class color for target if they're a player
        const targetClass = getClassColor(event.targetSubType);
        targetSpan.className = `target ${targetClass}`;
        targetSpan.textContent = event.targetName || `#${event.targetID}`;
        
        item.appendChild(timeSpan);
        item.appendChild(sourceSpan);
        
        // Only show target if different from source
        if (event.targetName && event.targetName !== event.sourceName) {
            item.appendChild(targetSpan);
        }
        
        if (meta) {
            const metaSpan = document.createElement('span');
            metaSpan.className = 'meta';
            metaSpan.textContent = meta;
            item.appendChild(metaSpan);
        }
        
        return item;
    }
    
    // Update all highlight panels
    function updateHighlights() {
        const segments = detectCombatSegments();
        
        // Show highlights grid
        highlightsGrid.style.display = 'grid';
        
        // PW:S Panel - only shields on tanks
        pwsList.innerHTML = '';
        if (pwsEvents.length === 0) {
            if (tankNames.size === 0) {
                pwsList.innerHTML = '<div class="highlight-empty">No event in localStorage - showing all</div>';
            } else {
                pwsList.innerHTML = '<div class="highlight-empty">No shields on tanks yet</div>';
            }
        } else {
            // Show most recent first, limit to 50
            const recent = pwsEvents.slice(-50).reverse();
            for (const evt of recent) {
                const item = createHighlightItem(evt);
                item.classList.add('clickable');
                item.addEventListener('click', () => showEventDetail(evt, 'pws'));
                pwsList.appendChild(item);
            }
        }
        pwsCount.textContent = pwsEvents.length;
        
        // Renew Panel - only renews on tanks
        if (renewList) {
            renewList.innerHTML = '';
            if (renewEvents.length === 0) {
                if (tankNames.size === 0) {
                    renewList.innerHTML = '<div class="highlight-empty">No event in localStorage - showing all</div>';
                } else {
                    renewList.innerHTML = '<div class="highlight-empty">No renews on tanks yet</div>';
                }
            } else {
                // Show most recent first, limit to 50
                const recent = renewEvents.slice(-50).reverse();
                for (const evt of recent) {
                    const item = createHighlightItem(evt);
                    item.classList.add('clickable');
                    item.addEventListener('click', () => showEventDetail(evt, 'renew'));
                    renewList.appendChild(item);
                }
            }
            if (renewCount) renewCount.textContent = renewEvents.length;
        }
        
        // Charge Panel - show count during import, full analysis comes from backend
        // Only update count if backend hasn't sent results yet
        if (chargeCount && chargeList.querySelector('.highlight-empty')) {
            chargeCount.textContent = chargeEvents.length || '...';
        }
        
        // Bloodrage Panel - handled by backend analysis (displayBackendBloodrages)
        // Don't update here - backend sends accurate results after import completes
    }
    
    // Create table row for event
    function createEventRow(event) {
        const row = document.createElement('tr');
        
        // Time
        const timeCell = document.createElement('td');
        timeCell.className = 'col-time';
        timeCell.textContent = formatTime(event.timestamp);
        row.appendChild(timeCell);
        
        // Type
        const typeCell = document.createElement('td');
        typeCell.className = `col-type ${getTypeClass(event.type)}`;
        typeCell.textContent = event.type || 'event';
        row.appendChild(typeCell);
        
        // Source
        const sourceCell = document.createElement('td');
        sourceCell.className = 'col-source';
        sourceCell.textContent = event.sourceName || (event.sourceID != null ? `#${event.sourceID}` : '');
        sourceCell.title = event.sourceType ? `${event.sourceType}${event.sourceSubType ? ' - ' + event.sourceSubType : ''}` : '';
        row.appendChild(sourceCell);
        
        // Target
        const targetCell = document.createElement('td');
        targetCell.className = 'col-target';
        targetCell.textContent = event.targetName || (event.targetID != null ? `#${event.targetID}` : '');
        targetCell.title = event.targetType ? `${event.targetType}${event.targetSubType ? ' - ' + event.targetSubType : ''}` : '';
        row.appendChild(targetCell);
        
        // Ability
        const abilityCell = document.createElement('td');
        abilityCell.className = 'col-ability';
        abilityCell.textContent = event.abilityName || event.ability?.name || (event.abilityGameID ? `#${event.abilityGameID}` : '');
        row.appendChild(abilityCell);
        
        // Amount
        const amountCell = document.createElement('td');
        amountCell.className = 'col-amount';
        if (event.amount != null) {
            const type = String(event.type || '').toLowerCase();
            let amountClass = '';
            if (type.includes('damage')) amountClass = 'amount-damage';
            else if (type.includes('heal')) amountClass = 'amount-heal';
            else if (type.includes('absorb')) amountClass = 'amount-absorbed';
            
            const hitType = getHitType(event.hitType);
            const isCrit = hitType === 'crit';
            
            amountCell.innerHTML = `<span class="${amountClass}${isCrit ? ' crit' : ''}">${formatNumber(event.amount)}</span>`;
        }
        row.appendChild(amountCell);
        
        // Extra details
        const extraCell = document.createElement('td');
        extraCell.className = 'col-extra';
        const extras = [];
        
        if (event.absorbed) extras.push(`<span class="badge badge-absorbed">Absorbed: ${formatNumber(event.absorbed)}</span>`);
        if (event.blocked) extras.push(`<span class="badge badge-blocked">Blocked: ${formatNumber(event.blocked)}</span>`);
        if (event.overkill) extras.push(`<span class="badge badge-overkill">Overkill: ${formatNumber(event.overkill)}</span>`);
        if (event.overheal) extras.push(`<span class="badge badge-overheal">Overheal: ${formatNumber(event.overheal)}</span>`);
        if (event.mitigated) extras.push(`Mitigated: ${formatNumber(event.mitigated)}`);
        if (event.stack) extras.push(`Stack: ${event.stack}`);
        
        // Encounter info
        if (event.encounterName || event.name) {
            extras.push(`<strong>${event.encounterName || event.name}</strong>`);
        }
        if (event.kill === true) extras.push('✓ Kill');
        if (event.kill === false) extras.push('✗ Wipe');
        
        extraCell.innerHTML = extras.join(' ');
        row.appendChild(extraCell);
        
        return row;
    }

    // Add events to stream with virtual scrolling
    function addEventsToStream(events) {
        if (!events || events.length === 0) return;
        
        // Hide empty state
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        // Check if table body exists
        if (!eventTableBody) {
            console.error('[LIVE] eventTableBody not found!');
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        for (const event of events) {
            eventsBuffer.push(event);
            allEvents.push(event);
            processEventForHighlights(event);
            fragment.appendChild(createEventRow(event));
        }
        
        eventTableBody.appendChild(fragment);
        
        // Update highlights after processing batch
        updateHighlights();
        
        // Virtual scroll: remove old rows if buffer exceeds limit
        while (eventTableBody.children.length > MAX_DOM_EVENTS) {
            eventTableBody.removeChild(eventTableBody.firstChild);
        }
        
        // Auto-scroll
        if (autoScroll) {
            eventStream.scrollTop = eventStream.scrollHeight;
        }
    }

    // Update progress UI
    function updateProgress(percent, message) {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
        if (message) {
            statusMessage.textContent = message;
        }
    }

    // Update stats
    function updateStats() {
        statEvents.textContent = formatNumber(totalEvents);
        statPages.textContent = formatNumber(pagesStored);
        statFights.textContent = formatNumber(fightsCount);
        statActors.textContent = formatNumber(actorCount);
        eventCount.textContent = `${formatNumber(totalEvents)} events`;
    }

    // Set status
    function setStatus(status, message) {
        statusDot.className = `status-dot ${status}`;
        statusMessage.textContent = message;
    }

    // Render fights
    function renderFights(fights) {
        if (!fights || fights.length === 0) return;
        
        // Store fights for encounter matching
        fightsData = fights;
        
        fightsPanel.classList.add('active');
        fightsList.innerHTML = '';
        
        for (const fight of fights) {
            const card = document.createElement('div');
            card.className = `fight-card ${fight.kill ? 'kill' : 'wipe'}`;
            
            const name = document.createElement('div');
            name.className = 'fight-name';
            name.textContent = fight.name || `Fight ${fight.id}`;
            
            const time = document.createElement('div');
            time.className = 'fight-time';
            const duration = fight.endTime && fight.startTime 
                ? Math.round((fight.endTime - fight.startTime) / 1000) 
                : 0;
            time.textContent = `${formatTime(fight.startTime)} • ${duration}s`;
            
            card.appendChild(name);
            card.appendChild(time);
            fightsList.appendChild(card);
        }
        
        fightsCount = fights.length;
        updateStats();
    }
    
    // Find which BOSS encounter a timestamp falls within
    // Only returns true boss encounters (with encounterID), not trash fights
    function findEncounterAtTime(timestamp) {
        for (const fight of fightsData) {
            // Only consider real boss encounters (encounterID > 0)
            // Trash fights have encounterID = 0 or undefined
            if (fight.encounterID && fight.encounterID > 0) {
                if (timestamp >= fight.startTime && timestamp <= fight.endTime) {
                    return fight;
                }
            }
        }
        return null;
    }
    
    // Show bloodrage detail modal
    function showBloodrageDetail(data) {
        const { event, secondsBefore, combatStart, combatEnd, combatDuration } = data;
        // Additional data from backend analysis
        const firstDamage = data.firstDamage || null;
        const lastDamage = data.lastDamage || null;
        const outOfCombatDuration = data.outOfCombatDuration;
        const nextCombatStart = data.nextCombatStart;
        const nextCombatFirstDamage = data.nextCombatFirstDamage || null;
        
        // Update modal title
        if (detailModalTitle) {
            detailModalTitle.textContent = '💢 Bad Bloodrage Details';
        }
        
        // Find the encounter this happened during
        const encounter = findEncounterAtTime(event.timestamp);
        
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
        
        // Why it's bad section (trash only now)
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Why It's Bad</div>
                <div class="detail-grid">
                    <span class="detail-label">Time to End</span>
                    <span class="detail-value bad">${secondsBefore} seconds before combat ended</span>
                    <span class="detail-label">Detection</span>
                    <span class="detail-value">No raid damage for 3+ seconds after ${formatTime(combatEnd)}</span>
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
                    <span class="detail-value">${formatTime(combatStart)} <span class="detail-damage-info">${firstDamageText}</span></span>
                    <span class="detail-label">Combat End</span>
                    <span class="detail-value">${formatTime(combatEnd)} <span class="detail-damage-info">${lastDamageText}</span></span>
                    <span class="detail-label">Combat Duration</span>
                    <span class="detail-value">${combatDuration}s</span>
                    <span class="detail-label">Out of Combat</span>
                    <span class="detail-value">${outOfCombatDuration != null ? outOfCombatDuration + 's' : 'N/A (end of log)'}</span>
                    <span class="detail-label">Next Combat</span>
                    <span class="detail-value">${nextCombatStart ? formatTime(nextCombatStart) + ' <span class="detail-damage-info">' + nextFirstDamageText + '</span>' : 'N/A (end of log)'}</span>
                </div>
            </div>
        `;
        
        // Encounter section
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
    
    // Close modal
    function closeDetailModal() {
        detailModalOverlay.classList.remove('active');
    }
    
    // Show generic event detail modal (for PW:S, Renew, Charge)
    function showEventDetail(event, type) {
        let html = '';
        
        const typeLabels = {
            'pws': { icon: '🛡️', name: 'Power Word: Shield' },
            'renew': { icon: '💚', name: 'Renew' },
            'charge': { icon: '⚡', name: 'Charge' }
        };
        
        const typeInfo = typeLabels[type] || { icon: '📌', name: 'Event' };
        
        // Update modal title
        if (detailModalTitle) {
            detailModalTitle.textContent = `${typeInfo.icon} ${typeInfo.name} Details`;
        }
        
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
                    <span class="detail-value">${event.type}</span>
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
    
    // Display bad bloodrages from backend analysis
    function displayBackendBloodrages(badBloodrages, totalBloodrages) {
        // Show highlights grid
        highlightsGrid.style.display = 'grid';
        
        bloodrageList.innerHTML = '';
        
        if (badBloodrages.length === 0) {
            bloodrageList.innerHTML = '<div class="highlight-empty">No bad bloodrages found 👍</div>';
        } else {
            // Show most recent first (reverse the array)
            const recent = badBloodrages.slice().reverse().slice(0, 100);
            for (const br of recent) {
                const item = document.createElement('div');
                item.className = 'highlight-item clickable';
                
                // Store data for click handler
                const brData = {
                    event: {
                        timestamp: br.timestamp,
                        sourceName: br.sourceName,
                        sourceID: br.sourceID,
                        abilityName: br.abilityName,
                        type: 'cast'
                    },
                    secondsBefore: br.secondsBefore,
                    combatStart: br.combatStart,
                    combatEnd: br.combatEnd,
                    combatDuration: br.combatDuration,
                    reason: 'trash',
                    // Additional data from backend
                    firstDamage: br.firstDamage,
                    lastDamage: br.lastDamage,
                    outOfCombatDuration: br.outOfCombatDuration,
                    nextCombatStart: br.nextCombatStart,
                    nextCombatFirstDamage: br.nextCombatFirstDamage
                };
                
                item.addEventListener('click', () => showBloodrageDetail(brData));
                
                const timeSpan = document.createElement('span');
                timeSpan.className = 'time';
                timeSpan.textContent = formatTimeShort(br.timestamp);
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(br.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = br.sourceName;
                
                const metaSpan = document.createElement('span');
                metaSpan.className = 'meta';
                metaSpan.textContent = `${br.secondsBefore}s before end`;
                
                item.appendChild(timeSpan);
                item.appendChild(sourceSpan);
                item.appendChild(metaSpan);
                
                bloodrageList.appendChild(item);
            }
        }
        
        bloodrageCount.textContent = badBloodrages.length;
        
        console.log(`[LIVE] Displayed ${badBloodrages.length} bad bloodrages (from backend analysis of all events)`);
    }
    
    // Display charges from backend analysis
    function displayBackendCharges(charges, totalCharges, badCharges) {
        // Show highlights grid
        highlightsGrid.style.display = 'grid';
        
        chargeList.innerHTML = '';
        
        if (charges.length === 0) {
            chargeList.innerHTML = '<div class="highlight-empty">No charges yet</div>';
        } else {
            // Show most recent first (reverse the array)
            const recent = charges.slice().reverse().slice(0, 100);
            for (const ch of recent) {
                const item = document.createElement('div');
                item.className = 'highlight-item clickable';
                
                item.addEventListener('click', () => showChargeDetail(ch));
                
                const timeSpan = document.createElement('span');
                timeSpan.className = 'time';
                timeSpan.textContent = formatTimeShort(ch.timestamp);
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(ch.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = ch.sourceName;
                
                const targetSpan = document.createElement('span');
                targetSpan.className = 'target';
                targetSpan.textContent = ch.targetName;
                
                // Determine charge status icon
                const statusIcon = document.createElement('span');
                statusIcon.className = 'charge-status-icon';
                
                if (ch.isStunnableMob) {
                    // Stunnable mob - bad charge
                    statusIcon.textContent = '💫❌';
                    statusIcon.className += ' bad';
                    statusIcon.title = 'Stunnable mob - tank cannot reposition';
                } else if (!ch.tankHitFirst) {
                    // Tank didn't hit first - bad charge
                    statusIcon.textContent = '🛡️❌';
                    statusIcon.className += ' bad';
                    statusIcon.title = 'Tank did not hit this mob first';
                } else {
                    // Good charge
                    statusIcon.textContent = '✅';
                    statusIcon.className += ' good';
                    statusIcon.title = 'Good charge - tank had aggro';
                }
                
                item.appendChild(statusIcon);
                item.appendChild(timeSpan);
                item.appendChild(sourceSpan);
                item.appendChild(targetSpan);
                
                chargeList.appendChild(item);
            }
        }
        
        chargeCount.textContent = totalCharges;
        
        console.log(`[LIVE] Displayed ${charges.length} charges (${badCharges} bad)`);
    }
    
    // Display interrupts from backend analysis - player leaderboard
    function displayInterrupts(playerStats, totalInterrupts) {
        highlightsGrid.style.display = 'grid';
        if (!interruptList) return;
        
        interruptList.innerHTML = '';
        
        if (!playerStats || playerStats.length === 0) {
            interruptList.innerHTML = '<div class="highlight-empty">No interrupts found</div>';
        } else {
            for (const player of playerStats) {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(player.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = player.name;
                
                const countSpan = document.createElement('span');
                countSpan.className = 'meta';
                countSpan.textContent = player.count;
                countSpan.style.marginLeft = 'auto';
                countSpan.style.fontWeight = 'bold';
                
                item.appendChild(sourceSpan);
                item.appendChild(countSpan);
                
                interruptList.appendChild(item);
            }
        }
        
        if (interruptCount) interruptCount.textContent = totalInterrupts;
        console.log(`[LIVE] Displayed ${playerStats?.length || 0} players with interrupts`);
    }
    
    // Display decurses from backend analysis - player leaderboard
    function displayDecurses(playerStats, totalDecurses) {
        highlightsGrid.style.display = 'grid';
        if (!decurseList) return;
        
        decurseList.innerHTML = '';
        
        if (!playerStats || playerStats.length === 0) {
            decurseList.innerHTML = '<div class="highlight-empty">No decurses found</div>';
        } else {
            for (const player of playerStats) {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(player.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = player.name;
                
                const countSpan = document.createElement('span');
                countSpan.className = 'meta';
                countSpan.textContent = player.count;
                countSpan.style.marginLeft = 'auto';
                countSpan.style.fontWeight = 'bold';
                
                item.appendChild(sourceSpan);
                item.appendChild(countSpan);
                
                decurseList.appendChild(item);
            }
        }
        
        if (decurseCount) decurseCount.textContent = totalDecurses;
        console.log(`[LIVE] Displayed ${playerStats?.length || 0} players with decurses`);
    }
    
    // Display effective sunders from backend analysis - player leaderboard
    function displaySunders(playerStats, effectiveSunders, totalSunders) {
        highlightsGrid.style.display = 'grid';
        if (!sunderList) return;
        
        sunderList.innerHTML = '';
        
        if (!playerStats || playerStats.length === 0) {
            sunderList.innerHTML = '<div class="highlight-empty">No sunders found</div>';
        } else {
            for (const player of playerStats) {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(player.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = player.name;
                
                const countSpan = document.createElement('span');
                countSpan.className = 'meta';
                countSpan.textContent = player.effective;
                countSpan.style.marginLeft = 'auto';
                countSpan.style.fontWeight = 'bold';
                
                item.appendChild(sourceSpan);
                item.appendChild(countSpan);
                
                sunderList.appendChild(item);
            }
        }
        
        if (sunderCount) sunderCount.textContent = effectiveSunders;
        console.log(`[LIVE] Displayed ${playerStats?.length || 0} players with sunders`);
    }
    
    // Display effective scorches from backend analysis - player leaderboard
    function displayScorches(playerStats, effectiveScorches, totalScorches) {
        highlightsGrid.style.display = 'grid';
        if (!scorchList) return;
        
        scorchList.innerHTML = '';
        
        if (!playerStats || playerStats.length === 0) {
            scorchList.innerHTML = '<div class="highlight-empty">No scorches found</div>';
        } else {
            for (const player of playerStats) {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(player.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = player.name;
                
                const countSpan = document.createElement('span');
                countSpan.className = 'meta';
                countSpan.textContent = player.effective;
                countSpan.style.marginLeft = 'auto';
                countSpan.style.fontWeight = 'bold';
                
                item.appendChild(sourceSpan);
                item.appendChild(countSpan);
                
                scorchList.appendChild(item);
            }
        }
        
        if (scorchCount) scorchCount.textContent = effectiveScorches;
        console.log(`[LIVE] Displayed ${playerStats?.length || 0} players with scorches`);
    }
    
    // Display disarms from backend analysis - player leaderboard
    function displayDisarms(playerStats, totalDisarms) {
        highlightsGrid.style.display = 'grid';
        if (!disarmList) return;
        
        disarmList.innerHTML = '';
        
        if (!playerStats || playerStats.length === 0) {
            disarmList.innerHTML = '<div class="highlight-empty">No disarms found</div>';
        } else {
            for (const player of playerStats) {
                const item = document.createElement('div');
                item.className = 'highlight-item';
                
                const sourceSpan = document.createElement('span');
                const sourceClass = getClassColor(player.sourceSubType);
                sourceSpan.className = `source ${sourceClass}`;
                sourceSpan.textContent = player.name;
                
                const countSpan = document.createElement('span');
                countSpan.className = 'meta';
                countSpan.textContent = player.count;
                countSpan.style.marginLeft = 'auto';
                countSpan.style.fontWeight = 'bold';
                
                item.appendChild(sourceSpan);
                item.appendChild(countSpan);
                
                disarmList.appendChild(item);
            }
        }
        
        if (disarmCount) disarmCount.textContent = totalDisarms;
        console.log(`[LIVE] Displayed ${playerStats?.length || 0} players with disarms`);
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
    async function displaySpores(sporeGroups, totalSpores) {
        if (!sporesPanel || !sporesGrid) return;
        
        // Show the panel if we have spore data
        if (totalSpores > 0) {
            sporesPanel.style.display = 'block';
            highlightsGrid.style.display = 'grid';
        }
        
        // Update total count in header
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
        
        console.log(`[LIVE] Displayed ${Math.min(sporeGroups.length, 8)} spores out of ${totalSpores} total`);
    }
    
    // Format large numbers (e.g., 4510000 -> "4.51m")
    function formatAmount(amount) {
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(2) + 'm';
        } else if (amount >= 1000) {
            return (amount / 1000).toFixed(1) + 'k';
        }
        return amount.toString();
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
    
    // Get bar CSS class for WoW class (for leaderboard bars)
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
    
    // Display damage leaderboard
    function displayDamageLeaderboard(players) {
        if (!damageList) return;
        
        if (players.length === 0) {
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
            
            // Amount
            const amountSpan = document.createElement('span');
            amountSpan.className = 'leaderboard-amount damage';
            amountSpan.textContent = formatAmount(player.amount);
            
            row.appendChild(rankSpan);
            row.appendChild(playerDiv);
            row.appendChild(amountSpan);
            
            damageList.appendChild(row);
        }
        
        console.log(`[LIVE] Displayed ${players.length} damage dealers`);
    }
    
    // Display healing leaderboard
    function displayHealingLeaderboard(players) {
        if (!healingList) return;
        
        if (players.length === 0) {
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
            
            // Amount
            const amountSpan = document.createElement('span');
            amountSpan.className = 'leaderboard-amount healing';
            amountSpan.textContent = formatAmount(player.amount);
            
            row.appendChild(rankSpan);
            row.appendChild(playerDiv);
            row.appendChild(amountSpan);
            
            healingList.appendChild(row);
        }
        
        console.log(`[LIVE] Displayed ${players.length} healers`);
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
        
        console.log(`[LIVE] Displayed ${playersWithPenalties.length} low damage players`);
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
        
        console.log(`[LIVE] Displayed ${playersWithPenalties.length} low healing players`);
    }
    
    // Show charge detail modal
    function showChargeDetail(chargeData) {
        if (detailModalTitle) {
            detailModalTitle.textContent = '⚡ Charge Details';
        }
        
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
    
    // Modal event listeners
    if (detailModalClose) {
        detailModalClose.addEventListener('click', closeDetailModal);
    }
    if (detailModalOverlay) {
        detailModalOverlay.addEventListener('click', (e) => {
            if (e.target === detailModalOverlay) {
                closeDetailModal();
            }
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDetailModal();
        }
    });

    // Start streaming
    async function startStreaming() {
        const report = reportInput.value.trim();
        if (!report) {
            reportInput.focus();
            return;
        }
        
        // Prevent double-start
        if (isImporting) return;
        isImporting = true;
        
        // Update UI
        goBtn.disabled = true;
        goBtn.textContent = 'Importing...';
        progressSection.classList.add('active');
        statsGrid.style.display = 'grid';
        
        // Initialize phase tracker
        clearPhases();
        addPhase('phase1', 'Phase 1: Import Events');
        addPhase('phase2', 'Phase 2: Analysis');
        updatePhaseStatus('phase1', 'running');
        
        // Reset state
        totalEvents = 0;
        pagesStored = 0;
        actorCount = 0;
        fightsCount = 0;
        eventsBuffer = [];
        allEvents = [];
        pwsEvents = [];
        chargeEvents = [];
        renewEvents = [];
        damageTimestamps = [];
        combatSegments = [];
        processedCount = 0;
        damageEventCount = 0;
        tankNames = new Set();
        lastPwsSendTime = 0;
        lastRenewSendTime = 0;
        if (statProcessed) statProcessed.textContent = '0';
        if (statDamage) statDamage.textContent = '0';
        
        // Fetch tank assignments from localStorage event ID
        const eventId = localStorage.getItem('activeEventSession') || '';
        if (eventIdDisplay) {
            if (eventId) {
                eventIdDisplay.style.display = 'block';
                eventIdDisplay.innerHTML = `Event: <span class="event-id">${eventId}</span><span class="tanks-list"></span>`;
            } else {
                eventIdDisplay.style.display = 'block';
                eventIdDisplay.innerHTML = '<span style="color: var(--warning);">No activeEventSession in localStorage - showing all shields/renews</span>';
            }
        }
        
        if (eventId) {
            try {
                setStatus('connected', 'Fetching tank assignments...');
                const tanksResp = await fetch(`/api/event/${eventId}/tanks`);
                if (tanksResp.ok) {
                    const tanksData = await tanksResp.json();
                    if (tanksData.tanks && tanksData.tanks.length > 0) {
                        tankNames = new Set(tanksData.tanks);
                        console.log('[LIVE] Tank names loaded:', Array.from(tankNames));
                        setStatus('connected', `Loaded ${tankNames.size} tanks: ${Array.from(tankNames).join(', ')}`);
                        // Update display with tank names
                        if (eventIdDisplay) {
                            eventIdDisplay.innerHTML = `Event: <span class="event-id">${eventId}</span> <span class="tanks-list">Tanks: ${Array.from(tankNames).join(', ')}</span>`;
                        }
                    } else {
                        console.warn('[LIVE] No tanks found in assignments');
                        setStatus('connected', 'No tanks found in assignments');
                    }
                } else {
                    console.warn('[LIVE] Could not fetch tanks:', tanksResp.status);
                }
            } catch (err) {
                console.warn('[LIVE] Error fetching tanks:', err);
            }
        }
        
        setStatus('connected', 'Connecting...');
        updateProgress(0, 'Starting...');
        
        // Clear stream (only clear tbody, not the whole table)
        if (eventTableBody) {
            eventTableBody.innerHTML = '';
        }
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        // Create SSE connection (session ID is derived from report code on backend)
        // Include tank names for charge analysis if available
        const tanksParam = tankNames.size > 0 ? `&tanks=${encodeURIComponent(Array.from(tankNames).join(','))}` : '';
        const url = `/api/wcl/stream-import?report=${encodeURIComponent(report)}${tanksParam}`;
        
        eventSource = new EventSource(url);
        
        eventSource.addEventListener('connected', (e) => {
            const data = JSON.parse(e.data);
            currentReportCode = data.reportCode;
            isHostingSession = true; // Session started - enable beforeunload warning
            startTitleFlash(); // Start flashing browser tab
            setStatus('connected', `Connected: ${data.reportCode}`);
            if (stopBtn) stopBtn.style.display = 'inline-block';
        });
        
        eventSource.addEventListener('progress', (e) => {
            const data = JSON.parse(e.data);
            setStatus('importing', data.message);
        });
        
        eventSource.addEventListener('meta', (e) => {
            const data = JSON.parse(e.data);
            actorCount = data.actorCount || 0;
            updateStats();
        });
        
        eventSource.addEventListener('fights', (e) => {
            const data = JSON.parse(e.data);
            if (data.fights) {
                renderFights(data.fights);
            }
        });
        
        eventSource.addEventListener('events', (e) => {
            const data = JSON.parse(e.data);
            totalEvents = data.totalEvents || 0;
            pagesStored = data.pagesStored || 0;
            updateProgress(data.progress || 0, `Importing... ${formatNumber(totalEvents)} events`);
            updateStats();
            
            if (data.events && data.events.length > 0) {
                console.log(`[LIVE] Received ${data.events.length} events, adding to stream`);
                addEventsToStream(data.events);
            }
            
            // Periodically send highlights to live viewers during import
            const now = Date.now();
            if (pwsEvents.length > 0 && now - lastPwsSendTime > HIGHLIGHT_SEND_INTERVAL) {
                savePwsToBackend();
                lastPwsSendTime = now;
            }
            if (renewEvents.length > 0 && now - lastRenewSendTime > HIGHLIGHT_SEND_INTERVAL) {
                saveRenewToBackend();
                lastRenewSendTime = now;
            }
        });
        
        eventSource.addEventListener('complete', (e) => {
            const data = JSON.parse(e.data);
            totalEvents = data.totalEvents || 0;
            pagesStored = data.pagesStored || 0;
            updateProgress(100, 'Import complete! Analyzing bloodrages...');
            setStatus('complete', 'Analyzing bloodrages from all events...');
            updateStats();
            
            // Mark Phase 1 complete, start Phase 2
            updatePhaseStatus('phase1', 'complete');
            updatePhaseStatus('phase2', 'running');
            addPhase('analysis-bloodrage', '→ Bloodrages');
            updatePhaseStatus('analysis-bloodrage', 'running');
            
            // Save PW:S and Renew highlights to backend for live viewers
            savePwsToBackend();
            saveRenewToBackend();
        });
        
        eventSource.addEventListener('bloodrage-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Bloodrage analysis received:', data);
            
            // Update stats
            if (statDamage) statDamage.textContent = formatNumber(data.damageEvents || 0);
            
            // Display bad bloodrages from backend analysis
            displayBackendBloodrages(data.badBloodrages || [], data.totalBloodrages || 0);
            
            updatePhaseStatus('analysis-bloodrage', 'complete');
            setStatus('complete', `Analysis complete - ${data.badBloodrages?.length || 0} bad bloodrages found`);
        });
        
        eventSource.addEventListener('charge-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Charge analysis received:', data);
            
            addPhase('analysis-charges', '→ Charges');
            updatePhaseStatus('analysis-charges', 'complete');
            
            // Display charges from backend analysis
            displayBackendCharges(data.charges || [], data.totalCharges || 0, data.badCharges || 0);
            
            setStatus('complete', `Charge analysis complete - ${data.badCharges || 0} bad charges`);
        });
        
        eventSource.addEventListener('interrupt-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Interrupt analysis received:', data);
            addPhase('analysis-interrupts', '→ Interrupts');
            updatePhaseStatus('analysis-interrupts', 'complete');
            displayInterrupts(data.playerStats || [], data.totalInterrupts || 0);
        });
        
        eventSource.addEventListener('decurse-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Decurse analysis received:', data);
            displayDecurses(data.playerStats || [], data.totalDecurses || 0);
        });
        
        eventSource.addEventListener('sunder-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Sunder analysis received:', data);
            displaySunders(data.playerStats || [], data.effectiveSunders || 0, data.totalSunders || 0);
        });
        
        eventSource.addEventListener('scorch-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Scorch analysis received:', data);
            displayScorches(data.playerStats || [], data.effectiveScorches || 0, data.totalScorches || 0);
        });
        
        eventSource.addEventListener('disarm-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Disarm analysis received:', data);
            displayDisarms(data.playerStats || [], data.totalDisarms || 0);
        });
        
        eventSource.addEventListener('spore-analysis', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Spore analysis received:', data);
            displaySpores(data.sporeGroups || [], data.totalSpores || 0);
        });
        
        eventSource.addEventListener('player-stats', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Player stats received:', data);
            
            addPhase('analysis-stats', '→ Player Stats');
            updatePhaseStatus('analysis-stats', 'complete');
            
            // Build player class map for spore coloring
            playerClassMap = {};
            if (data.damage) {
                data.damage.forEach(p => {
                    if (p.name && p.class) playerClassMap[p.name] = p.class.toLowerCase();
                });
            }
            if (data.healing) {
                data.healing.forEach(p => {
                    if (p.name && p.class) playerClassMap[p.name] = p.class.toLowerCase();
                });
            }
            
            // Show leaderboards grid
            if (leaderboardsGrid) leaderboardsGrid.style.display = 'grid';
            
            // Store top values for reference bars
            if (data.damage && data.damage.length > 0) {
                topDamage = data.damage[0].amount;
            }
            if (data.healing && data.healing.length > 0) {
                topHealing = data.healing[0].amount;
            }
            
            // Display damage and healing leaderboards
            displayDamageLeaderboard(data.damage || []);
            displayHealingLeaderboard(data.healing || []);
            
            // Display too-low performance panels (DPS/HPS already in data from backend)
            displayTooLowDamageFromStats(data.damage || []);
            displayTooLowHealingFromStats(data.healing || []);
            
            // Mark Phase 2 complete
            updatePhaseStatus('phase2', 'complete');
            
            setStatus('complete', 'Analysis complete!');
            goBtn.textContent = 'Import Complete';
        });
        
        eventSource.addEventListener('import-complete', (e) => {
            const data = JSON.parse(e.data);
            console.log('[LIVE] Import complete:', data);
            setStatus('complete', 'Import and analysis complete!');
            
            // Reset to GO button so user can import again
            goBtn.textContent = 'GO';
            goBtn.disabled = false;
            goBtn.style.background = '';
            goBtn.style.cursor = '';
            goBtn.style.opacity = '';
            
            // Hide STOP button - nothing to stop anymore
            if (stopBtn) stopBtn.style.display = 'none';
            
            isImporting = false;
            isHostingSession = false;
            stopTitleFlash();
        });
        
        // No more new-events listener - single import only
        
        eventSource.addEventListener('heartbeat', (e) => {
            const data = JSON.parse(e.data);
            // Simple heartbeat - no special handling needed
        });
        
        // Refresh events removed - no auto-refresh anymore
        
        eventSource.addEventListener('warning', (e) => {
            const data = JSON.parse(e.data);
            console.warn('Stream warning:', data.message, data);
            // Show critical warnings to user
            if (data.message.includes('CRITICAL') || data.message.includes('stuck')) {
                setStatus('error', `⚠️ ${data.message}`);
                alert(`⚠️ POLLING WARNING:\n\n${data.message}\n\nCheck console for details. You may need to refresh and re-import.`);
            } else {
                setStatus('warning', data.message);
            }
        });
        
        eventSource.addEventListener('error', (e) => {
            if (e.data) {
                const data = JSON.parse(e.data);
                setStatus('error', `Error: ${data.message}`);
            } else {
                setStatus('error', 'Connection error');
            }
            stopStreaming();
        });
        
        eventSource.addEventListener('session-end', (e) => {
            const data = JSON.parse(e.data);
            setStatus('complete', data.message);
            stopStreaming();
        });
        
        eventSource.onerror = () => {
            if (eventSource.readyState === EventSource.CLOSED) {
                setStatus('error', 'Connection closed');
                stopStreaming();
            }
        };
    }

    // Stop streaming
    function stopStreaming() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        isImporting = false;
        isHostingSession = false; // Session ended - disable beforeunload warning
        stopTitleFlash(); // Stop flashing browser tab
        goBtn.disabled = false;
        goBtn.textContent = 'GO';
    }

    // Clear stream
    function clearStream() {
        eventsBuffer = [];
        allEvents = [];
        pwsEvents = [];
        chargeEvents = [];
        renewEvents = [];
        damageTimestamps = [];
        combatSegments = [];
        eventTableBody.innerHTML = '';
        if (emptyState) {
            emptyState.style.display = 'block';
            const p = emptyState.querySelector('p');
            if (p) p.textContent = 'Stream cleared';
        }
        // Reset highlight counts
        if (pwsCount) pwsCount.textContent = '0';
        if (bloodrageCount) bloodrageCount.textContent = '...';
        if (chargeCount) chargeCount.textContent = '...';
        if (interruptCount) interruptCount.textContent = '...';
        if (decurseCount) decurseCount.textContent = '...';
        if (sunderCount) sunderCount.textContent = '...';
        if (scorchCount) scorchCount.textContent = '...';
        if (disarmCount) disarmCount.textContent = '...';
        if (pwsList) pwsList.innerHTML = '<div class="highlight-empty">No shields cast yet</div>';
        if (bloodrageList) bloodrageList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        if (chargeList) chargeList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        if (interruptList) interruptList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        if (decurseList) decurseList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        if (sunderList) sunderList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        if (scorchList) scorchList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        if (disarmList) disarmList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import...</div>';
        // Clear spores panel
        if (sporesPanel) sporesPanel.style.display = 'none';
        if (sporeCount) sporeCount.textContent = '0';
        for (let i = 1; i <= 8; i++) {
            const timeEl = document.getElementById(`spore${i}Time`);
            const playersEl = document.getElementById(`spore${i}Players`);
            if (timeEl) timeEl.textContent = '--:--';
            if (playersEl) playersEl.innerHTML = '<span class="spore-cell-empty">Waiting...</span>';
        }
        // Clear too-low panels
        if (tooLowDamageCount) tooLowDamageCount.textContent = '0';
        if (tooLowHealingCount) tooLowHealingCount.textContent = '0';
        if (tooLowDamageList) tooLowDamageList.innerHTML = '<div class="too-low-empty">Analyzing...</div>';
        if (tooLowHealingList) tooLowHealingList.innerHTML = '<div class="too-low-empty">Analyzing...</div>';
        if (tooLowGrid) tooLowGrid.style.display = 'none';
        topDamage = 0;
        topHealing = 0;
    }

    // Toggle auto-scroll
    function toggleAutoScroll() {
        autoScroll = !autoScroll;
        scrollBtn.textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
    }

    // Stop the active import session
    async function stopSession() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        isImporting = false;
        isHostingSession = false; // Session ended - disable beforeunload warning
        stopTitleFlash(); // Stop flashing browser tab
        try {
            await fetch('/api/live/stop', { method: 'POST' });
            setStatus('stopped', 'Import stopped');
            stopBtn.style.display = 'none';
            
            // Reset GO button to initial state
            goBtn.disabled = false;
            goBtn.textContent = 'GO';
            goBtn.style.background = '';
            goBtn.style.cursor = '';
            goBtn.style.opacity = '';
        } catch (err) {
            console.error('Stop error:', err);
        }
    }

    // Clear all highlights from both host and live pages
    async function clearAll() {
        // Local clear
        clearStream();
        
        // Server clear (clears database cache and notifies live viewers)
        try {
            await fetch('/api/live/clear', { method: 'POST' });
            setStatus('idle', 'All highlights cleared');
        } catch (err) {
            console.error('Clear error:', err);
        }
        
        // Reset UI completely
        progressSection.style.display = 'none';
        statsGrid.style.display = 'none';
        fightsPanel.style.display = 'none';
        stopBtn.style.display = 'none';
        if (leaderboardsGrid) leaderboardsGrid.style.display = 'none';
        if (tooLowGrid) tooLowGrid.style.display = 'none';
        currentReportCode = null;
        
        // Reset GO button to initial state
        goBtn.textContent = 'GO';
        goBtn.disabled = false;
        goBtn.style.background = '';
        goBtn.style.cursor = '';
        goBtn.style.opacity = '';
    }

    // Save PW:S events to backend for live viewers
    async function savePwsToBackend() {
        if (!currentReportCode || pwsEvents.length === 0) return;
        try {
            await fetch('/api/live/highlights/pws', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    reportCode: currentReportCode, 
                    events: pwsEvents,
                    fights: fightsData,
                    tanks: Array.from(tankNames)
                })
            });
        } catch (err) {
            console.error('Error saving PW:S highlights:', err);
        }
    }

    // Save Renew events to backend for live viewers
    async function saveRenewToBackend() {
        if (!currentReportCode || renewEvents.length === 0) return;
        try {
            await fetch('/api/live/highlights/renew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportCode: currentReportCode, events: renewEvents })
            });
        } catch (err) {
            console.error('Error saving Renew highlights:', err);
        }
    }

    // Event listeners
    goBtn.addEventListener('click', startStreaming);
    
    reportInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            startStreaming();
        }
    });
    
    clearBtn.addEventListener('click', clearStream);
    scrollBtn.addEventListener('click', toggleAutoScroll);
    if (stopBtn) stopBtn.addEventListener('click', stopSession);
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);
    
    // Clean up eventSource on page unload (in addition to the warning above)
    window.addEventListener('unload', () => {
        if (eventSource) {
            eventSource.close();
        }
    });
    
    // Check for URL params
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('report');
    if (prefill) {
        reportInput.value = prefill;
    }
})();
