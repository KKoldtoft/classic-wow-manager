// Live Viewer - WCL Analysis Display
(() => {
    // DOM Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const viewerCount = document.getElementById('viewerCount');
    
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

    // Display PW:S events
    function displayPwsEvents(data) {
        const events = data.events || [];
        pwsCount.textContent = events.length;
        
        if (events.length === 0) {
            pwsList.innerHTML = '<div class="highlight-empty">No shields cast yet</div>';
            return;
        }
        
        pwsList.innerHTML = '';
        // Show newest first
        const sorted = [...events].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        for (const event of sorted) {
            const item = createHighlightItem(event);
            item.addEventListener('click', () => showEventDetail(event, 'pws'));
            pwsList.appendChild(item);
        }
    }

    // Display Renew events
    function displayRenewEvents(data) {
        const events = data.events || [];
        renewCount.textContent = events.length;
        
        if (events.length === 0) {
            renewList.innerHTML = '<div class="highlight-empty">No renews on tanks yet</div>';
            return;
        }
        
        renewList.innerHTML = '';
        // Show newest first
        const sorted = [...events].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        for (const event of sorted) {
            const item = createHighlightItem(event);
            item.addEventListener('click', () => showEventDetail(event, 'renew'));
            renewList.appendChild(item);
        }
    }

    // Display bad bloodrages
    function displayBloodrages(data) {
        const badBloodrages = data.badBloodrages || [];
        bloodrageCount.textContent = badBloodrages.length;
        
        if (badBloodrages.length === 0) {
            bloodrageList.innerHTML = '<div class="highlight-empty">No bad bloodrages detected</div>';
            return;
        }
        
        bloodrageList.innerHTML = '';
        // Show newest first
        const sorted = [...badBloodrages].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        for (const br of sorted) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';
            
            const time = formatTimeShort(br.timestamp || 0);
            const source = br.sourceName || 'Unknown';
            const sourceClass = getClassColor(br.sourceSubType);
            const beforeEnd = br.secondsBefore != null ? `${br.secondsBefore}s before end` : '';
            
            item.innerHTML = `
                <span class="time">${time}</span>
                <span class="source ${sourceClass}">${source}</span>
                <span class="meta">${beforeEnd}</span>
            `;
            
            item.addEventListener('click', () => showBloodrageDetail(br));
            bloodrageList.appendChild(item);
        }
    }

    // Display bad charges (only bad ones on live page)
    function displayCharges(data) {
        const charges = data.charges || [];
        // Filter to only show bad charges (stunnable mobs or no tank hit first)
        const badCharges = charges.filter(c => !c.tankHitFirst || c.isStunnableMob);
        
        chargeCount.textContent = badCharges.length;
        
        if (badCharges.length === 0) {
            chargeList.innerHTML = '<div class="highlight-empty">No bad charges detected</div>';
            return;
        }
        
        chargeList.innerHTML = '';
        // Show newest first
        const sorted = [...badCharges].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        for (const charge of sorted) {
            const item = document.createElement('div');
            item.className = 'highlight-item clickable';
            
            const time = formatTimeShort(charge.timestamp || 0);
            const source = charge.sourceName || 'Unknown';
            const target = charge.targetName || 'Unknown';
            const sourceClass = getClassColor(charge.sourceSubType);
            
            item.innerHTML = `
                <span class="time">${time}</span>
                <span class="source ${sourceClass}">${source}</span>
                <span class="target">${target}</span>
            `;
            
            item.addEventListener('click', () => showChargeDetail(charge));
            chargeList.appendChild(item);
        }
    }

    // Display interrupts - player leaderboard
    function displayInterrupts(data) {
        const playerStats = data.playerStats || [];
        if (interruptCount) interruptCount.textContent = data.totalInterrupts || 0;
        
        if (!interruptList) return;
        
        if (playerStats.length === 0) {
            interruptList.innerHTML = '<div class="highlight-empty">No interrupts found</div>';
            return;
        }
        
        interruptList.innerHTML = '';
        
        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            
            const sourceClass = getClassColor(player.sourceSubType);
            
            item.innerHTML = `
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold">${player.count}</span>
            `;
            
            interruptList.appendChild(item);
        }
    }

    // Display decurses - player leaderboard
    function displayDecurses(data) {
        const playerStats = data.playerStats || [];
        if (decurseCount) decurseCount.textContent = data.totalDecurses || 0;
        
        if (!decurseList) return;
        
        if (playerStats.length === 0) {
            decurseList.innerHTML = '<div class="highlight-empty">No decurses found</div>';
            return;
        }
        
        decurseList.innerHTML = '';
        
        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            
            const sourceClass = getClassColor(player.sourceSubType);
            
            item.innerHTML = `
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold">${player.count}</span>
            `;
            
            decurseList.appendChild(item);
        }
    }

    // Display effective sunders - player leaderboard
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
        
        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            
            const sourceClass = getClassColor(player.sourceSubType);
            
            item.innerHTML = `
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold">${player.effective}</span>
            `;
            
            sunderList.appendChild(item);
        }
    }

    // Display effective scorches - player leaderboard
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
        
        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            
            const sourceClass = getClassColor(player.sourceSubType);
            
            item.innerHTML = `
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold">${player.effective}</span>
            `;
            
            scorchList.appendChild(item);
        }
    }

    // Display disarms - player leaderboard
    function displayDisarms(data) {
        const playerStats = data.playerStats || [];
        if (disarmCount) disarmCount.textContent = data.totalDisarms || 0;
        
        if (!disarmList) return;
        
        if (playerStats.length === 0) {
            disarmList.innerHTML = '<div class="highlight-empty">No disarms found</div>';
            return;
        }
        
        disarmList.innerHTML = '';
        
        for (const player of playerStats) {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            
            const sourceClass = getClassColor(player.sourceSubType);
            
            item.innerHTML = `
                <span class="source ${sourceClass}">${player.name}</span>
                <span class="meta" style="margin-left:auto;font-weight:bold">${player.count}</span>
            `;
            
            disarmList.appendChild(item);
        }
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
            case 'playerstats':
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
                if (data.data.fights) fightsData = data.data.fights;
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
                // Show "analyzing" message for panels during import
                bloodrageList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                chargeList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (interruptList) interruptList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (decurseList) decurseList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (sunderList) sunderList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (scorchList) scorchList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (disarmList) disarmList.innerHTML = '<div class="highlight-empty">⏳ Analyzing after import completes...</div>';
                if (tooLowDamageList) tooLowDamageList.innerHTML = '<div class="too-low-empty">⏳ Analyzing after import completes...</div>';
                if (tooLowHealingList) tooLowHealingList.innerHTML = '<div class="too-low-empty">⏳ Analyzing after import completes...</div>';
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
        // Clear leaderboards
        if (damageList) damageList.innerHTML = '<div class="leaderboard-empty">Waiting for data...</div>';
        if (healingList) healingList.innerHTML = '<div class="leaderboard-empty">Waiting for data...</div>';
        if (leaderboardsGrid) leaderboardsGrid.style.display = 'none';
        // Clear too-low panels
        if (tooLowDamageList) tooLowDamageList.innerHTML = '<div class="too-low-empty">Waiting for data...</div>';
        if (tooLowDamageCount) tooLowDamageCount.textContent = '0';
        if (tooLowHealingList) tooLowHealingList.innerHTML = '<div class="too-low-empty">Waiting for data...</div>';
        if (tooLowHealingCount) tooLowHealingCount.textContent = '0';
        if (tooLowGrid) tooLowGrid.style.display = 'none';
        topDamage = 0;
        topHealing = 0;
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
            }
            
            // Display cached data
            if (data.cached) {
                // Load meta first for detail modals
                if (data.cached.meta) {
                    if (data.cached.meta.fights) fightsData = data.cached.meta.fights;
                    if (data.cached.meta.tanks) tankNames = new Set(data.cached.meta.tanks);
                    console.log('[LIVE] Cached meta loaded:', fightsData.length, 'fights,', tankNames.size, 'tanks');
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
                if (data.cached.playerstats) {
                    if (data.cached.playerstats.damage) displayDamageLeaderboard(data.cached.playerstats.damage);
                    if (data.cached.playerstats.healing) displayHealingLeaderboard(data.cached.playerstats.healing);
                }
            }
        });
        
        eventSource.addEventListener('highlights-update', (e) => {
            const data = JSON.parse(e.data);
            handleHighlightsUpdate(data);
        });
        
        eventSource.addEventListener('heartbeat', (e) => {
            const data = JSON.parse(e.data);
            if (data.viewerCount) {
                viewerCount.textContent = `${data.viewerCount} viewer${data.viewerCount !== 1 ? 's' : ''} connected`;
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
