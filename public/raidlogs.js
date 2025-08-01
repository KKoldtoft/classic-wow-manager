// Raid Logs JavaScript

class RaidLogsManager {
    constructor() {
        this.activeEventId = null;
        this.logData = null;
        this.abilitiesData = [];
        this.abilitiesSettings = { calculation_divisor: 10, max_points: 20 };
        this.manaPotionsData = [];
        this.manaPotionsSettings = { threshold: 10, points_per_potion: 3, max_points: 10 };
        this.runesData = [];
        this.runesSettings = { usage_divisor: 2, points_per_division: 1 };
        this.interruptsData = [];
        this.interruptsSettings = { points_per_interrupt: 1, interrupts_needed: 1, max_points: 5 };
        this.disarmsData = [];
        this.disarmsSettings = { points_per_disarm: 1, disarms_needed: 1, max_points: 5 };
        this.sunderData = [];
        this.sunderSettings = { point_ranges: [] };
        this.rewardSettings = {};
        this.specData = {};
        this.initializeEventListeners();
        this.loadSpecData();
        this.loadRaidLogsData();
    }

    initializeEventListeners() {
        // Listen for storage changes to reload data when event changes
        window.addEventListener('storage', (e) => {
            if (e.key === 'activeEventSession') {
                this.loadRaidLogsData();
            }
        });
    }

    async loadRaidLogsData() {
        this.activeEventId = localStorage.getItem('activeEventSession');
        
        if (!this.activeEventId) {
            this.showNoData('No active raid session found');
            return;
        }

        console.log(`📊 Loading raid logs data for event: ${this.activeEventId}`);
        
        this.showLoading();
        
        try {
            // Fetch log data, raid statistics, abilities data, mana potions data, runes data, interrupts data, disarms data, sunder data, and reward settings in parallel
            await Promise.all([
                this.fetchLogData(), // Now includes backend role enhancement via roster_overrides
                this.fetchRaidStats(),
                this.fetchAbilitiesData(),
                this.fetchManaPotionsData(),
                this.fetchRunesData(),
                this.fetchInterruptsData(),
                this.fetchDisarmsData(),
                this.fetchSunderData(),
                this.fetchRewardSettings()
            ]);
            this.displayRaidLogs();
        } catch (error) {
            console.error('Error loading raid logs data:', error);
            this.showError('Failed to load raid logs data');
        }
    }

    async fetchLogData() {
        console.log(`📖 Fetching log data for event: ${this.activeEventId}`);
        
        const response = await fetch(`/api/log-data/${this.activeEventId}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch log data: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch log data');
        }
        
        this.logData = result.data || [];
        console.log(`📊 Loaded ${this.logData.length} log entries (enhanced with roster data)`);
    }

    async fetchRaidStats() {
        console.log(`📊 Fetching raid statistics for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/raid-stats/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch raid stats: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch raid stats');
            }
            
            this.raidStats = result.data || {};
            console.log(`📊 Loaded raid statistics:`, this.raidStats);
            
            // Update stat cards immediately
            this.updateStatCards();
            
        } catch (error) {
            console.error('Error fetching raid statistics:', error);
            // Don't fail the whole page if stats fail - just show default values
            this.raidStats = {};
            this.updateStatCards();
        }
    }

    async fetchAbilitiesData() {
        console.log(`💣 Fetching abilities data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/abilities-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch abilities data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch abilities data');
            }
            
            this.abilitiesData = result.data || [];
            this.abilitiesSettings = result.settings || { calculation_divisor: 10, max_points: 20 };
            console.log(`💣 Loaded abilities data:`, this.abilitiesData);
            console.log(`💣 Loaded abilities settings:`, this.abilitiesSettings);
            
        } catch (error) {
            console.error('Error fetching abilities data:', error);
            // Don't fail the whole page if abilities fail - just show empty data
            this.abilitiesData = [];
            this.abilitiesSettings = { calculation_divisor: 10, max_points: 20 }; // fallback
        }
    }

    async fetchRewardSettings() {
        console.log(`🏆 Fetching reward settings...`);
        
        try {
            const response = await fetch(`/api/reward-settings`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch reward settings: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch reward settings');
            }
            
            this.rewardSettings = result.settings || {};
            console.log(`🏆 Loaded reward settings:`, this.rewardSettings);
            
        } catch (error) {
            console.error('Error fetching reward settings:', error);
            // Don't fail the whole page if settings fail - use fallback values
            this.rewardSettings = {
                damage: { points_array: [80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3] },
                healing: { points_array: [80, 65, 60, 55, 40, 35, 30, 20, 15, 10] },
                abilities: { calculation_divisor: 10, max_points: 20 }
            };
        }
    }

    async fetchManaPotionsData() {
        console.log(`🧪 Fetching mana potions data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/mana-potions-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch mana potions data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch mana potions data');
            }
            
            this.manaPotionsData = result.data || [];
            this.manaPotionsSettings = result.settings || { threshold: 10, points_per_potion: 3, max_points: 10 };
            console.log(`🧪 Loaded mana potions data:`, this.manaPotionsData);
            console.log(`🧪 Loaded mana potions settings:`, this.manaPotionsSettings);
            
        } catch (error) {
            console.error('Error fetching mana potions data:', error);
            // Don't fail the whole page if mana potions fail - just show empty data
            this.manaPotionsData = [];
            this.manaPotionsSettings = { threshold: 10, points_per_potion: 3, max_points: 10 }; // fallback
        }
    }

    async fetchRunesData() {
        console.log(`🔮 Fetching runes data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/runes-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch runes data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch runes data');
            }
            
            this.runesData = result.data || [];
            this.runesSettings = result.settings || { usage_divisor: 2, points_per_division: 1 };
            console.log(`🔮 Loaded runes data:`, this.runesData);
            console.log(`🔮 Loaded runes settings:`, this.runesSettings);
            
        } catch (error) {
            console.error('Error fetching runes data:', error);
            // Don't fail the whole page if runes fail - just show empty data
            this.runesData = [];
            this.runesSettings = { usage_divisor: 2, points_per_division: 1 }; // fallback
        }
    }

    async fetchInterruptsData() {
        console.log(`⚡ Fetching interrupts data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/interrupts-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch interrupts data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch interrupts data');
            }
            
            this.interruptsData = result.data || [];
            this.interruptsSettings = result.settings || { points_per_interrupt: 1, interrupts_needed: 1, max_points: 5 };
            console.log(`⚡ Loaded interrupts data:`, this.interruptsData);
            console.log(`⚡ Loaded interrupts settings:`, this.interruptsSettings);
            
        } catch (error) {
            console.error('Error fetching interrupts data:', error);
            // Don't fail the whole page if interrupts fail - just show empty data
            this.interruptsData = [];
            this.interruptsSettings = { points_per_interrupt: 1, interrupts_needed: 1, max_points: 5 }; // fallback
        }
    }

    async fetchDisarmsData() {
        console.log(`🛡️ Fetching disarms data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/disarms-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch disarms data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch disarms data');
            }
            
            this.disarmsData = result.data || [];
            this.disarmsSettings = result.settings || { points_per_disarm: 1, disarms_needed: 1, max_points: 5 };
            console.log(`🛡️ Loaded disarms data:`, this.disarmsData);
            console.log(`🛡️ Loaded disarms settings:`, this.disarmsSettings);
            
        } catch (error) {
            console.error('Error fetching disarms data:', error);
            // Don't fail the whole page if disarms fail - just show empty data
            this.disarmsData = [];
            this.disarmsSettings = { points_per_disarm: 1, disarms_needed: 1, max_points: 5 }; // fallback
        }
    }

    async fetchSunderData() {
        console.log(`⚔️ Fetching sunder armor data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/sunder-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch sunder data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch sunder data');
            }
            
            this.sunderData = result.data || [];
            this.sunderSettings = result.settings || { point_ranges: [] };
            console.log(`⚔️ Loaded sunder data:`, this.sunderData);
            console.log(`⚔️ Loaded sunder settings:`, this.sunderSettings);
            
        } catch (error) {
            console.error('Error fetching sunder data:', error);
            // Don't fail the whole page if sunder fails - just show empty data
            this.sunderData = [];
            this.sunderSettings = { point_ranges: [] }; // fallback
        }
    }

    updateStatCards() {
        // Update RPB Archive card
        this.updateRPBArchiveCard();
        
        // Update Raid Duration card
        this.updateRaidDurationCard();
        
        // Update Bosses Killed card
        this.updateBossesKilledCard();
        
        // Update Last Boss card
        this.updateLastBossCard();
        
        // Update WoW Logs card
        this.updateWoWLogsCard();
    }

    updateRPBArchiveCard() {
        const button = document.getElementById('rpb-archive-button');
        const detail = document.getElementById('rpb-archive-detail');
        
        if (this.raidStats.rpb && this.raidStats.rpb.archiveUrl) {
            // Enable button and set URL
            button.disabled = false;
            button.onclick = () => window.open(this.raidStats.rpb.archiveUrl, '_blank');
            
            // Update detail text
            if (this.raidStats.rpb.archiveName) {
                detail.textContent = this.raidStats.rpb.archiveName;
            } else {
                detail.textContent = 'Archive available';
            }
        } else {
            // Keep button disabled
            button.disabled = true;
            detail.textContent = 'No archive available';
        }
    }

    updateRaidDurationCard() {
        const valueElement = document.getElementById('raid-duration-value');
        const detailElement = document.querySelector('.raid-duration .stat-detail');
        
        if (this.raidStats.stats && this.raidStats.stats.totalTime) {
            const hours = Math.floor(this.raidStats.stats.totalTime / 60);
            const minutes = this.raidStats.stats.totalTime % 60;
            
            // Format as "2h 35m" for values over 60 minutes, otherwise just "89m"
            if (hours > 0) {
                valueElement.textContent = `${hours}h ${minutes}m`;
            } else {
                valueElement.textContent = `${this.raidStats.stats.totalTime}m`;
            }
            
            // Show active fight time in detail if available
            if (this.raidStats.stats.activeFightTime) {
                detailElement.textContent = `${this.raidStats.stats.activeFightTime}m active fight time`;
            } else {
                detailElement.textContent = 'Total raid duration';
            }
        } else {
            valueElement.textContent = '--';
            detailElement.textContent = 'Minutes';
        }
    }

    updateBossesKilledCard() {
        const valueElement = document.getElementById('bosses-killed-value');
        
        if (this.raidStats.stats && this.raidStats.stats.bossesKilled !== undefined) {
            valueElement.textContent = this.raidStats.stats.bossesKilled;
        } else {
            valueElement.textContent = '--';
        }
    }

    updateLastBossCard() {
        const valueElement = document.getElementById('last-boss-value');
        const detailElement = document.getElementById('last-boss-detail');
        
        if (this.raidStats.stats && this.raidStats.stats.lastBoss) {
            valueElement.textContent = this.raidStats.stats.lastBoss;
            detailElement.textContent = 'Final boss defeated';
        } else {
            valueElement.textContent = '--';
            detailElement.textContent = 'No boss data';
        }
    }

    updateWoWLogsCard() {
        const button = document.getElementById('wow-logs-button');
        const detail = document.getElementById('wow-logs-detail');
        
        if (this.raidStats.stats && this.raidStats.stats.logUrl) {
            // Enable button and set URL
            button.disabled = false;
            button.onclick = () => window.open(this.raidStats.stats.logUrl, '_blank');
            detail.textContent = 'View detailed logs';
        } else {
            // Keep button disabled
            button.disabled = true;
            detail.textContent = 'No logs available';
        }
    }


    displayRaidLogs() {
        if (!this.logData || this.logData.length === 0) {
            console.log(`❌ No log data found for event: ${this.activeEventId}`);
            this.showNoData(`No raid logs data available for event: ${this.activeEventId}`);
            return;
        }

        // Debug: Log all role_detected values (enhanced by backend)
        console.log('🔍 [DEBUG] All role_detected values (backend enhanced):', this.logData.map(p => ({
            name: p.character_name,
            role: p.role_detected,
            spec: p.spec_name,
            source: p.role_source,
            damage: p.damage_amount,
            healing: p.healing_amount
        })));

        // Filter and sort damage dealers (DPS and Tank roles that do damage)
        const damageDealer = this.logData
            .filter(player => {
                const role = (player.role_detected || '').toLowerCase();
                const damage = parseInt(player.damage_amount) || 0;
                return (role === 'dps' || role === 'tank') && damage > 0;
            })
            .sort((a, b) => (parseInt(b.damage_amount) || 0) - (parseInt(a.damage_amount) || 0));

        // Filter and sort healers
        const healers = this.logData
            .filter(player => {
                const role = (player.role_detected || '').toLowerCase();
                const healing = parseInt(player.healing_amount) || 0;
                return role === 'healer' && healing > 0;
            })
            .sort((a, b) => (parseInt(b.healing_amount) || 0) - (parseInt(a.healing_amount) || 0));

        console.log(`📊 Found ${damageDealer.length} damage dealers and ${healers.length} healers`);
        console.log('🔍 [DEBUG] Damage dealers:', damageDealer.map(p => `${p.character_name} (${p.role_detected})`));
        console.log('🔍 [DEBUG] Healers:', healers.map(p => `${p.character_name} (${p.role_detected})`));

        // Display the rankings
        this.displayDamageRankings(damageDealer);
        this.displayHealerRankings(healers);
        this.displayAbilitiesRankings(this.abilitiesData);
        this.displayManaPotionsRankings(this.manaPotionsData);
        this.displayRunesRankings(this.runesData);
        this.displayInterruptsRankings(this.interruptsData);
        this.displayDisarmsRankings(this.disarmsData);
        this.updateAbilitiesHeader();
        this.updateManaPotionsHeader();
        this.updateRunesHeader();
        this.updateInterruptsHeader();
        this.updateDisarmsHeader();
        
        this.hideLoading();
        this.showContent();
    }

    displayDamageRankings(players) {
        const container = document.getElementById('damage-dealers-list');
        const section = container.closest('.rankings-section');
        section.classList.add('damage');

        // Get dynamic damage points array
        const damagePoints = this.rewardSettings.damage?.points_array || [80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3];

        // Filter out players with 0 points and preserve original position
        const playersWithPoints = players.map((player, index) => ({
            ...player,
            originalPosition: index + 1
        })).filter(player => {
            const points = player.originalPosition <= damagePoints.length ? damagePoints[player.originalPosition - 1] : 0;
            return points > 0;
        });

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-sword"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max damage for percentage calculation
        const maxDamage = parseInt(playersWithPoints[0].damage_amount) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = player.originalPosition;
            const trophyHtml = this.getTrophyHtml(position);
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedDamage = this.formatNumber(parseInt(player.damage_amount) || 0);
            const playerDamage = parseInt(player.damage_amount) || 0;
            const fillPercentage = Math.max(5, (playerDamage / maxDamage) * 100); // Minimum 5% for visibility
            
            // Calculate points (based on array length, rest get 0)
            const points = position <= damagePoints.length ? damagePoints[position - 1] : 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        ${trophyHtml}
                        ${position <= 3 ? '' : `<span class="ranking-number">#${position}</span>`}
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedDamage} damage">
                            ${this.truncateWithTooltip(`${formattedDamage} damage`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.damage_amount) || 0).toLocaleString()} damage">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayHealerRankings(players) {
        const container = document.getElementById('healers-list');
        const section = container.closest('.rankings-section');
        section.classList.add('healing');

        // Get dynamic healing points array
        const healingPoints = this.rewardSettings.healing?.points_array || [80, 65, 60, 55, 40, 35, 30, 20, 15, 10];

        // Filter out players with 0 points and preserve original position
        const playersWithPoints = players.map((player, index) => ({
            ...player,
            originalPosition: index + 1
        })).filter(player => {
            const points = player.originalPosition <= healingPoints.length ? healingPoints[player.originalPosition - 1] : 0;
            return points > 0;
        });

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-heart"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max healing for percentage calculation
        const maxHealing = parseInt(playersWithPoints[0].healing_amount) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = player.originalPosition;
            const trophyHtml = this.getTrophyHtml(position);
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedHealing = this.formatNumber(parseInt(player.healing_amount) || 0);
            const playerHealing = parseInt(player.healing_amount) || 0;
            const fillPercentage = Math.max(5, (playerHealing / maxHealing) * 100); // Minimum 5% for visibility
            
            // Calculate points (based on array length, rest get 0)
            const points = position <= healingPoints.length ? healingPoints[position - 1] : 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        ${trophyHtml}
                        ${position <= 3 ? '' : `<span class="ranking-number">#${position}</span>`}
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedHealing} healing">
                            ${this.truncateWithTooltip(`${formattedHealing} healing`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.healing_amount) || 0).toLocaleString()} healing">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayAbilitiesRankings(players) {
        const container = document.getElementById('abilities-list');
        const section = container.closest('.rankings-section');
        section.classList.add('abilities');

        // Filter out players with 0 points
        const playersWithPoints = players.filter(player => player.points > 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-bomb"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max points for percentage calculation
        const maxPoints = Math.max(...playersWithPoints.map(p => p.points)) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.points / maxPoints) * 100); // Minimum 5% for visibility

            // Create breakdown of abilities used
            const abilities = [];
            if (player.dense_dynamite > 0) abilities.push(`${player.dense_dynamite} Dynamite`);
            if (player.goblin_sapper_charge > 0) abilities.push(`${player.goblin_sapper_charge} Sappers`);
            if (player.stratholme_holy_water > 0) abilities.push(`${player.stratholme_holy_water} Holy Water`);
            
            const abilitiesText = abilities.join(', ') || 'No abilities used';

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${player.character_name}
                        </div>
                        <div class="character-details" title="${abilitiesText}">
                            ${this.truncateWithTooltip(abilitiesText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="Total: ${player.total_used} abilities, Avg targets: ${player.avg_targets_hit.toFixed(1)}">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateAbilitiesHeader() {
        const headerElement = document.querySelector('.abilities-section .section-header p');
        if (headerElement && this.abilitiesSettings) {
            const { calculation_divisor, max_points } = this.abilitiesSettings;
            headerElement.textContent = `Ranked by calculated points (abilities used × avg targets ÷ ${calculation_divisor}, max ${max_points})`;
        }
    }

    displayManaPotionsRankings(players) {
        const container = document.getElementById('mana-potions-list');
        const section = container.closest('.rankings-section');
        section.classList.add('mana-potions');

        // Filter out players with 0 points
        const playersWithPoints = players.filter(player => player.points > 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-flask"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max points for percentage calculation
        const maxPoints = Math.max(...playersWithPoints.map(p => p.points)) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.points / maxPoints) * 100); // Minimum 5% for visibility

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${player.character_name}
                        </div>
                        <div class="character-details" title="${player.potions_used} potions used (${player.extra_potions} above threshold)">
                            ${this.truncateWithTooltip(`${player.potions_used} potions used (${player.extra_potions} above threshold)`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.potions_used} potions used, ${player.extra_potions} above threshold of ${this.manaPotionsSettings.threshold}">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateManaPotionsHeader() {
        const headerElement = document.querySelector('.mana-potions-section .section-header p');
        if (headerElement && this.manaPotionsSettings) {
            const { threshold, points_per_potion, max_points } = this.manaPotionsSettings;
            headerElement.textContent = `Ranked by points (${points_per_potion} pts per potion above ${threshold}, max ${max_points})`;
        }
    }

    displayRunesRankings(players) {
        const container = document.getElementById('runes-list');
        const section = container.closest('.rankings-section');
        section.classList.add('runes');

        // Filter out players with 0 points
        const playersWithPoints = players.filter(player => player.points > 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max points for percentage calculation
        const maxPoints = Math.max(...playersWithPoints.map(p => p.points)) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.points / maxPoints) * 100); // Minimum 5% for visibility

            // Create breakdown of runes used
            const runes = [];
            if (player.dark_runes > 0) runes.push(`${player.dark_runes} Dark`);
            if (player.demonic_runes > 0) runes.push(`${player.demonic_runes} Demonic`);
            
            const runesText = runes.join(', ') || 'No runes used';

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${player.character_name}
                        </div>
                        <div class="character-details" title="${runesText} (${player.total_runes} total)">
                            ${this.truncateWithTooltip(`${runesText} (${player.total_runes} total)`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.total_runes} runes used (${Math.floor(player.total_runes / this.runesSettings.usage_divisor)} divisions)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateRunesHeader() {
        const headerElement = document.querySelector('.runes-section .section-header p');
        if (headerElement && this.runesSettings) {
            const { usage_divisor, points_per_division } = this.runesSettings;
            const pointsText = points_per_division === 1 ? 'pt' : 'pts';
            const runesText = usage_divisor === 1 ? 'rune' : 'runes';
            headerElement.textContent = `Ranked by points (${points_per_division} ${pointsText} per ${usage_divisor} ${runesText})`;
        }
    }

    displayInterruptsRankings(players) {
        const container = document.getElementById('interrupts-list');
        const section = container.closest('.rankings-section');
        section.classList.add('interrupts');

        // Filter out players with 0 points
        const playersWithPoints = players.filter(player => player.points > 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-hand-paper"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max points for percentage calculation
        const maxPoints = Math.max(...playersWithPoints.map(p => p.points)) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.points / maxPoints) * 100); // Minimum 5% for visibility

            const interruptsText = `${player.interrupts_used} interrupts`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${player.character_name}
                        </div>
                        <div class="character-details" title="${interruptsText}">
                            ${this.truncateWithTooltip(interruptsText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.interrupts_used} interrupts (max ${this.interruptsSettings.max_points} points)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateInterruptsHeader() {
        const headerElement = document.querySelector('.interrupts-section .section-header p');
        if (headerElement && this.interruptsSettings) {
            const { points_per_interrupt, interrupts_needed, max_points } = this.interruptsSettings;
            const pointsText = points_per_interrupt === 1 ? 'pt' : 'pts';
            const interruptsText = interrupts_needed === 1 ? 'interrupt' : 'interrupts';
            headerElement.textContent = `Ranked by points (${points_per_interrupt} ${pointsText} per ${interrupts_needed} ${interruptsText}, max ${max_points})`;
        }
    }

    displayDisarmsRankings(players) {
        const container = document.getElementById('disarms-list');
        const section = container.closest('.rankings-section');
        section.classList.add('disarms');

        // Filter out players with 0 points
        const playersWithPoints = players.filter(player => player.points > 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-alt"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max points for percentage calculation
        const maxPoints = Math.max(...playersWithPoints.map(p => p.points)) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.points / maxPoints) * 100); // Minimum 5% for visibility

            const disarmsText = `${player.disarms_used} disarms`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${player.character_name}
                        </div>
                        <div class="character-details" title="${disarmsText}">
                            ${this.truncateWithTooltip(disarmsText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.disarms_used} disarms (max ${this.disarmsSettings.max_points} points)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDisarmsHeader() {
        const headerElement = document.querySelector('.disarms-section .section-header p');
        if (headerElement && this.disarmsSettings) {
            const { points_per_disarm, disarms_needed, max_points } = this.disarmsSettings;
            const pointsText = points_per_disarm === 1 ? 'pt' : 'pts';
            const disarmsText = disarms_needed === 1 ? 'disarm' : 'disarms';
            headerElement.textContent = `Ranked by points (${points_per_disarm} ${pointsText} per ${disarms_needed} ${disarmsText}, max ${max_points})`;
        }
    }

    displaySunderRankings(players) {
        const container = document.getElementById('sunder-list');
        const section = container.closest('.rankings-section');
        section.classList.add('sunder');

        // Filter out players with 0 or negative points for display, but show all non-zero
        const playersWithPoints = players.filter(player => player.points !== 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-virus"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max absolute points for percentage calculation
        const maxAbsPoints = Math.max(...playersWithPoints.map(p => Math.abs(p.points))) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (Math.abs(player.points) / maxAbsPoints) * 100); // Minimum 5% for visibility

            const sunderText = `${player.sunder_count} sunders (${player.raw_value})`;
            
            // Determine point color based on the range color
            let pointColor = '#ff6b35'; // default
            if (player.color === 'red') pointColor = '#dc3545';
            else if (player.color === 'gray') pointColor = '#6c757d';
            else if (player.color === 'green') pointColor = '#28a745';
            else if (player.color === 'blue') pointColor = '#007bff';

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${player.character_name}
                        </div>
                        <div class="character-details" title="${sunderText}">
                            ${this.truncateWithTooltip(sunderText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.sunder_count} sunders applied">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateSunderHeader() {
        const headerElement = document.querySelector('.sunder-section .section-header p');
        if (headerElement && this.sunderSettings && this.sunderSettings.point_ranges) {
            const ranges = this.sunderSettings.point_ranges;
            if (ranges.length > 0) {
                // Create a summary of ranges
                const rangeTexts = ranges.map(r => {
                    if (r.min === 0 && r.max < 50) return `<${r.max + 1}: ${r.points}pts`;
                    if (r.max >= 999) return `${r.min}+: ${r.points}pts`;
                    return `${r.min}-${r.max}: ${r.points}pts`;
                });
                headerElement.textContent = `Ranked by points (${rangeTexts.join(', ')})`;
            }
        }
    }

    normalizeClassName(className) {
        if (!className) return 'unknown';
        
        // Convert to lowercase and replace spaces with dashes
        let normalized = className.toLowerCase().replace(/\s+/g, '-');
        
        // Fix common typos
        const typoFixes = {
            'priets': 'priest',
            'preist': 'priest',
            'mge': 'mage',
            'warior': 'warrior',
            'shamn': 'shaman',
            'huntter': 'hunter',
            'druid': 'druid',
            'roge': 'rogue',
            'paldin': 'paladin',
            'warlok': 'warlock'
        };
        
        // Apply typo fixes
        if (typoFixes[normalized]) {
            normalized = typoFixes[normalized];
        }
        
        return normalized;
    }

    truncateWithTooltip(text, maxLength = 20) {
        if (!text || text.length <= maxLength) {
            return {
                displayText: text || '',
                titleText: text || ''
            };
        }
        
        return {
            displayText: text.substring(0, maxLength) + '...',
            titleText: text
        };
    }

    getTrophyHtml(position) {
        switch (position) {
            case 1:
                return '<i class="fas fa-trophy trophy-icon gold"></i>';
            case 2:
                return '<i class="fas fa-trophy trophy-icon silver"></i>';
            case 3:
                return '<i class="fas fa-trophy trophy-icon bronze"></i>';
            default:
                return '';
        }
    }

    formatNumber(num) {
        if (num === 0) return '0';
        
        // Convert to millions/thousands for readability
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toLocaleString();
        }
    }

    showLoading() {
        document.getElementById('loading-indicator').style.display = 'flex';
        document.getElementById('raid-logs-container').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loading-indicator').style.display = 'none';
    }

    showContent() {
        document.getElementById('raid-logs-container').style.display = 'block';
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
    }

    showNoData(message) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('raid-logs-container').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
        
        const noDataMessage = document.getElementById('no-data-message');
        noDataMessage.style.display = 'flex';
        
        // Update the message if provided
        if (message) {
            const messageElement = noDataMessage.querySelector('.no-data-content p');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
    }

    showError(message) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('raid-logs-container').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'none';
        
        const errorDisplay = document.getElementById('error-display');
        errorDisplay.style.display = 'flex';
        
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }

    async loadSpecData() {
        try {
            const response = await fetch('/api/specs');
            this.specData = await response.json();
            console.log('📋 Loaded spec data:', this.specData);
        } catch (error) {
            console.error('Failed to load spec data:', error);
        }
    }

    getSpecIconUrl(specName, characterClass) {
        if (!this.specData || !specName || !characterClass) return null;
        
        // Normalize class name to match the spec data structure
        const canonicalClass = this.getCanonicalClass(characterClass);
        const specsForClass = this.specData[canonicalClass] || [];
        
        // Find the spec with matching name (try exact match first, then case-insensitive)
        let spec = specsForClass.find(s => s.name === specName);
        if (!spec) {
            spec = specsForClass.find(s => s.name.toLowerCase() === specName.toLowerCase());
        }
        
        // Special handling for "Restoration1" (Shaman) -> "Restoration"
        if (!spec && specName === 'Restoration1' && canonicalClass === 'shaman') {
            spec = specsForClass.find(s => s.name === 'Restoration');
        }
        
        if (spec && spec.emote) {
            return `https://cdn.discordapp.com/emojis/${spec.emote}.png`;
        }
        
        return null;
    }

    getCanonicalClass(className) {
        if (!className) return 'unknown';
        const lower = className.toLowerCase();
        if (lower.includes('death knight')) return 'death knight';
        if (lower.includes('druid')) return 'druid';
        if (lower.includes('hunter')) return 'hunter';
        if (lower.includes('mage')) return 'mage';
        if (lower.includes('paladin')) return 'paladin';
        if (lower.includes('priest')) return 'priest';
        if (lower.includes('rogue')) return 'rogue';
        if (lower.includes('shaman')) return 'shaman';
        if (lower.includes('warlock')) return 'warlock';
        if (lower.includes('warrior')) return 'warrior';
        return 'unknown';
    }

    getSpecIconHtml(specName, characterClass) {
        // Handle null or undefined spec names with red stop icon
        if (!specName || specName === 'null' || specName === null) {
            return `<i class="fas fa-stop-circle spec-icon null-spec" style="color: #ff4444;" title="No spec data"></i>`;
        }
        
        // For players with roster spec emotes, use those first
        const player = this.logData.find(p => 
            p.character_class === characterClass && 
            p.spec_name === specName && 
            p.roster_spec_emote
        );
        if (player && player.roster_spec_emote) {
            return `<img src="https://cdn.discordapp.com/emojis/${player.roster_spec_emote}.png" class="spec-icon" alt="${specName}">`;
        }
        
        const iconUrl = this.getSpecIconUrl(specName, characterClass);
        if (iconUrl) {
            return `<img src="${iconUrl}" class="spec-icon" alt="${specName}">`;
        }
        
        // Fallback for when spec isn't found in spec data
        return `<i class="fas fa-question-circle spec-icon unknown-spec" style="color: #ffa500;" title="Unknown spec: ${specName}"></i>`;
    }
}

// Initialize the raid logs manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Raid Logs Manager');
    new RaidLogsManager();
}); 