// Gold Pot Page JavaScript

class GoldPotManager {
    constructor() {
        this.allPlayers = [];
        this.filteredPlayers = [];
        this.currentEventId = null;
        // Datasets for point computation
        this.logData = [];
        this.rewardSettings = {};
        this.datasets = {};
        this.totalPointsAll = 0;
        this.sharedGoldPot = 0;
        this.totalGoldPot = 0;
        this.playerTotals = new Map(); // name -> { class, points, gold }
        
        this.initializeEventListeners();
        this.loadData();
    }

    initializeEventListeners() {
        // Filter change listeners
        const classFilter = document.getElementById('classFilter');
        
        if (classFilter) {
            classFilter.addEventListener('change', () => this.applyFilters());
        }
    }

    async loadData() {
        try {
            // Prefer URL param /event/:eventId/gold; fallback to localStorage
            let eventIdFromUrl = null;
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                const idx = parts.indexOf('event');
                if (idx >= 0 && parts[idx + 1]) {
                    eventIdFromUrl = parts[idx + 1];
                }
            } catch {}

            // Get the active event session ID
            this.currentEventId = eventIdFromUrl || localStorage.getItem('activeEventSession');

            // Normalize URL: if we have an active event but current URL is not event-scoped, redirect
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                const isEventScoped = parts.includes('event') && parts[parts.indexOf('event') + 1];
                const isGoldPage = parts.includes('gold');
                if (!isEventScoped && isGoldPage && this.currentEventId) {
                    window.location.replace(`/event/${this.currentEventId}/gold`);
                    return;
                }
            } catch {}

            if (eventIdFromUrl) {
                localStorage.setItem('activeEventSession', eventIdFromUrl);
                if (typeof updateRaidBar === 'function') {
                    setTimeout(() => updateRaidBar(), 0);
                }
            }
            
            if (!this.currentEventId) {
                this.showError('No active event session found. Please select an event from the events page.');
                return;
            }

            console.log('Loading gold pot data for event:', this.currentEventId);
            
            // Fetch base data in parallel (players from logs/confirmed list only)
            const [eventData, playersData, goldPot] = await Promise.all([
                this.fetchEventDetails(),
                this.fetchConfirmedPlayers(),
                this.fetchGoldPot()
            ]);

            // Store and display players
            // Fetch raidlogs datasets needed to compute points
            await this.fetchRaidlogsDatasets();
            // Reconcile players strictly to confirmed logData roster and dedupe
            this.reconcilePlayersWithLogData(playersData || []);
            // Compute totals per player
            this.computeTotals();
            this.applyFilters();
            // Update top stats
            this.updateTopStats();
            
            // Show content
            this.showContent();
            
        } catch (error) {
            console.error('Error loading gold pot data:', error);
            this.showError(error.message || 'Failed to load gold pot data');
        }
    }

    async fetchEventDetails() {
        try {
            // Fetch event details to get the event name
            const response = await fetch(`/api/roster/${this.currentEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch event details: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.warn('Could not fetch event details, using default name');
            return { name: 'Unknown Event' };
        }
    }

    async fetchConfirmedPlayers() {
        const response = await fetch(`/api/confirmed-logs/${this.currentEventId}/all-players`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch confirmed players: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Fetched confirmed players:', result.data);
        
        return result.data;
    }

    async fetchGoldPot() {
        const res = await fetch(`/api/event-goldpot/${this.currentEventId}`);
        if (!res.ok) return { goldPot: 0 };
        const data = await res.json();
        this.totalGoldPot = Number(data.goldPot) || 0;
        this.sharedGoldPot = Math.floor(this.totalGoldPot * 0.85);
        return data;
    }

    async fetchRaidlogsDatasets() {
        const id = this.currentEventId;
        const endpoints = [
            [`/api/log-data/${id}`, 'logData'],
            ['/api/reward-settings', 'rewardSettings'],
            [`/api/abilities-data/${id}`, 'abilitiesData'],
            [`/api/mana-potions-data/${id}`, 'manaPotionsData'],
            [`/api/runes-data/${id}`, 'runesData'],
            [`/api/interrupts-data/${id}`, 'interruptsData'],
            [`/api/disarms-data/${id}`, 'disarmsData'],
            [`/api/sunder-data/${id}`, 'sunderData'],
            [`/api/curse-data/${id}`, 'curseData'],
            [`/api/curse-shadow-data/${id}`, 'curseShadowData'],
            [`/api/curse-elements-data/${id}`, 'curseElementsData'],
            [`/api/faerie-fire-data/${id}`, 'faerieFireData'],
            [`/api/scorch-data/${id}`, 'scorchData'],
            [`/api/demo-shout-data/${id}`, 'demoShoutData'],
            [`/api/polymorph-data/${id}`, 'polymorphData'],
            [`/api/power-infusion-data/${id}`, 'powerInfusionData'],
            [`/api/decurses-data/${id}`, 'decursesData'],
            [`/api/frost-resistance-data/${id}`, 'frostResistanceData'],
            [`/api/world-buffs-data/${id}`, 'worldBuffsData'],
            [`/api/void-damage/${id}`, 'voidDamageData'],
            [`/api/manual-rewards/${id}`, 'manualRewardsData'],
            [`/api/player-streaks/${id}`, 'playerStreaks'],
            [`/api/guild-members/${id}`, 'guildMembers'],
            [`/api/raid-stats/${id}`, 'raidStats'],
            [`/api/big-buyer/${id}`, 'bigBuyerData']
        ];
        const fetches = await Promise.all(endpoints.map(([url]) => fetch(url).catch(()=>null)));
        for (let i = 0; i < endpoints.length; i++) {
            const key = endpoints[i][1];
            const resp = fetches[i];
            try {
                if (resp && resp.ok) {
                    const json = await resp.json();
                    if (key === 'logData') this.logData = json.data || [];
                    else if (key === 'rewardSettings') this.rewardSettings = json.settings || {};
                    else if (key === 'raidStats') this.datasets.raidStats = json.data || json || {};
                    else this.datasets[key] = (json.data || json.settings || json) && (json.data || []);
                } else {
                    this.datasets[key] = [];
                }
            } catch { this.datasets[key] = []; }
        }
        // Sanitize non-players across datasets (only for array datasets)
        Object.keys(this.datasets).forEach(k => {
            const v = this.datasets[k];
            if (Array.isArray(v)) {
                this.datasets[k] = v.filter(p => !this.shouldIgnorePlayer(String(p?.character_name || p?.player_name || '')));
            }
        });
    }

    computeTotals() {
        // Map of lowercase name to { class, points }
        const nameToPlayer = new Map();
        this.allPlayers.forEach(p => {
            nameToPlayer.set(String(p.character_name).toLowerCase(), { name: p.character_name, class: p.character_class, points: 0 });
        });

        // Base points (100 per confirmed player)
        const base = 100;
        nameToPlayer.forEach(v => { v.points += base; });

        // Damage rankings points by position
        const damagePoints = this.rewardSettings.damage?.points_array || [];
        const damageSorted = (this.logData || [])
            .filter(p => !this.shouldIgnorePlayer(p.character_name))
            .filter(p => ((p.role_detected || '').toLowerCase() === 'dps' || (p.role_detected || '').toLowerCase() === 'tank') && (parseInt(p.damage_amount) || 0) > 0)
            .sort((a,b)=>(parseInt(b.damage_amount)||0)-(parseInt(a.damage_amount)||0));
        damageSorted.forEach((p, idx) => {
            const pts = idx < damagePoints.length ? (damagePoints[idx] || 0) : 0;
            const v = nameToPlayer.get(String(p.character_name).toLowerCase());
            if (v && pts) v.points += pts;
        });

        // Healer rankings
        const healingPoints = this.rewardSettings.healing?.points_array || [];
        const healers = (this.logData || [])
            .filter(p => !this.shouldIgnorePlayer(p.character_name))
            .filter(p => (p.role_detected || '').toLowerCase() === 'healer' && (parseInt(p.healing_amount) || 0) > 0)
            .sort((a,b)=>(parseInt(b.healing_amount)||0)-(parseInt(a.healing_amount)||0));
        healers.forEach((p, idx) => {
            const pts = idx < healingPoints.length ? (healingPoints[idx] || 0) : 0;
            const v = nameToPlayer.get(String(p.character_name).toLowerCase());
            if (v && pts) v.points += pts;
        });

        // Helper to sum points from dataset arrays
        const addFrom = (arr) => {
            (arr || []).forEach(row => {
                const nm = String(row.character_name || row.player_name || '').toLowerCase();
                const v = nameToPlayer.get(nm);
                if (!v) return;
                const pts = Number(row.points) || 0;
                v.points += pts;
            });
        };
        addFrom(this.datasets.abilitiesData);
        addFrom(this.datasets.manaPotionsData);
        addFrom(this.datasets.runesData);
        addFrom(this.datasets.interruptsData);
        addFrom(this.datasets.disarmsData);
        addFrom(this.datasets.sunderData);
        addFrom(this.datasets.curseData);
        addFrom(this.datasets.curseShadowData);
        addFrom(this.datasets.curseElementsData);
        addFrom(this.datasets.faerieFireData);
        addFrom(this.datasets.scorchData);
        addFrom(this.datasets.demoShoutData);
        addFrom(this.datasets.polymorphData);
        addFrom(this.datasets.powerInfusionData);
        addFrom(this.datasets.decursesData);
        addFrom(this.datasets.frostResistanceData);
        addFrom(this.datasets.worldBuffsData);
        addFrom(this.datasets.voidDamageData);
        addFrom(this.datasets.bigBuyerData);
        // Attendance streaks and guild members fixed awards
        (this.datasets.playerStreaks || []).forEach(row => {
            const nm = String(row.character_name || '').toLowerCase();
            const v = nameToPlayer.get(nm);
            if (!v) return;
            // Mirror rules from raidlogs: 4: +3, 5:+6, 6:+9, 7:+12, 8+: +15
            const s = Number(row.player_streak) || 0;
            let pts = 0; if (s>=8) pts=15; else if (s===7) pts=12; else if (s===6) pts=9; else if (s===5) pts=6; else if (s===4) pts=3;
            v.points += pts;
        });
        (this.datasets.guildMembers || []).forEach(row => {
            const nm = String(row.character_name || '').toLowerCase();
            const v = nameToPlayer.get(nm);
            if (v) v.points += 10;
        });

        // Manual rewards
        (this.datasets.manualRewardsData || []).forEach(entry => {
            const nm = String(entry.player_name || '').toLowerCase();
            const v = nameToPlayer.get(nm);
            if (v) v.points += Number(entry.points) || 0;
        });

        // Compute total points (base + all contributions)
        let totalPointsAll = 0;
        nameToPlayer.forEach(v => { totalPointsAll += v.points; });
        this.totalPointsAll = totalPointsAll;

        // Gold per point
        const gpp = (this.sharedGoldPot > 0 && totalPointsAll > 0) ? this.sharedGoldPot / totalPointsAll : 0;
        nameToPlayer.forEach(v => {
            v.gold = Math.floor(v.points * gpp);
        });

        // Save into playerTotals map
        this.playerTotals = nameToPlayer;
    }

    reconcilePlayersWithLogData(playersData) {
        const confirmedNames = new Set((this.logData || [])
            .filter(p => !this.shouldIgnorePlayer(p.character_name))
            .map(p => String(p.character_name || '').trim().toLowerCase())
        );

        // Build a map of canonical class from logData for better accuracy
        const nameToClass = new Map();
        (this.logData || []).forEach(p => {
            const n = String(p.character_name || '').trim().toLowerCase();
            if (!confirmedNames.has(n)) return;
            if (p.character_class) nameToClass.set(n, p.character_class);
        });

        // Keep only players present in logData; dedupe by lowercase name
        const dedup = new Map();
        (playersData || []).forEach(p => {
            const raw = String(p.character_name || '').trim();
            if (this.shouldIgnorePlayer(raw)) return;
            const n = raw.toLowerCase();
            if (!confirmedNames.has(n)) return;
            if (!dedup.has(n)) {
                const klass = nameToClass.get(n) || p.character_class || 'Unknown';
                dedup.set(n, { character_name: raw, character_class: klass });
            }
        });

        this.allPlayers = Array.from(dedup.values());
    }

    updateTopStats() {
        const playersCount = this.allPlayers.length;
        const pointsTotal = Math.round(this.totalPointsAll);
        const goldShared = this.sharedGoldPot;
        const sPlayers = document.getElementById('statPlayers');
        const sPoints = document.getElementById('statPoints');
        const sGold = document.getElementById('statGold');
        if (sPlayers) sPlayers.textContent = playersCount.toLocaleString();
        if (sPoints) sPoints.textContent = pointsTotal.toLocaleString();
        if (sGold) sGold.textContent = goldShared.toLocaleString();
    }

    shouldIgnorePlayer(name) {
        if (!name) return false;
        const n = String(name).toLowerCase();
        return /(zzold|totem|ward|trap|dummy|battle\s*chicken)/i.test(n);
    }


    applyFilters() {
        const classFilter = document.getElementById('classFilter');
        const selectedClass = classFilter ? classFilter.value : '';

        this.filteredPlayers = this.allPlayers.filter(player => {
            // Class filter
            if (selectedClass && player.character_class !== selectedClass) {
                return false;
            }

            return true;
        });

        this.renderPlayers();
    }

    renderPlayers() {
        const playersGrid = document.getElementById('playersGrid');
        
        if (!playersGrid) {
            console.error('Players grid element not found');
            return;
        }

        if (this.filteredPlayers.length === 0) {
            this.showEmptyState();
            return;
        }

        // Sort players by class, then by name
        const sortedPlayers = this.filteredPlayers.slice().sort((a, b) => {
            const classOrder = this.getClassSortOrder(a.character_class) - this.getClassSortOrder(b.character_class);
            if (classOrder !== 0) return classOrder;
            
            return a.character_name.localeCompare(b.character_name);
        });

        let playersHtml = '';
        
        sortedPlayers.forEach(player => {
            const classLower = (player.character_class || 'Unknown').toLowerCase();
            const key = String(player.character_name || '').toLowerCase();
            const totals = this.playerTotals.get(key) || { points: 0, gold: 0 };
            playersHtml += `
                <div class="player-card ${classLower}" data-class="${player.character_class}">
                    <div class="player-info">
                        <div class="player-details">
                            <div class="player-name">${player.character_name}</div>
                            <div class="player-class">${player.character_class}</div>
                        </div>
                        <div class="player-stats">
                            <div class="player-points"><i class="fas fa-star"></i> ${Math.round(totals.points).toLocaleString()} pts</div>
                            <div class="player-gold"><i class="fas fa-coins"></i> ${Number(totals.gold || 0).toLocaleString()} gold</div>
                        </div>
                    </div>
                </div>
            `;
        });

        playersGrid.innerHTML = playersHtml;
    }

    showEmptyState() {
        const playersGrid = document.getElementById('playersGrid');
        
        if (playersGrid) {
            playersGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No Players Found</h3>
                    <p>No confirmed players match your current filter criteria. Try adjusting the filters or check back after running log analysis.</p>
                </div>
            `;
        }
    }

    getClassSortOrder(characterClass) {
        const classOrder = {
            'Warrior': 1,
            'Rogue': 2,
            'Hunter': 3,
            'Mage': 4,
            'Warlock': 5,
            'Shaman': 6,
            'Paladin': 7,
            'Druid': 8,
            'Priest': 9
        };
        return classOrder[characterClass] || 999;
    }

    showLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorDisplay = document.getElementById('errorDisplay');
        const goldContent = document.getElementById('goldContent');
        
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (errorDisplay) errorDisplay.style.display = 'none';
        if (goldContent) goldContent.style.display = 'none';
    }

    showError(message) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorDisplay = document.getElementById('errorDisplay');
        const goldContent = document.getElementById('goldContent');
        const errorMessage = document.getElementById('errorMessage');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorDisplay) errorDisplay.style.display = 'block';
        if (goldContent) goldContent.style.display = 'none';
        if (errorMessage) errorMessage.textContent = message;
    }

    showContent() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorDisplay = document.getElementById('errorDisplay');
        const goldContent = document.getElementById('goldContent');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorDisplay) errorDisplay.style.display = 'none';
        if (goldContent) goldContent.style.display = 'block';
    }
}

// Initialize the Gold Pot Manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GoldPotManager();
}); 