// WoW Logs Analysis JavaScript

class WoWLogsAnalyzer {
    constructor() {
        this.apiKey = 'e5c41ab0436b3a44c0e9c2fbd6cf016d';
        this.baseUrl = 'https://vanilla.warcraftlogs.com:443/v1/';
        this.currentLogData = null;
        
        // Use our backend proxy endpoint instead of direct Google Apps Script call
        this.rpbApiUrl = '/api/logs/rpb';
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Analyze button click
        document.getElementById('analyzeBtn').addEventListener('click', () => {
            this.analyzeLog();
        });

        // RPB button click
        document.getElementById('runRpbBtn').addEventListener('click', () => {
            this.runRPBAnalysis();
        });

        // Enter key in input field
        document.getElementById('logInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.analyzeLog();
            }
        });

        // Raw data toggle
        document.getElementById('toggleRawData').addEventListener('click', () => {
            this.toggleRawData();
        });

        // Tab switching for raw data
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }

    extractLogId(input) {
        // Remove whitespace
        input = input.trim();
        
        // If it's just an ID (alphanumeric, usually 16 characters)
        if (/^[a-zA-Z0-9]{10,20}$/.test(input)) {
            return input;
        }

        // Extract from full URL patterns
        const patterns = [
            /vanilla\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]+)/,
            /classic\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]+)/,
            /sod\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]+)/,
            /fresh\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]+)/
        ];

        for (const pattern of patterns) {
            const match = input.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('errorDisplay').style.display = 'none';
        document.getElementById('logData').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
    }

    showError(message) {
        this.hideLoading();
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorDisplay').style.display = 'block';
        document.getElementById('logData').style.display = 'none';
    }

    showData() {
        this.hideLoading();
        document.getElementById('errorDisplay').style.display = 'none';
        document.getElementById('logData').style.display = 'block';
    }

    async makeApiCall(endpoint) {
        // Check if endpoint already has parameters
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${this.baseUrl}${endpoint}${separator}translate=true&api_key=${this.apiKey}`;
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call error:', error);
            throw error;
        }
    }

    async analyzeLog() {
        const input = document.getElementById('logInput').value;
        const logId = this.extractLogId(input);

        if (!logId) {
            this.showError('Invalid log URL or ID. Please check the format and try again.');
            return;
        }

        this.showLoading();

        try {
            // Fetch fights data (Core Report Data #1)
            console.log('Fetching fights data...');
            const fightsData = await this.makeApiCall(`report/fights/${logId}`);
            
            // Fetch summary data for each boss fight (Core Report Data #2)
            console.log('Fetching summary data...');
            const summaryDataArray = [];
            
            if (fightsData.fights) {
                for (const fight of fightsData.fights) {
                    if (fight.boss > 0) { // Only boss fights
                        try {
                            const summaryData = await this.makeApiCall(
                                `report/tables/summary/${logId}?start=${fight.start_time}&end=${fight.end_time}`
                            );
                            summaryDataArray.push({
                                fight: fight,
                                summary: summaryData
                            });
                        } catch (error) {
                            console.warn(`Failed to fetch summary for fight ${fight.id}:`, error);
                        }
                    }
                }
            }

            // Get the overall time range for the entire log using RELATIVE fight times, not absolute timestamps
            // Use the first fight's start_time and last fight's end_time
            let logStartTime = 0;
            let logEndTime = 0;
            
            if (fightsData.fights && fightsData.fights.length > 0) {
                logStartTime = fightsData.fights[0].start_time;
                logEndTime = fightsData.fights[fightsData.fights.length - 1].end_time;
            }
            console.log('Log time range:', { start: logStartTime, end: logEndTime });
            console.log('Full fightsData time properties:', {
                start: fightsData.start,
                end: fightsData.end,
                logVersion: fightsData.logVersion,
                gameVersion: fightsData.gameVersion
            });
            
            // Check if there are other time properties in individual fights
            if (fightsData.fights && fightsData.fights.length > 0) {
                console.log('First fight time properties:', {
                    start_time: fightsData.fights[0].start_time,
                    end_time: fightsData.fights[0].end_time,
                    id: fightsData.fights[0].id,
                    boss: fightsData.fights[0].boss
                });
                console.log('Last fight time properties:', {
                    start_time: fightsData.fights[fightsData.fights.length - 1].start_time,
                    end_time: fightsData.fights[fightsData.fights.length - 1].end_time,
                    id: fightsData.fights[fightsData.fights.length - 1].id,
                    boss: fightsData.fights[fightsData.fights.length - 1].boss
                });
            }

            // First, try the simple direct approach that worked in Postman
            console.log('Trying direct damage/healing API calls...');
            let damageData = { entries: [] };
            let healingData = { entries: [] };

            try {
                console.log('Calling damage API...');
                const damageEndpoint = `report/tables/damage-done/${logId}?start=${logStartTime}&end=${logEndTime}`;
                console.log('Damage endpoint:', damageEndpoint);
                damageData = await this.makeApiCall(damageEndpoint);
                console.log('Damage API response:', damageData);
                console.log('Damage entries length:', damageData.entries ? damageData.entries.length : 'no entries property');
                console.log('Damage entries content:', damageData.entries);
                if (damageData.entries && damageData.entries.length > 0) {
                    console.log('First damage entry:', damageData.entries[0]);
                }
            } catch (error) {
                console.error('Direct damage API call failed:', error);
                damageData = { entries: [] };
            }

            try {
                console.log('Calling healing API...');
                const healingEndpoint = `report/tables/healing/${logId}?start=${logStartTime}&end=${logEndTime}`;
                console.log('Healing endpoint:', healingEndpoint);
                healingData = await this.makeApiCall(healingEndpoint);
                console.log('Healing API response:', healingData);
                console.log('Healing entries length:', healingData.entries ? healingData.entries.length : 'no entries property');
                console.log('Healing entries content:', healingData.entries);
                if (healingData.entries && healingData.entries.length > 0) {
                    console.log('First healing entry:', healingData.entries[0]);
                }
            } catch (error) {
                console.error('Direct healing API call failed:', error);
                healingData = { entries: [] };
            }

            // If direct approach didn't work, try fallback methods
            if (!damageData.entries || damageData.entries.length === 0) {
                console.log('Direct approach failed, trying summary data aggregation...');

                // Check if we can extract damage/healing from summary data
                if (summaryDataArray && summaryDataArray.length > 0) {
                    console.log('Found summary data, checking composition...');
                    
                    // Try to aggregate damage/healing from all boss fights
                    const playerTotals = {};
                    
                    summaryDataArray.forEach(bossData => {
                        if (bossData.summary && bossData.summary.composition) {
                            bossData.summary.composition.forEach(player => {
                                if (!playerTotals[player.name]) {
                                    playerTotals[player.name] = { 
                                        name: player.name, 
                                        damage: 0, 
                                        healing: 0,
                                        id: player.id
                                    };
                                }
                                // Add damage and healing if available
                                if (player.damage) playerTotals[player.name].damage += player.damage;
                                if (player.healing) playerTotals[player.name].healing += player.healing;
                            });
                        }
                    });

                    const playerList = Object.values(playerTotals);
                    if (playerList.length > 0) {
                        damageData.entries = playerList.filter(p => p.damage > 0).map(p => ({ name: p.name, total: p.damage }));
                        healingData.entries = playerList.filter(p => p.healing > 0).map(p => ({ name: p.name, total: p.healing }));
                        console.log('Extracted from summary - Damage entries:', damageData.entries.length, 'Healing entries:', healingData.entries.length);
                    }
                }

                // If summary approach didn't work, try individual player approach like RPB
                if (damageData.entries.length === 0 && fightsData.friendlies && fightsData.friendlies.length > 0) {
                    console.log('Summary approach failed, trying individual player fetching...');
                    
                    // Try fetching a few players individually to test the approach
                    const testPlayers = fightsData.friendlies.slice(0, 3); // Test with first 3 players
                    for (const player of testPlayers) {
                        try {
                            console.log(`Fetching individual data for player: ${player.name} (ID: ${player.id})`);
                            
                            const playerDamage = await this.makeApiCall(`report/tables/damage-done/${logId}?sourceid=${player.id}&start=${logStartTime}&end=${logEndTime}`);
                            const playerHealing = await this.makeApiCall(`report/tables/healing/${logId}?sourceid=${player.id}&start=${logStartTime}&end=${logEndTime}`);
                            
                            console.log(`Player ${player.name} damage:`, playerDamage);
                            console.log(`Player ${player.name} healing:`, playerHealing);
                            
                            // Calculate totals from entries
                            let totalDamage = 0;
                            let totalHealing = 0;
                            
                            if (playerDamage.entries) {
                                totalDamage = playerDamage.entries.reduce((sum, entry) => sum + (entry.total || 0), 0);
                            }
                            
                            if (playerHealing.entries) {
                                totalHealing = playerHealing.entries.reduce((sum, entry) => sum + (entry.total || 0), 0);
                            }
                            
                            if (totalDamage > 0) {
                                damageData.entries.push({ name: player.name, total: totalDamage });
                            }
                            
                            if (totalHealing > 0) {
                                healingData.entries.push({ name: player.name, total: totalHealing });
                            }
                            
                        } catch (error) {
                            console.error(`Failed to fetch data for player ${player.name}:`, error);
                        }
                    }
                    
                    console.log('Individual player approach results - Damage entries:', damageData.entries.length, 'Healing entries:', healingData.entries.length);
                }
            }

            // Store the data
            this.currentLogData = {
                logId: logId,
                fights: fightsData,
                summaries: summaryDataArray,
                damage: damageData,
                healing: healingData
            };

            // Display the data
            this.showData();
            this.displayLogData();

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError(`Failed to analyze log: ${error.message}`);
        }
    }

    displayLogData() {
        if (!this.currentLogData) return;

        this.displayFightData();
        this.displayCharactersData();
        this.displayDamageData();
        this.displayHealingData();
        this.displaySummaryData();
        this.displayRawData();
    }

    displayFightData() {
        const data = this.currentLogData.fights;
        const container = document.getElementById('fightDataContent');

        if (!container) {
            console.error('fightDataContent element not found');
            return;
        }

        // Basic info cards
        const infoCards = `
            <div class="fight-info">
                <div class="info-card">
                    <h4>Raid Title</h4>
                    <p>${data.title || 'Unknown'}</p>
                </div>
                <div class="info-card">
                    <h4>Zone</h4>
                    <p>${data.zone ? this.getZoneName(data.zone) : 'Unknown'}</p>
                </div>
                <div class="info-card">
                    <h4>Total Fights</h4>
                    <p>${data.fights ? data.fights.length : 0}</p>
                </div>
                <div class="info-card">
                    <h4>Boss Fights</h4>
                    <p>${data.fights ? data.fights.filter(f => f.boss > 0).length : 0}</p>
                </div>
                <div class="info-card">
                    <h4>Duration</h4>
                    <p>${this.formatDuration(data.end - data.start)}</p>
                </div>
                <div class="info-card">
                    <h4>Log Date</h4>
                    <p>${new Date(data.start).toLocaleDateString()}</p>
                </div>
            </div>
        `;

        // Fights list
        let fightsList = '<div class="fights-list">';
        
        if (data.fights) {
            data.fights.forEach(fight => {
                const duration = this.formatDuration(fight.end_time - fight.start_time);
                const isBoss = fight.boss > 0;
                const status = fight.kill ? 'kill' : 'wipe';
                
                fightsList += `
                    <div class="fight-item ${isBoss ? 'boss' : 'trash'}">
                        <div class="fight-name">
                            ${fight.name || `Fight ${fight.id}`}
                            ${isBoss ? '👑' : ''}
                        </div>
                        <div class="fight-details">
                            <div class="fight-duration">
                                ⏱️ ${duration}
                            </div>
                            ${isBoss ? `<span class="fight-status ${status}">${status}</span>` : ''}
                        </div>
                    </div>
                `;
            });
        }
        
        fightsList += '</div>';

        container.innerHTML = infoCards + fightsList;
    }

    displayCharactersData() {
        const data = this.currentLogData.fights;
        const container = document.getElementById('charactersDataContent');

        if (!container) {
            console.error('charactersDataContent element not found');
            return;
        }

        // Get characters from exportedCharacters (contains all 40 players)
        const exportedCharacters = data.exportedCharacters;
        const friendlies = data.friendlies;

        if (!exportedCharacters || exportedCharacters.length === 0) {
            container.innerHTML = '<p>No character data available in this log.</p>';
            return;
        }

        // Create a lookup map for friendlies data by name
        const friendliesMap = {};
        if (friendlies) {
            friendlies.forEach(friendly => {
                if (friendly.name) {
                    friendliesMap[friendly.name] = friendly;
                }
            });
        }

        // Display characters with enriched data
        let charactersHtml = '<div class="characters-list">';
        
        exportedCharacters.forEach(character => {
            const name = character.name || 'Unknown';
            
            // Find matching data in friendlies
            const friendlyData = friendliesMap[name];
            
            const characterClass = friendlyData?.type || 'Unknown';
            const server = friendlyData?.server || '';
            const spec = friendlyData?.icon || '';
            
            // Extract spec name from icon (e.g., "Warrior-Fury" -> "Fury")
            const specName = spec.includes('-') ? spec.split('-')[1] : '';
            
            // Get class color CSS class
            const classColorClass = this.getClassColorClass(characterClass);
            
            charactersHtml += `
                <div class="character-item">
                    <div class="character-main">
                        <span class="character-name ${classColorClass}">${name}</span>
                    </div>
                    <div class="character-details">
                        ${specName ? `<span class="character-spec">${specName}</span>` : ''}
                        ${server ? `<span class="character-server">${server}</span>` : ''}
                    </div>
                </div>
            `;
        });
        
        charactersHtml += '</div>';
        
        container.innerHTML = charactersHtml;
    }

    displayDamageData() {
        const damageData = this.currentLogData.damage;
        const container = document.getElementById('damageDataContent');

        if (!container) {
            console.error('damageDataContent element not found');
            return;
        }

        console.log('Displaying damage data:', damageData);

        if (!damageData) {
            container.innerHTML = '<p>No damage data fetched.</p>';
            return;
        }

        if (damageData.error) {
            container.innerHTML = `<p>Error fetching damage data: ${damageData.error}</p>`;
            return;
        }

        if (!damageData.entries || damageData.entries.length === 0) {
            container.innerHTML = `<p>No damage entries found. Raw data structure: <pre>${JSON.stringify(damageData, null, 2)}</pre></p>`;
            return;
        }

        // Get friendlies data for class colors
        const friendliesMap = this.getFriendliesMap();

        // Sort by total damage done (descending)
        const sortedDamage = [...damageData.entries].sort((a, b) => b.total - a.total);

        let damageHtml = '<div class="damage-list">';
        
        sortedDamage.forEach((entry, index) => {
            const playerName = entry.name || 'Unknown';
            const totalDamage = entry.total || 0;
            const friendlyData = friendliesMap[playerName];
            const characterClass = friendlyData?.type || 'Unknown';
            const classColorClass = this.getClassColorClass(characterClass);
            
            damageHtml += `
                <div class="damage-item">
                    <div class="damage-rank">#${index + 1}</div>
                    <div class="damage-player">
                        <span class="damage-name ${classColorClass}">${playerName}</span>
                    </div>
                    <div class="damage-amount">${this.formatNumber(totalDamage)}</div>
                </div>
            `;
        });
        
        damageHtml += '</div>';
        
        container.innerHTML = damageHtml;
    }

    displayHealingData() {
        const healingData = this.currentLogData.healing;
        const container = document.getElementById('healingDataContent');

        if (!container) {
            console.error('healingDataContent element not found');
            return;
        }

        console.log('Displaying healing data:', healingData);

        if (!healingData) {
            container.innerHTML = '<p>No healing data fetched.</p>';
            return;
        }

        if (healingData.error) {
            container.innerHTML = `<p>Error fetching healing data: ${healingData.error}</p>`;
            return;
        }

        if (!healingData.entries || healingData.entries.length === 0) {
            container.innerHTML = `<p>No healing entries found. Raw data structure: <pre>${JSON.stringify(healingData, null, 2)}</pre></p>`;
            return;
        }

        // Get friendlies data for class colors
        const friendliesMap = this.getFriendliesMap();

        // Sort by total healing done (descending)
        const sortedHealing = [...healingData.entries].sort((a, b) => b.total - a.total);

        let healingHtml = '<div class="healing-list">';
        
        sortedHealing.forEach((entry, index) => {
            const playerName = entry.name || 'Unknown';
            const totalHealing = entry.total || 0;
            const friendlyData = friendliesMap[playerName];
            const characterClass = friendlyData?.type || 'Unknown';
            const classColorClass = this.getClassColorClass(characterClass);
            
            healingHtml += `
                <div class="healing-item">
                    <div class="healing-rank">#${index + 1}</div>
                    <div class="healing-player">
                        <span class="healing-name ${classColorClass}">${playerName}</span>
                    </div>
                    <div class="healing-amount">${this.formatNumber(totalHealing)}</div>
                </div>
            `;
        });
        
        healingHtml += '</div>';
        
        container.innerHTML = healingHtml;
    }

    getFriendliesMap() {
        const friendliesMap = {};
        const friendlies = this.currentLogData.fights.friendlies;
        if (friendlies) {
            friendlies.forEach(friendly => {
                if (friendly.name) {
                    friendliesMap[friendly.name] = friendly;
                }
            });
        }
        return friendliesMap;
    }

    formatNumber(num) {
        const formattedOriginal = num.toLocaleString(); // Add thousands separators
        
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M (' + formattedOriginal + ')';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(2) + 'k (' + formattedOriginal + ')';
        }
        return num.toString();
    }

    getClassColorClass(characterClass) {
        const classColors = {
            'Warrior': 'class-warrior',
            'Paladin': 'class-paladin',
            'Hunter': 'class-hunter',
            'Rogue': 'class-rogue',
            'Priest': 'class-priest',
            'Shaman': 'class-shaman',
            'Mage': 'class-mage',
            'Warlock': 'class-warlock',
            'Druid': 'class-druid'
        };
        return classColors[characterClass] || 'class-unknown';
    }

    displaySummaryData() {
        const summaries = this.currentLogData.summaries;
        const container = document.getElementById('summaryDataContent');

        if (!container) {
            console.error('summaryDataContent element not found');
            return;
        }

        if (!summaries || summaries.length === 0) {
            container.innerHTML = '<p>No summary data available (no boss fights found).</p>';
            return;
        }

        let summaryHtml = '';

        summaries.forEach((bossData, index) => {
            const fight = bossData.fight;
            const summary = bossData.summary;

            summaryHtml += `
                <div class="boss-summary" style="margin-bottom: 2rem; padding: 1rem; background: var(--secondary-bg, #2a2a2a); border-radius: 4px;">
                    <h3 style="margin: 0 0 1rem 0; color: var(--primary-color, #4a9eff);">
                        ${fight.name} ${fight.kill ? '✅' : '❌'}
                    </h3>
            `;

            if (summary.composition) {
                // Raid composition
                const tanks = summary.composition.filter(p => p.specs && p.specs.some(s => s.role === 'tank'));
                const healers = summary.composition.filter(p => p.specs && p.specs.some(s => s.role === 'healer'));
                const dps = summary.composition.filter(p => p.specs && p.specs.some(s => s.role === 'dps'));

                summaryHtml += `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                        <div class="info-card">
                            <h4>🛡️ Tanks</h4>
                            <p>${tanks.length}</p>
                        </div>
                        <div class="info-card">
                            <h4>💚 Healers</h4>
                            <p>${healers.length}</p>
                        </div>
                        <div class="info-card">
                            <h4>⚔️ DPS</h4>
                            <p>${dps.length}</p>
                        </div>
                        <div class="info-card">
                            <h4>👥 Total</h4>
                            <p>${summary.composition.length}</p>
                        </div>
                    </div>
                `;

                // Player list by role
                summaryHtml += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">`;
                
                [
                    { role: 'tank', players: tanks, icon: '🛡️', name: 'Tanks' },
                    { role: 'healer', players: healers, icon: '💚', name: 'Healers' },
                    { role: 'dps', players: dps, icon: '⚔️', name: 'DPS' }
                ].forEach(roleGroup => {
                    if (roleGroup.players.length > 0) {
                        summaryHtml += `
                            <div style="background: var(--card-bg, #1e1e1e); padding: 1rem; border-radius: 4px; border: 1px solid var(--border-color, #3a3a3a);">
                                <h4 style="margin: 0 0 0.5rem 0; color: var(--text-primary, #e0e0e0);">${roleGroup.icon} ${roleGroup.name}</h4>
                                <ul style="margin: 0; padding-left: 1rem; list-style: none;">
                        `;
                        
                        roleGroup.players.forEach(player => {
                            const playerSpec = player.specs && player.specs[0] ? player.specs[0].spec : 'Unknown';
                            summaryHtml += `
                                <li style="color: var(--text-secondary, #bbb); margin-bottom: 0.25rem;">
                                    ${player.name} <span style="font-size: 0.8em; opacity: 0.7;">(${playerSpec})</span>
                                </li>
                            `;
                        });
                        
                        summaryHtml += `
                                </ul>
                            </div>
                        `;
                    }
                });
                
                summaryHtml += `</div>`;
            }

            summaryHtml += `</div>`;
        });

        container.innerHTML = summaryHtml;
    }

    displayRawData() {
        // Display raw JSON data
        const fightsElement = document.getElementById('rawFightsJson');
        if (fightsElement) {
            fightsElement.textContent = JSON.stringify(this.currentLogData.fights, null, 2);
        }
        
        const summaryElement = document.getElementById('rawSummaryJson');
        if (summaryElement) {
            summaryElement.textContent = JSON.stringify(this.currentLogData.summaries, null, 2);
        }
        
        // Display damage data (even if null or has errors)
        const damageElement = document.getElementById('rawDamageJson');
        if (damageElement) {
            damageElement.textContent = JSON.stringify(this.currentLogData.damage || 'No damage data', null, 2);
        }
        
        // Display healing data (even if null or has errors)
        const healingElement = document.getElementById('rawHealingJson');
        if (healingElement) {
            healingElement.textContent = JSON.stringify(this.currentLogData.healing || 'No healing data', null, 2);
        }
    }

    toggleRawData() {
        const rawDataContent = document.getElementById('rawDataContent');
        const toggleBtn = document.getElementById('toggleRawData');
        
        if (rawDataContent.style.display === 'none') {
            rawDataContent.style.display = 'block';
            toggleBtn.textContent = 'Hide';
        } else {
            rawDataContent.style.display = 'none';
            toggleBtn.textContent = 'Show';
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`raw${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Data`).classList.add('active');
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${remainingSeconds}s`;
    }

    getZoneName(zoneId) {
        const zones = {
            1000: 'Molten Core',
            1001: 'Blackwing Lair',
            1002: 'Ahn\'Qiraj Ruins',
            1005: 'Temple of Ahn\'Qiraj',
            1006: 'Naxxramas',
            2000: 'Molten Core (SoD)',
            2001: 'Blackwing Lair (SoD)',
            2002: 'Ahn\'Qiraj Ruins (SoD)',
            2005: 'Temple of Ahn\'Qiraj (SoD)',
            2006: 'Naxxramas (SoD)'
        };
        
        return zones[zoneId] || `Zone ${zoneId}`;
    }

    // RPB Integration Methods

    async runRPBAnalysis() {
        const input = document.getElementById('logInput').value;
        const logId = this.extractLogId(input);

        if (!logId) {
            this.showError('Invalid log URL or ID. Please check the format and try again.');
            return;
        }

        // Show loading state
        this.showRPBLoading();

        try {
            // Two-phase approach to eliminate race conditions
            await this.twoPhaseRPBExecution(input.trim());

        } catch (error) {
            console.error('RPB Analysis failed:', error);
            this.showError(`Failed to run RPB analysis: ${error.message}`);
        }
    }

    async twoPhaseRPBExecution(logUrl) {
        try {
            // PHASE 1: Clear F11 cell
            console.log('🧹 [FRONTEND] PHASE 1: Clearing F11 status cell...');
            this.updateRPBProgressMessage('Phase 1: Clearing previous status...');
            
            const clearResponse = await fetch(this.rpbApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'clearF11'
                })
            });

            const clearResult = await clearResponse.json();
            
            if (!clearResult.success) {
                throw new Error('Phase 1 failed: ' + clearResult.error);
            }
            
            console.log('✅ [FRONTEND] Phase 1 completed - F11 cleared');
            console.log('📝 [FRONTEND] Previous status was:', clearResult.previousStatus);
            
            // PHASE 2: Wait 5 seconds before starting RPB
            console.log('⏳ [FRONTEND] Waiting 5 seconds before Phase 2...');
            this.updateRPBProgressMessage('Waiting 5 seconds before starting analysis...');
            
            // Visual countdown
            for (let i = 5; i > 0; i--) {
                this.updateRPBProgressMessage(`Starting analysis in ${i} seconds...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // PHASE 2: Start RPB processing
            console.log('🚀 [FRONTEND] PHASE 2: Starting RPB processing...');
            this.updateRPBProgressMessage('Phase 2: Starting analysis...');
            
            // Start RPB in background (don't wait for completion)
            fetch(this.rpbApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'startRPB',
                    logUrl: logUrl
                })
            }).catch(error => {
                console.error('Failed to start RPB Phase 2:', error);
                if (!this.rpbCompleted) {
                    this.showError(`Phase 2 failed: ${error.message}`);
                }
            });

            // Start polling immediately after starting Phase 2
            this.rpbCompleted = false;
            this.pollRPBStatusWithTimer();
            
        } catch (error) {
            console.error('❌ [FRONTEND] Two-phase execution failed:', error);
            this.showError(`Two-phase execution failed: ${error.message}`);
        }
    }

    updateRPBProgressMessage(message) {
        const progressText = document.getElementById('rpbProgressText');
        if (progressText) {
            progressText.textContent = message;
        }
    }

    async pollRPBStatusWithTimer() {
        const maxDurationMs = 6 * 60 * 1000; // 6 minutes
        const pollIntervalMs = 5000; // 5 seconds
        const startTime = Date.now();

        const checkStatus = async () => {
            if (this.rpbCompleted) return;

            const elapsedMs = Date.now() - startTime;
            const progressPercent = Math.min((elapsedMs / maxDurationMs) * 100, 95); // Cap at 95% until complete

            // Update progress based on time, not attempts
            this.updateRPBProgressByTime(elapsedMs, progressPercent);

            try {
                const response = await fetch(this.rpbApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'checkStatus'
                    })
                });

                const result = await response.json();
                
                if (result.status === 'COMPLETE' || (result.status && result.status.toString().startsWith('COMPLETE'))) {
                    this.rpbCompleted = true;
                    this.showRPBComplete();
                    return;
                } else if (result.status && result.status.toString().startsWith('ERROR')) {
                    this.rpbCompleted = true;
                    throw new Error(result.status);
                }

                // Continue polling if still processing or if status check failed
                if (elapsedMs < maxDurationMs) {
                    setTimeout(checkStatus, pollIntervalMs);
                } else {
                    this.rpbCompleted = true;
                    throw new Error('RPB processing timed out after 6 minutes');
                }

            } catch (error) {
                if (!this.rpbCompleted) {
                    // Only show error if we haven't completed yet
                    if (elapsedMs >= maxDurationMs) {
                        this.showError('RPB processing timed out after 6 minutes');
                    } else {
                        // For status check errors, continue polling
                        console.warn('Status check failed, continuing...', error);
                        setTimeout(checkStatus, pollIntervalMs);
                    }
                }
            }
        };

        checkStatus();
    }

    showRPBLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('loadingIndicator').innerHTML = `
            <div class="spinner"></div>
            <p>Running RPB analysis... This may take up to 6 minutes.</p>
            <div id="rpbProgress" style="margin-top: 10px;">
                <div style="background: #333; border-radius: 4px; overflow: hidden;">
                    <div id="rpbProgressBar" style="height: 6px; background: var(--primary-color, #4a9eff); width: 0%; transition: width 0.3s;"></div>
                </div>
                <p id="rpbProgressText" style="font-size: 0.9em; color: var(--text-secondary, #bbb);">Starting...</p>
            </div>
        `;
        document.getElementById('errorDisplay').style.display = 'none';
        document.getElementById('logData').style.display = 'none';
    }

    updateRPBProgressByTime(elapsedMs, progressPercent) {
        const progressBar = document.getElementById('rpbProgressBar');
        const progressText = document.getElementById('rpbProgressText');
        
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const remainingSeconds = elapsedSeconds % 60;
        
        if (progressBar) {
            progressBar.style.width = `${Math.round(progressPercent)}%`;
        }
        if (progressText) {
            const timeStr = elapsedMinutes > 0 ? 
                `${elapsedMinutes}:${remainingSeconds.toString().padStart(2, '0')}` : 
                `${elapsedSeconds}s`;
            progressText.textContent = 
                `Processing... ${timeStr} elapsed (${Math.round(progressPercent)}%)`;
        }
    }

    showRPBComplete() {
        // Jump progress to 100% before showing completion
        const progressBar = document.getElementById('rpbProgressBar');
        const progressText = document.getElementById('rpbProgressText');
        if (progressBar) {
            progressBar.style.width = '100%';
        }
        if (progressText) {
            progressText.textContent = 'Complete! (100%)';
        }
        
        // Status clearing is now handled automatically by the status check itself
        
        // Small delay to show 100% before switching to complete screen
        setTimeout(() => {
            document.getElementById('loadingIndicator').style.display = 'none';
            document.getElementById('errorDisplay').style.display = 'none';
            
            // Show success message with link to sheet
            const sheetUrl = `https://docs.google.com/spreadsheets/d/11Y9nIYRdxPsQivpQGaK1B0Mc-tbnCR45A1I4-RaKvyk/edit?gid=588029694#gid=588029694`;
            
            document.getElementById('logData').innerHTML = `
                <div style="text-align: center; padding: 2rem; background: var(--card-bg, #1e1e1e); border-radius: 8px;">
                    <h2 style="color: var(--success-color, #28a745); margin-bottom: 1rem;">✅ RPB Analysis Complete!</h2>
                    <p style="margin-bottom: 2rem; color: var(--text-secondary, #bbb);">
                        Your detailed raid performance analysis is ready in the Google Sheet.
                    </p>
                    <a href="${sheetUrl}" target="_blank" class="btn btn-primary" style="margin-right: 1rem;">
                        📊 View RPB Analysis
                    </a>
                    <button id="archiveRpbBtn" class="btn btn-success" style="margin-right: 1rem;">
                        🗂️ Archive Results
                    </button>
                    <button onclick="location.reload()" class="btn btn-secondary">
                        🔄 Analyze Another Log
                    </button>
                </div>
            `;
            document.getElementById('logData').style.display = 'block';
            
            // Add event listener for archive button
            document.getElementById('archiveRpbBtn').addEventListener('click', () => {
                this.archiveRPBResults();
            });
        }, 500);
    }

    async clearRPBStatus() {
        try {
            console.log('🧹 [FRONTEND] Clearing RPB completion status...');
            
            const response = await fetch(this.rpbApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'clearStatus'
                })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ [FRONTEND] RPB status cleared successfully');
                console.log('📝 [FRONTEND] Previous status was:', result.previousStatus);
            } else {
                console.warn('⚠️ [FRONTEND] Failed to clear RPB status:', result.error);
            }

        } catch (error) {
            console.error('❌ [FRONTEND] Error clearing RPB status:', error);
        }
    }

    async archiveRPBResults() {
        const archiveBtn = document.getElementById('archiveRpbBtn');
        
        // Disable button and show loading state
        archiveBtn.disabled = true;
        archiveBtn.innerHTML = '⏳ Archiving...';
        
        try {
            const response = await fetch('/api/logs/rpb-archive', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                // Show success with link to archived sheet
                this.showArchiveSuccess(result);
            } else {
                throw new Error(result.error || 'Failed to archive results');
            }

        } catch (error) {
            console.error('Archive failed:', error);
            this.showArchiveError(error.message);
        } finally {
            // Re-enable button
            archiveBtn.disabled = false;
            archiveBtn.innerHTML = '🗂️ Archive Results';
        }
    }

    showArchiveSuccess(result) {
        // Update the completion message to include archive link
        const logDataDiv = document.getElementById('logData');
        const sheetUrl = `https://docs.google.com/spreadsheets/d/11Y9nIYRdxPsQivpQGaK1B0Mc-tbnCR45A1I4-RaKvyk/edit?gid=588029694#gid=588029694`;
        
        logDataDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; background: var(--card-bg, #1e1e1e); border-radius: 8px;">
                <h2 style="color: var(--success-color, #28a745); margin-bottom: 1rem;">✅ RPB Analysis Complete & Archived!</h2>
                <p style="margin-bottom: 1rem; color: var(--text-secondary, #bbb);">
                    Your detailed raid performance analysis is ready and has been archived.
                </p>
                <div style="background: var(--secondary-bg, #2a2a2a); padding: 1rem; border-radius: 4px; margin-bottom: 2rem;">
                    <p style="margin: 0; color: var(--text-primary, #e0e0e0); font-weight: bold;">
                        📁 Archived as: ${result.fileName}
                    </p>
                </div>
                <a href="${sheetUrl}" target="_blank" class="btn btn-primary" style="margin-right: 1rem;">
                    📊 View Master Sheet
                </a>
                <a href="${result.sheetUrl}" target="_blank" class="btn btn-success" style="margin-right: 1rem;">
                    🗂️ View Archived Copy
                </a>
                <button onclick="location.reload()" class="btn btn-secondary">
                    🔄 Analyze Another Log
                </button>
            </div>
        `;
    }

    showArchiveError(errorMessage) {
        // Show error message but keep the original success state
        const logDataDiv = document.getElementById('logData');
        const currentContent = logDataDiv.innerHTML;
        
        // Add error message above existing content
        logDataDiv.innerHTML = `
            <div style="background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                <h4 style="color: #dc3545; margin: 0 0 0.5rem 0;">Archive Failed</h4>
                <p style="color: var(--text-primary, #e0e0e0); margin: 0;">${errorMessage}</p>
            </div>
            ${currentContent}
        `;
    }
}

// Initialize the analyzer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WoWLogsAnalyzer();
}); 