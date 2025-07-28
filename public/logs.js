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

    async fetchRaidHelperData() {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            if (!activeEventSession) {
                console.warn('No active event session found in localStorage');
                return null;
            }

            console.log('Fetching Raid-Helper data for event:', activeEventSession);
            
            const response = await fetch(`/api/raid-helper/events/${activeEventSession}`);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Raid-Helper API error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();
            console.log('Raid-Helper data fetched:', data);
            return data;
        } catch (error) {
            console.error('Failed to fetch Raid-Helper data:', error);
            return null;
        }
    }

    parseRaidHelperRoles(raidHelperData) {
        if (!raidHelperData || !raidHelperData.signUps) {
            return {};
        }

        const roleMap = {};
        
        raidHelperData.signUps.forEach(signup => {
            if (signup.status !== 'primary') return; // Only consider primary signups
            
            const userId = signup.userId;
            const className = signup.className;
            const roleName = signup.roleName;
            
            let role = 'dps'; // default
            
            if (roleName === 'Tanks') {
                role = 'tank';
            } else if (roleName === 'Healers') {
                role = 'healer';
            } else if (roleName === 'Melee' || roleName === 'Ranged') {
                role = 'dps';
            }
            
            // Map by Discord user ID instead of name
            roleMap[userId] = {
                role: role,
                className: className,
                roleName: roleName,
                isConfirmed: true
            };
        });
        
        console.log('Parsed role map by Discord ID:', roleMap);
        return roleMap;
    }

    inferRoleFromPerformance(playerName, playerData, roleMap, damageEntries, healingEntries, rosterPlayers) {
        // First, try to find the Discord ID for this player via roster matching
        const rosterPlayer = rosterPlayers.find(p => 
            p.name && p.name.toLowerCase() === playerName.toLowerCase()
        );
        
        if (rosterPlayer && rosterPlayer.discordId && roleMap[rosterPlayer.discordId]) {
            // Found confirmed role via Discord ID match
            console.log(`✅ Found confirmed role for ${playerName} via Discord ID ${rosterPlayer.discordId}:`, roleMap[rosterPlayer.discordId]);
            return roleMap[rosterPlayer.discordId];
        }
        
        // No confirmed role found, try to infer from performance
        const damageEntry = damageEntries.find(entry => entry.name.toLowerCase() === playerName.toLowerCase());
        const healingEntry = healingEntries.find(entry => entry.name.toLowerCase() === playerName.toLowerCase());
        
        const playerDamage = damageEntry ? damageEntry.total : 0;
        const playerHealing = healingEntry ? healingEntry.total : 0;
        
        // Find confirmed DPS and healers for comparison using Discord ID matching
        const confirmedDPS = damageEntries.filter(entry => {
            const entryRosterPlayer = rosterPlayers.find(p => 
                p.name && p.name.toLowerCase() === entry.name.toLowerCase()
            );
            if (entryRosterPlayer && entryRosterPlayer.discordId) {
                const entryRole = roleMap[entryRosterPlayer.discordId];
                return entryRole && entryRole.role === 'dps';
            }
            return false;
        });
        
        const confirmedHealers = healingEntries.filter(entry => {
            const entryRosterPlayer = rosterPlayers.find(p => 
                p.name && p.name.toLowerCase() === entry.name.toLowerCase()
            );
            if (entryRosterPlayer && entryRosterPlayer.discordId) {
                const entryRole = roleMap[entryRosterPlayer.discordId];
                return entryRole && entryRole.role === 'healer';
            }
            return false;
        });
        
        // Check if this player out-damaged a confirmed DPS
        const lowestConfirmedDPSDamage = confirmedDPS.length > 0 ? 
            Math.min(...confirmedDPS.map(entry => entry.total)) : Infinity;
        
        // Check if this player out-healed a confirmed healer
        const lowestConfirmedHealerHealing = confirmedHealers.length > 0 ? 
            Math.min(...confirmedHealers.map(entry => entry.total)) : Infinity;
        
        if (playerDamage > lowestConfirmedDPSDamage && confirmedDPS.length > 0) {
            console.log(`🔍 Inferred DPS role for ${playerName} (damage: ${playerDamage} > lowest confirmed: ${lowestConfirmedDPSDamage})`);
            return {
                role: 'dps',
                className: 'Unknown',
                roleName: 'Inferred DPS',
                isConfirmed: false
            };
        }
        
        if (playerHealing > lowestConfirmedHealerHealing && confirmedHealers.length > 0) {
            console.log(`🔍 Inferred healer role for ${playerName} (healing: ${playerHealing} > lowest confirmed: ${lowestConfirmedHealerHealing})`);
            return {
                role: 'healer',
                className: 'Unknown', 
                roleName: 'Inferred Healer',
                isConfirmed: false
            };
        }
        
        return null;
    }

    getRoleIcon(role, isConfirmed = true) {
        const iconClass = isConfirmed ? 'role-icon' : 'role-icon inferred';
        
        switch (role) {
            case 'tank':
                return `<span class="${iconClass} tank" title="${isConfirmed ? 'Tank' : 'Inferred Tank'}">🛡️</span>`;
            case 'dps':
                return `<span class="${iconClass} dps" title="${isConfirmed ? 'DPS' : 'Inferred DPS'}">⚔️</span>`;
            case 'healer':
                return `<span class="${iconClass} healer" title="${isConfirmed ? 'Healer' : 'Inferred Healer'}">❤️</span>`;
            default:
                return '';
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

            // Fetch raid-helper data for role assignment
            console.log('Fetching Raid-Helper data...');
            const raidHelperData = await this.fetchRaidHelperData();
            const roleMap = this.parseRaidHelperRoles(raidHelperData);

            // Store the data
            this.currentLogData = {
                logId: logId,
                fights: fightsData,
                summaries: summaryDataArray,
                damage: damageData,
                healing: healingData,
                raidHelper: raidHelperData,
                roleMap: roleMap
            };

            // Display the data
            this.showData();
            await this.displayLogData();

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError(`Failed to analyze log: ${error.message}`);
        }
    }

    async displayLogData() {
        if (!this.currentLogData) return;

        // Show Characters first (most important) - now async
        await this.displayCharactersData();
        
        // Show damage and healing data
        this.displayDamageData();
        this.displayHealingData();
        
        // Show raw data
        this.displayRawData();
        
        // Hide Fight Data and Raid Summary panels
        this.hideFightDataPanel();
        this.hideSummaryPanel();
    }

    hideFightDataPanel() {
        const fightDataSection = document.querySelector('.data-section:has(#fightDataContent)');
        if (fightDataSection) {
            fightDataSection.style.display = 'none';
        }
        // Fallback method if :has() isn't supported
        const sections = document.querySelectorAll('.data-section');
        sections.forEach(section => {
            if (section.querySelector('#fightDataContent')) {
                section.style.display = 'none';
            }
        });
    }

    hideSummaryPanel() {
        const summaryDataSection = document.querySelector('.data-section:has(#summaryDataContent)');
        if (summaryDataSection) {
            summaryDataSection.style.display = 'none';
        }
        // Fallback method if :has() isn't supported
        const sections = document.querySelectorAll('.data-section');
        sections.forEach(section => {
            if (section.querySelector('#summaryDataContent')) {
                section.style.display = 'none';
            }
        });
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

    async displayCharactersData() {
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

        // Sort characters by class order, then alphabetically
        const sortedCharacters = this.sortCharactersByClassAndName(exportedCharacters, friendliesMap);
        
        // Fetch roster data for comparison
        const rosterData = await this.fetchRosterData();
        
        // Fetch previously confirmed players for this raid
        const confirmedPlayers = await this.fetchConfirmedPlayers();
        
        // Create comparison display
        this.displayCharacterComparison(sortedCharacters, friendliesMap, rosterData, container, confirmedPlayers);
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

        // Get role map, roster players, and healing data for role inference
        const roleMap = this.currentLogData.roleMap || {};
        const rosterPlayers = this.currentRosterPlayers || [];
        const healingEntries = this.currentLogData.healing?.entries || [];

        let damageHtml = '<div class="damage-list">';
        
        sortedDamage.forEach((entry, index) => {
            const playerName = entry.name || 'Unknown';
            const totalDamage = entry.total || 0;
            const friendlyData = friendliesMap[playerName];
            const characterClass = friendlyData?.type || 'Unknown';
            const classColorClass = this.getClassColorClass(characterClass);
            
            // Determine role and get icon
            let roleInfo = this.inferRoleFromPerformance(playerName, entry, roleMap, sortedDamage, healingEntries, rosterPlayers);
            let roleIcon = '';
            
            if (roleInfo) {
                roleIcon = this.getRoleIcon(roleInfo.role, roleInfo.isConfirmed);
            }
            
            damageHtml += `
                <div class="damage-item">
                    <div class="damage-rank">#${index + 1}</div>
                    <div class="damage-player">
                        <span class="damage-name ${classColorClass}">${playerName}${roleIcon}</span>
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

        // Get role map, roster players, and damage data for role inference
        const roleMap = this.currentLogData.roleMap || {};
        const rosterPlayers = this.currentRosterPlayers || [];
        const damageEntries = this.currentLogData.damage?.entries || [];

        let healingHtml = '<div class="healing-list">';
        
        sortedHealing.forEach((entry, index) => {
            const playerName = entry.name || 'Unknown';
            const totalHealing = entry.total || 0;
            const friendlyData = friendliesMap[playerName];
            const characterClass = friendlyData?.type || 'Unknown';
            const classColorClass = this.getClassColorClass(characterClass);
            
            // Determine role and get icon
            let roleInfo = this.inferRoleFromPerformance(playerName, entry, roleMap, damageEntries, sortedHealing, rosterPlayers);
            let roleIcon = '';
            
            if (roleInfo) {
                roleIcon = this.getRoleIcon(roleInfo.role, roleInfo.isConfirmed);
            }
            
            healingHtml += `
                <div class="healing-item">
                    <div class="healing-rank">#${index + 1}</div>
                    <div class="healing-player">
                        <span class="healing-name ${classColorClass}">${playerName}${roleIcon}</span>
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

    getClassBackgroundClass(characterClass) {
        const classBackgrounds = {
            'Warrior': 'class-bg-warrior',
            'Paladin': 'class-bg-paladin',
            'Hunter': 'class-bg-hunter',
            'Rogue': 'class-bg-rogue',
            'Priest': 'class-bg-priest',
            'Shaman': 'class-bg-shaman',
            'Mage': 'class-bg-mage',
            'Warlock': 'class-bg-warlock',
            'Druid': 'class-bg-druid'
        };
        return classBackgrounds[characterClass] || 'class-bg-unknown';
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
        return classOrder[characterClass] || 999; // Unknown classes go to the end
    }

    sortCharactersByClassAndName(characters, friendliesMap) {
        return characters.slice().sort((a, b) => {
            const nameA = a.name || 'Unknown';
            const nameB = b.name || 'Unknown';
            
            // Get character classes
            const classA = friendliesMap[nameA]?.type || 'Unknown';
            const classB = friendliesMap[nameB]?.type || 'Unknown';
            
            // Get class sort orders
            const orderA = this.getClassSortOrder(classA);
            const orderB = this.getClassSortOrder(classB);
            
            // Sort by class order first
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            
            // If same class, sort alphabetically by name
            return nameA.localeCompare(nameB);
        });
    }

    async fetchRosterData() {
        try {
            // Get the active event session ID from localStorage
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                console.log('No activeEventSession found in localStorage');
                return null;
            }

            console.log('Fetching roster for event:', activeEventSession);
            
            // Fetch roster data from the API (JSON endpoint)
            const response = await fetch(`/api/roster/${activeEventSession}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch roster: ${response.status} ${response.statusText}`);
            }
            
            const rosterData = await response.json();
            console.log('Roster data fetched:', rosterData);
            
            return rosterData;
            
        } catch (error) {
            console.error('Error fetching roster data:', error);
            console.error('Response status:', error.status);
            return null;
        }
    }

    async fetchConfirmedPlayers() {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                console.log('No activeEventSession found for confirmed players lookup');
                return [];
            }

            console.log('Fetching confirmed players for raid:', activeEventSession);
            
            const response = await fetch(`/api/confirmed-logs/${activeEventSession}/players?manually_matched=true`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch confirmed players: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Manually confirmed players fetched:', result.data);
            
            return result.data || [];
            
        } catch (error) {
            console.error('Error fetching confirmed players:', error);
            return [];
        }
    }

    calculateStringSimilarity(str1, str2) {
        // Convert to lowercase for comparison
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        // Exact match
        if (s1 === s2) return 1.0;
        
        // Levenshtein distance algorithm
        const matrix = [];
        const len1 = s1.length;
        const len2 = s2.length;
        
        // Initialize matrix
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        // Fill matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,        // deletion
                    matrix[i][j - 1] + 1,        // insertion
                    matrix[i - 1][j - 1] + cost  // substitution
                );
            }
        }
        
        // Calculate similarity (0-1 scale)
        const maxLen = Math.max(len1, len2);
        if (maxLen === 0) return 1.0;
        
        return 1 - (matrix[len1][len2] / maxLen);
    }

    findBestMatch(targetName, rosterNames) {
        if (!rosterNames || rosterNames.length === 0) {
            return null;
        }
        
        let bestMatch = null;
        let bestSimilarity = 0;
        
        rosterNames.forEach(rosterName => {
            const similarity = this.calculateStringSimilarity(targetName, rosterName);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = {
                    name: rosterName,
                    similarity: similarity
                };
            }
        });
        
        return bestMatch;
    }

    displayCharacterComparison(sortedCharacters, friendliesMap, rosterData, container, confirmedPlayers = []) {
        // Extract roster players with names and classes from raidDrop array
        let rosterPlayers = [];
        
        if (rosterData) {
            console.log('Roster data structure:', rosterData);
            console.log('raidDrop array:', rosterData.raidDrop);
            
            if (rosterData.raidDrop && Array.isArray(rosterData.raidDrop)) {
                rosterPlayers = rosterData.raidDrop
                    .map(player => {
                        if (!player) return null;
                        // Prefer mainCharacterName (for managed rosters) or fall back to name
                        const characterName = player.mainCharacterName || player.name;
                        const characterClass = player.class || 'Unknown';
                        const discordId = player.userid || null;
                        console.log(`Player: ${JSON.stringify(player)} -> Name: ${characterName}, Class: ${characterClass}, Discord: ${discordId}`);
                        return {
                            name: characterName,
                            class: characterClass,
                            discordId: discordId
                        };
                    })
                    .filter(player => player && player.name && player.name.trim()); // Remove empty/null names
            } else {
                console.warn('raidDrop is not an array or is missing:', rosterData.raidDrop);
            }
        } else {
            console.warn('No roster data received');
        }
        
        console.log('Extracted roster players:', rosterPlayers);
        
        // Store original data for reset functionality
        this.originalRosterPlayers = JSON.parse(JSON.stringify(rosterPlayers));
        this.originalSortedCharacters = JSON.parse(JSON.stringify(sortedCharacters));
        this.originalFriendliesMap = JSON.parse(JSON.stringify(friendliesMap));
        
        // Apply confirmed players (modify the data before comparison)
        const restoredPlayers = this.applyConfirmedPlayers(sortedCharacters, rosterPlayers, confirmedPlayers);
        
        // Store current data for later use in click handlers
        this.currentRosterPlayers = rosterPlayers;
        this.currentSortedCharacters = sortedCharacters;
        this.currentFriendliesMap = friendliesMap;
        
        // Create name-only array for compatibility with existing matching logic
        const rosterNames = rosterPlayers.map(player => player.name);
        
        const logsNames = sortedCharacters.map(char => char.name || 'Unknown');
        
        let comparisonHtml = '';
        
        // Calculate match statistics
        const matchStats = this.calculateMatchStatistics(sortedCharacters, friendliesMap, rosterPlayers);
        
        // Header with detailed counts
        comparisonHtml += this.generateValidationHeader(null, null, matchStats);
        
        // Add restoration message if players were restored
        if (restoredPlayers.length > 0) {
            comparisonHtml += this.generateRestorationMessage(restoredPlayers);
        }
        
        comparisonHtml += '<div class="character-comparison-container">';
        
        // Track which roster names have been matched
        const usedRosterNames = new Set();
        const exactMatches = [];
        
        // Process each character from logs
        sortedCharacters.forEach(character => {
            const logsName = character.name || 'Unknown';
            const friendlyData = friendliesMap[logsName];
            const characterClass = friendlyData?.type || 'Unknown';
            const classBackgroundClass = this.getClassBackgroundClass(characterClass);
            
            // Find exact match first
            let matchInfo = { type: 'none', rosterName: null, similarity: 0 };
            
            const exactMatch = rosterNames.find(name => name.toLowerCase() === logsName.toLowerCase());
            if (exactMatch) {
                matchInfo = { type: 'exact', rosterName: exactMatch, similarity: 1.0 };
                usedRosterNames.add(exactMatch);
                
                // Find roster player for this exact match to get Discord ID
                const rosterPlayer = rosterPlayers.find(p => p.name === exactMatch);
                if (rosterPlayer && rosterPlayer.discordId) {
                    exactMatches.push({
                        discordId: rosterPlayer.discordId,
                        characterName: logsName,
                        characterClass: characterClass
                    });
                }
            } else {
                // Find best approximate match from unused names
                const availableNames = rosterNames.filter(name => !usedRosterNames.has(name));
                const bestMatch = this.findBestMatch(logsName, availableNames);
                
                if (bestMatch && bestMatch.similarity > 0.5) { // Threshold for considering it a match
                    matchInfo = { type: 'approximate', rosterName: bestMatch.name, similarity: bestMatch.similarity };
                    usedRosterNames.add(bestMatch.name);
                }
            }
            
            // Find the roster player for class styling
            const rosterPlayer = rosterPlayers.find(p => p.name === matchInfo.rosterName);
            const rosterClassBackgroundClass = rosterPlayer ? this.getClassBackgroundClass(rosterPlayer.class) : '';
            
            // Create unique row ID for this comparison
            const rowId = `comparison-row-${logsName.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Check if this is a confirmed player (pre-matched from database)
            const confirmedPlayer = confirmedPlayers.find(confirmed => 
                confirmed.character_name.toLowerCase() === logsName.toLowerCase()
            );
            
            let finalMatchInfo = matchInfo;
            let finalRosterClassBackgroundClass = rosterClassBackgroundClass;
            
            if (confirmedPlayer) {
                // This is a confirmed player - mark as exact match
                finalMatchInfo = { type: 'exact', rosterName: confirmedPlayer.character_name, similarity: 1.0 };
                finalRosterClassBackgroundClass = this.getClassBackgroundClass(confirmedPlayer.character_class);
            }
            
            // Determine if this roster entry should be clickable (non-exact matches or missing)
            const isClickable = finalMatchInfo.type !== 'exact'; // Both approximate matches and "No match" should be clickable
            const clickableClass = isClickable ? 'roster-name-clickable' : '';
            const clickableAttributes = isClickable ? 
                `data-row-id="${rowId}" data-logs-name="${logsName}" data-logs-class="${characterClass}"` : '';
            
            // Add discord-id attribute for confirmed players
            const discordIdAttribute = confirmedPlayer ? `data-discord-id="${confirmedPlayer.discord_id}"` : '';
            
            comparisonHtml += `
                <div class="character-comparison-row" id="${rowId}">
                    <div class="logs-character ${classBackgroundClass}">
                        <span class="character-name-black">${logsName}</span>
                    </div>
                    <div class="comparison-indicator">
                        ${this.getComparisonIndicator(finalMatchInfo)}
                    </div>
                    <div class="roster-character ${finalRosterClassBackgroundClass}">
                        ${finalMatchInfo.rosterName ? 
                            `<span class="roster-name-black ${finalMatchInfo.type} ${clickableClass}" ${clickableAttributes} ${discordIdAttribute}>${finalMatchInfo.rosterName}</span>` : 
                            `<span class="roster-name missing ${clickableClass}" ${clickableAttributes}>No match</span>`}
                    </div>
                </div>
            `;
        });
        
        // Show unmatched roster names
        const unmatchedRosterPlayers = rosterPlayers.filter(player => !usedRosterNames.has(player.name));
        if (unmatchedRosterPlayers.length > 0) {
            comparisonHtml += '<div class="unmatched-section">';
            comparisonHtml += '<h4>❌ Unmatched Roster Players:</h4>';
            unmatchedRosterPlayers.forEach(player => {
                const unmatchedClassBackgroundClass = this.getClassBackgroundClass(player.class);
                comparisonHtml += `
                    <div class="character-comparison-row unmatched">
                        <div class="logs-character empty">
                            <span class="character-name-black">-</span>
                        </div>
                        <div class="comparison-indicator">
                            ❌
                        </div>
                        <div class="roster-character ${unmatchedClassBackgroundClass}">
                            <span class="roster-name-black unmatched">${player.name}</span>
                        </div>
                    </div>
                `;
            });
            comparisonHtml += '</div>';
        }
        
        comparisonHtml += '</div>';
        
        container.innerHTML = comparisonHtml;
        
        // Add event listeners to clickable roster names
        this.attachRosterNameClickListeners();
        
        // Add event listener for reset button if it exists
        this.attachResetButtonListener();
        
        // Store reference to container for real-time updates
        this.currentComparisonContainer = container;
        
        // Store exact matches automatically
        if (exactMatches.length > 0) {
            this.storeExactMatches(exactMatches);
        }
        
        // Update validation counts after DOM is rendered
        setTimeout(() => this.updateRosterValidation(), 100);
    }

    getComparisonIndicator(matchInfo) {
        switch (matchInfo.type) {
            case 'exact':
                return '✅';
            case 'approximate':
                const percentage = Math.round(matchInfo.similarity * 100);
                return `🔶 ${percentage}%`;
            case 'none':
            default:
                return '❌';
        }
    }

    calculateMatchStatistics(sortedCharacters, friendliesMap, rosterPlayers) {
        // Count logs players (simple - from the data we have)
        const logsCount = sortedCharacters.length;
        
        // Count from UI what we actually see
        let rosterCount = 0;
        let noMatches = 0;
        let partialMatches = 0;
        
        // Get all comparison rows (excluding the unmatched section at bottom)
        const comparisonRows = document.querySelectorAll('.character-comparison-row:not(.unmatched)');
        
        comparisonRows.forEach(row => {
            const indicator = row.querySelector('.comparison-indicator');
            const rosterCell = row.querySelector('.roster-character .roster-name-black, .roster-character .roster-name');
            
            if (indicator && rosterCell) {
                const indicatorText = indicator.textContent.trim();
                const rosterText = rosterCell.textContent.trim();
                
                // Count roster names (anything that's not "No match" or empty)
                if (rosterText && rosterText !== 'No match' && rosterText !== '-') {
                    rosterCount++;
                }
                
                // Count match types based on indicator
                if (indicatorText.includes('🔶') && indicatorText.includes('%')) {
                    partialMatches++;
                } else if (indicatorText === '❌') {
                    noMatches++;
                }
            }
        });
        
        return {
            logsCount,
            rosterCount,
            noMatches,
            partialMatches
        };
    }

    generateValidationHeader(logsCount, rosterCount, matchStats) {
        // Check if counts match
        const countsMatch = matchStats.logsCount === matchStats.rosterCount;
        
        // Check if problems are resolved
        const noProblems = matchStats.noMatches === 0 && matchStats.partialMatches === 0;
        
        // Perfect when both conditions are met
        const isPerfect = countsMatch && noProblems;
        
        const headerClass = isPerfect ? 'comparison-header perfect' : 'comparison-header';
        
        return `
            <div class="${headerClass}">
                <div class="comparison-title">
                    <h3>📋 Roster Validation ${isPerfect ? '✅' : ''}</h3>
                    <div class="validation-counts">
                        <div class="count-group">
                            <span class="count-label">Names in wow logs</span>
                            <span class="count-number ${countsMatch ? 'green' : ''}">${matchStats.logsCount}</span>
                        </div>
                        <div class="count-group">
                            <span class="count-label">Names in roster</span>
                            <span class="count-number ${countsMatch ? 'green' : ''}">${matchStats.rosterCount}</span>
                        </div>
                        <div class="count-group">
                            <span class="count-label">No match</span>
                            <span class="count-number ${matchStats.noMatches === 0 ? 'green' : 'red'}">${matchStats.noMatches}</span>
                        </div>
                        <div class="count-group">
                            <span class="count-label">Partial match</span>
                            <span class="count-number ${matchStats.partialMatches === 0 ? 'green' : 'orange'}">${matchStats.partialMatches}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    updateRosterValidation() {
        if (!this.currentComparisonContainer || !this.currentSortedCharacters || !this.currentRosterPlayers) {
            return;
        }
        
        // Recalculate statistics
        const matchStats = this.calculateMatchStatistics(
            this.currentSortedCharacters, 
            this.currentFriendliesMap, 
            this.currentRosterPlayers
        );
        
        // Update header
        const newHeader = this.generateValidationHeader(null, null, matchStats);
        
        // Find and replace the current header
        const currentHeader = this.currentComparisonContainer.querySelector('.comparison-header');
        if (currentHeader) {
            currentHeader.outerHTML = newHeader;
        }
        
        console.log('📊 Roster validation updated:', matchStats);
    }

    applyConfirmedPlayers(sortedCharacters, rosterPlayers, confirmedPlayers) {
        if (!confirmedPlayers || confirmedPlayers.length === 0) {
            return [];
        }

        console.log('🔄 Applying confirmed players:', confirmedPlayers);
        const restoredPlayers = [];

        confirmedPlayers.forEach(confirmed => {
            // Find the character in logs that matches this confirmed player
            const logsCharacter = sortedCharacters.find(char => 
                char.name && char.name.toLowerCase() === confirmed.character_name.toLowerCase()
            );

            if (logsCharacter) {
                // Find if there's a roster player with this Discord ID
                const rosterPlayerIndex = rosterPlayers.findIndex(roster => 
                    roster.discordId === confirmed.discord_id
                );

                if (rosterPlayerIndex !== -1) {
                    // Update the roster player to match the logs character
                    rosterPlayers[rosterPlayerIndex] = {
                        ...rosterPlayers[rosterPlayerIndex],
                        name: confirmed.character_name,
                        class: confirmed.character_class
                    };

                    restoredPlayers.push({
                        originalName: rosterPlayers[rosterPlayerIndex].name,
                        logsName: confirmed.character_name,
                        characterClass: confirmed.character_class,
                        discordId: confirmed.discord_id
                    });
                } else {
                    // Add new roster player for this confirmed match
                    rosterPlayers.push({
                        name: confirmed.character_name,
                        class: confirmed.character_class,
                        discordId: confirmed.discord_id
                    });

                    restoredPlayers.push({
                        originalName: null,
                        logsName: confirmed.character_name,
                        characterClass: confirmed.character_class,
                        discordId: confirmed.discord_id
                    });
                }
            }
        });

        console.log('✅ Restored players:', restoredPlayers);
        return restoredPlayers;
    }

    generateRestorationMessage(restoredPlayers) {
        const playerList = restoredPlayers.map(player => 
            `<span class="restored-player ${this.getClassBackgroundClass(player.characterClass)}">
                <span class="character-name-black">${player.logsName}</span>
            </span>`
        ).join('');

        return `
            <div class="restoration-message">
                <div class="restoration-header">
                    <h4>🔄 Previously Confirmed Players Restored</h4>
                    <button id="resetRosterBtn" class="btn-reset">Reset to Original</button>
                </div>
                <div class="restoration-content">
                    <p>The following ${restoredPlayers.length} player(s) were automatically matched from previous confirmations:</p>
                    <div class="restored-players-list">
                        ${playerList}
                    </div>
                </div>
            </div>
        `;
    }

    async resetRosterToOriginal() {
        try {
            // Get active event session
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                alert('No active event session found');
                return;
            }

            // Clear confirmed players from database
            const response = await fetch(`/api/confirmed-logs/${activeEventSession}/players`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to clear confirmed players');
            }

            const result = await response.json();
            console.log('✅ Cleared confirmed players:', result);

            // Restore original data
            this.currentRosterPlayers = JSON.parse(JSON.stringify(this.originalRosterPlayers));
            this.currentSortedCharacters = JSON.parse(JSON.stringify(this.originalSortedCharacters));
            this.currentFriendliesMap = JSON.parse(JSON.stringify(this.originalFriendliesMap));

            // Re-render the comparison without confirmed players
            this.displayCharacterComparison(
                this.currentSortedCharacters, 
                this.currentFriendliesMap, 
                { raidDrop: this.originalRosterPlayers }, 
                this.currentComparisonContainer, 
                []
            );

            console.log('✅ Roster reset to original state');

        } catch (error) {
            console.error('❌ Error resetting roster:', error);
            alert('Failed to reset roster: ' + error.message);
        }
    }

    attachRosterNameClickListeners() {
        // Find all clickable roster names
        const clickableNames = document.querySelectorAll('.roster-name-clickable');
        
        clickableNames.forEach(nameElement => {
            nameElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showRosterEditDropdown(nameElement);
            });
        });
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.roster-edit-dropdown')) {
                this.closeRosterEditDropdown();
            }
        });
    }

    attachResetButtonListener() {
        const resetBtn = document.getElementById('resetRosterBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Are you sure you want to reset the roster to its original state? This will clear all confirmed matches.')) {
                    this.resetRosterToOriginal();
                }
            });
        }
    }

    showRosterEditDropdown(nameElement) {
        // Close any existing dropdown first
        this.closeRosterEditDropdown();
        
        const rowId = nameElement.dataset.rowId;
        const logsName = nameElement.dataset.logsName;
        const logsClass = nameElement.dataset.logsClass;
        
        // Get current roster player data if any
        const currentRosterName = nameElement.textContent.trim();
        const isNoMatch = currentRosterName === 'No match';
        
        // Check if there are unmatched players available
        const hasUnmatchedPlayers = this.checkForUnmatchedPlayers();
        
        // Create dropdown menu with appropriate options
        let dropdownOptions = '';
        
        // Only show "Match with logs name" if there's an actual roster name (not "No match")
        if (!isNoMatch) {
            dropdownOptions += `
                <div class="dropdown-option" data-action="match-logs" data-row-id="${rowId}" data-logs-name="${logsName}" data-logs-class="${logsClass}">
                    <i class="fas fa-check"></i> Match with logs name
                </div>
            `;
        }
        
        // Show "Insert unmatched" only if there are unmatched players available
        if (hasUnmatchedPlayers) {
            dropdownOptions += `
                <div class="dropdown-option" data-action="insert-unmatched" data-row-id="${rowId}" data-logs-name="${logsName}" data-logs-class="${logsClass}">
                    <i class="fas fa-user-plus"></i> Insert unmatched
                    <i class="fas fa-chevron-right dropdown-arrow"></i>
                </div>
            `;
        }
        
        // Always show "Insert from database" and "Add new character"
        dropdownOptions += `
            <div class="dropdown-option" data-action="search-database" data-row-id="${rowId}" data-logs-name="${logsName}" data-logs-class="${logsClass}">
                <i class="fas fa-search"></i> Insert from database
            </div>
            <div class="dropdown-option" data-action="add-character" data-row-id="${rowId}" data-logs-name="${logsName}" data-logs-class="${logsClass}">
                <i class="fas fa-user-plus"></i> Add new character
            </div>
        `;
        
        const dropdown = document.createElement('div');
        dropdown.className = 'roster-edit-dropdown';
        dropdown.innerHTML = `<div class="roster-edit-options">${dropdownOptions}</div>`;
        
        // Position dropdown relative to the clicked element
        const rect = nameElement.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.zIndex = '1000';
        
        document.body.appendChild(dropdown);
        this.currentDropdown = dropdown;
        
        // Add event listeners to dropdown options
        this.attachDropdownOptionListeners(dropdown);
    }

    closeRosterEditDropdown() {
        if (this.currentDropdown) {
            document.body.removeChild(this.currentDropdown);
            this.currentDropdown = null;
        }
        
        // Also close any submenu that might be open
        this.closeUnmatchedSubmenu();
    }

    attachDropdownOptionListeners(dropdown) {
        const options = dropdown.querySelectorAll('.dropdown-option');
        
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = option.dataset.action;
                const rowId = option.dataset.rowId;
                const logsName = option.dataset.logsName;
                const logsClass = option.dataset.logsClass;
                
                switch (action) {
                    case 'match-logs':
                        this.handleMatchWithLogs(rowId, logsName, logsClass);
                        break;
                    case 'insert-unmatched':
                        this.showUnmatchedSubmenu(option, rowId, logsName, logsClass);
                        break;
                    case 'search-database':
                        this.showPlayerSearchModal(rowId, logsName, logsClass);
                        break;
                    case 'add-character':
                        this.showAddCharacterModal(rowId, logsName, logsClass);
                        break;
                }
            });
        });
    }

    async handleMatchWithLogs(rowId, logsName, logsClass) {
        try {
            // Find the current roster player in this row
            const row = document.getElementById(rowId);
            const rosterNameElement = row.querySelector('.roster-name-black, .roster-name');
            const currentRosterName = rosterNameElement.textContent.trim();
            
            // Find the roster player data
            const rosterPlayer = this.currentRosterPlayers.find(p => p.name === currentRosterName);
            
            if (!rosterPlayer || !rosterPlayer.discordId) {
                alert('Cannot match: No Discord ID found for this roster player.');
                this.closeRosterEditDropdown();
                return;
            }
            
            // Store the confirmed player
            await this.storeConfirmedPlayer(rosterPlayer.discordId, logsName, logsClass);
            
            // Update the UI to show the match
            this.updateRowToMatched(rowId, logsName, logsClass, rosterPlayer.discordId);
            
            this.closeRosterEditDropdown();
            
        } catch (error) {
            console.error('Error matching with logs name:', error);
            alert('Failed to match with logs name. Please try again.');
            this.closeRosterEditDropdown();
        }
    }

    showUnmatchedSubmenu(parentOption, rowId, logsName, logsClass) {
        // Close any existing submenu
        this.closeUnmatchedSubmenu();
        
        // Get the logs character names to compare against
        const logsCharacterNames = new Set(this.currentSortedCharacters.map(char => char.name || 'Unknown'));
        
        // Get players already assigned/matched in the UI
        const alreadyAssignedDiscordIds = new Set();
        document.querySelectorAll('[data-discord-id]').forEach(el => {
            const discordId = el.dataset.discordId;
            if (discordId) {
                alreadyAssignedDiscordIds.add(discordId);
            }
        });
        
        // Find truly unmatched players: in roster but NOT in logs AND not already assigned
        const unmatchedPlayers = this.currentRosterPlayers.filter(player => {
            if (!player.discordId) return false; // Skip players without Discord ID
            if (alreadyAssignedDiscordIds.has(player.discordId)) return false; // Skip already assigned
            
            // Check if this roster player appears in the logs data
            const playerInLogs = logsCharacterNames.has(player.name);
            return !playerInLogs; // Only include if NOT in logs (truly unmatched)
        });
        
        if (unmatchedPlayers.length === 0) {
            alert('No unmatched roster players available. All roster players either appear in the logs or have been assigned.');
            return;
        }
        
        // Create submenu
        const submenu = document.createElement('div');
        submenu.className = 'unmatched-submenu';
        
        let submenuHtml = '<div class="submenu-header">Select unmatched player:</div>';
        unmatchedPlayers.forEach(player => {
            const classBackgroundClass = this.getClassBackgroundClass(player.class);
            submenuHtml += `
                <div class="submenu-option ${classBackgroundClass}" 
                     data-discord-id="${player.discordId}" 
                     data-original-name="${player.name}" 
                     data-original-class="${player.class}"
                     data-target-name="${logsName}"
                     data-target-class="${logsClass}"
                     data-row-id="${rowId}">
                    <span class="character-name-black">${player.name}</span>
                </div>
            `;
        });
        
        submenu.innerHTML = submenuHtml;
        
        // Position submenu next to parent option
        const rect = parentOption.getBoundingClientRect();
        submenu.style.position = 'absolute';
        submenu.style.top = `${rect.top + window.scrollY}px`;
        submenu.style.left = `${rect.right + window.scrollX + 5}px`;
        submenu.style.zIndex = '1001';
        
        document.body.appendChild(submenu);
        this.currentSubmenu = submenu;
        
        // Add click listeners to submenu options
        submenu.querySelectorAll('.submenu-option').forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.handleInsertUnmatched(option);
            });
        });
    }

    closeUnmatchedSubmenu() {
        if (this.currentSubmenu) {
            document.body.removeChild(this.currentSubmenu);
            this.currentSubmenu = null;
        }
    }

    checkForUnmatchedPlayers() {
        if (!this.currentRosterPlayers || !this.currentSortedCharacters) {
            return false;
        }
        
        // Get the logs character names to compare against
        const logsCharacterNames = new Set(this.currentSortedCharacters.map(char => char.name || 'Unknown'));
        
        // Get players already assigned/matched in the UI
        const alreadyAssignedDiscordIds = new Set();
        document.querySelectorAll('[data-discord-id]').forEach(el => {
            const discordId = el.dataset.discordId;
            if (discordId) {
                alreadyAssignedDiscordIds.add(discordId);
            }
        });
        
        // Check if there are any truly unmatched players
        const unmatchedPlayers = this.currentRosterPlayers.filter(player => {
            if (!player.discordId) return false; // Skip players without Discord ID
            if (alreadyAssignedDiscordIds.has(player.discordId)) return false; // Skip already assigned
            
            // Check if this roster player appears in the logs data
            const playerInLogs = logsCharacterNames.has(player.name);
            return !playerInLogs; // Only include if NOT in logs (truly unmatched)
        });
        
        return unmatchedPlayers.length > 0;
    }

    async handleInsertUnmatched(option) {
        try {
            const discordId = option.dataset.discordId;
            const targetName = option.dataset.targetName;
            const targetClass = option.dataset.targetClass;
            const rowId = option.dataset.rowId;
            
            // Store the confirmed player with the logs name and class
            await this.storeConfirmedPlayer(discordId, targetName, targetClass);
            
            // Update the UI
            this.updateRowToMatched(rowId, targetName, targetClass, discordId);
            
            this.closeRosterEditDropdown();
            
        } catch (error) {
            console.error('Error inserting unmatched player:', error);
            alert('Failed to insert unmatched player. Please try again.');
            this.closeRosterEditDropdown();
        }
    }

    async storeConfirmedPlayer(discordId, characterName, characterClass) {
        const activeEventSession = localStorage.getItem('activeEventSession');
        
        if (!activeEventSession) {
            throw new Error('No active event session found');
        }
        
        const response = await fetch(`/api/confirmed-logs/${activeEventSession}/player`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                discordId: discordId,
                characterName: characterName,
                characterClass: characterClass
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to store confirmed player');
        }
        
        console.log(`✅ Stored confirmed player: ${characterName} (${characterClass}) - Discord: ${discordId}`);
    }

    async storeExactMatches(exactMatches) {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                console.warn('No active event session found for storing exact matches');
                return;
            }
            
            console.log(`📝 Storing ${exactMatches.length} exact matches automatically...`);
            
            const response = await fetch(`/api/confirmed-logs/${activeEventSession}/players/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    players: exactMatches
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to store exact matches: ${response.status}`);
            }
            
            const result = await response.json();
            console.log(`✅ Automatically stored ${result.inserted} exact matches`);
            
        } catch (error) {
            console.error('❌ Error storing exact matches:', error);
            // Don't throw - this is a background operation that shouldn't break the UI
        }
    }

    updateRowToMatched(rowId, characterName, characterClass, discordId) {
        const row = document.getElementById(rowId);
        if (!row) return;
        
        // Update the roster character cell
        const rosterCharacterDiv = row.querySelector('.roster-character');
        const classBackgroundClass = this.getClassBackgroundClass(characterClass);
        
        rosterCharacterDiv.className = `roster-character ${classBackgroundClass}`;
        rosterCharacterDiv.innerHTML = `
            <span class="roster-name-black exact" data-discord-id="${discordId}">
                ${characterName}
            </span>
        `;
        
        // Update the comparison indicator
        const indicatorDiv = row.querySelector('.comparison-indicator');
        indicatorDiv.innerHTML = '✅';
        
        // Remove the row from unmatched class if it has it
        row.classList.remove('unmatched');
        
        console.log(`✅ Updated row ${rowId} to show confirmed match: ${characterName}`);
        
        // Update roster validation in real-time
        setTimeout(() => this.updateRosterValidation(), 100);
    }

    showPlayerSearchModal(rowId, logsName, logsClass) {
        this.closeRosterEditDropdown();
        
        // Store current context for later use
        this.currentSearchContext = { rowId, logsName, logsClass };
        
        // Create player search modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'logs-player-search-overlay';
        overlay.innerHTML = `
            <div class="logs-player-search-modal">
                <div class="logs-player-search-header">
                    <h3>Search for Player</h3>
                    <button class="logs-player-search-close">&times;</button>
                </div>
                <input type="text" id="logs-player-search-input" class="logs-player-search-input" 
                       placeholder="Type player name (min 2 characters)..." autocomplete="off">
                <div id="logs-player-search-results" class="logs-player-search-results">
                    <div class="logs-player-search-no-results">Type at least 2 characters to search</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.currentSearchModal = overlay;
        
        // Focus the input
        const input = overlay.querySelector('#logs-player-search-input');
        setTimeout(() => input.focus(), 100);
        
        // Add event listeners
        this.setupSearchModalListeners(overlay);
    }

    setupSearchModalListeners(overlay) {
        const closeBtn = overlay.querySelector('.logs-player-search-close');
        const input = overlay.querySelector('#logs-player-search-input');
        
        // Close modal events
        closeBtn.addEventListener('click', () => this.closePlayerSearchModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closePlayerSearchModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentSearchModal) this.closePlayerSearchModal();
        });
        
        // Search on input with debouncing
        let searchTimeout;
        input.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchPlayersInDatabase(e.target.value.trim());
            }, 300);
        });
    }

    closePlayerSearchModal() {
        if (this.currentSearchModal) {
            document.body.removeChild(this.currentSearchModal);
            this.currentSearchModal = null;
            this.currentSearchContext = null;
        }
    }

    async searchPlayersInDatabase(query) {
        const resultsContainer = document.getElementById('logs-player-search-results');
        
        if (query.length < 2) {
            resultsContainer.innerHTML = '<div class="logs-player-search-no-results">Type at least 2 characters to search</div>';
            return;
        }
        
        try {
            resultsContainer.innerHTML = '<div class="logs-player-search-no-results">Searching...</div>';
            
            const response = await fetch(`/api/search-players?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }
            
            const players = await response.json();
            
            if (players.length === 0) {
                resultsContainer.innerHTML = '<div class="logs-player-search-no-results">No players found</div>';
                return;
            }
            
            // Display search results with class colors
            let resultsHtml = '';
            players.forEach(player => {
                const classBackgroundClass = this.getClassBackgroundClass(player.class);
                resultsHtml += `
                    <div class="logs-player-search-item ${classBackgroundClass}" 
                         data-discord-id="${player.discord_id}" 
                         data-character-name="${player.character_name}" 
                         data-class="${player.class}">
                        <div class="logs-player-search-item-name character-name-black">${player.character_name}</div>
                        <div class="logs-player-search-item-class character-name-black">${player.class}</div>
                    </div>
                `;
            });
            
            resultsContainer.innerHTML = resultsHtml;
            
            // Add click listeners to results
            resultsContainer.querySelectorAll('.logs-player-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectPlayerFromDatabase(
                        item.dataset.discordId,
                        item.dataset.characterName,
                        item.dataset.class
                    );
                });
            });
            
        } catch (error) {
            console.error('Error searching players:', error);
            resultsContainer.innerHTML = '<div class="logs-player-search-no-results">Error searching players</div>';
        }
    }

    async selectPlayerFromDatabase(discordId, characterName, characterClass) {
        if (!this.currentSearchContext) return;
        
        const { rowId, logsName, logsClass } = this.currentSearchContext;
        
        try {
            // Close the modal
            this.closePlayerSearchModal();
            
            // Store the confirmed player with the logs name and class (not the database character data)
            await this.storeConfirmedPlayer(discordId, logsName, logsClass);
            
            // Update the UI to show the confirmed match
            this.updateRowToMatched(rowId, logsName, logsClass, discordId);
            
        } catch (error) {
            console.error('Error selecting player from database:', error);
            alert('Failed to select player. Please try again.');
        }
    }

    showAddCharacterModal(rowId, logsName, logsClass) {
        this.closeRosterEditDropdown();
        
        // Store current context for later use
        this.currentAddCharacterContext = { rowId, logsName, logsClass };
        
        // Create add character modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'logs-add-character-overlay';
        overlay.innerHTML = `
            <div class="logs-add-character-modal">
                <div class="logs-add-character-header">
                    <h3>Add New Character</h3>
                    <button class="logs-add-character-close">&times;</button>
                </div>
                <div class="logs-add-character-content">
                    <div class="logs-form-group">
                        <label for="logs-discord-id">Discord ID</label>
                        <input type="text" id="logs-discord-id" class="logs-form-input" 
                               placeholder="Enter Discord ID (required)" required>
                    </div>
                    <div class="logs-form-group">
                        <label for="logs-character-name">Character Name</label>
                        <input type="text" id="logs-character-name" class="logs-form-input" 
                               value="${logsName}" placeholder="Character name">
                    </div>
                    <div class="logs-form-group">
                        <label for="logs-character-class">Character Class</label>
                        <select id="logs-character-class" class="logs-form-input">
                            <option value="Warrior" ${logsClass === 'Warrior' ? 'selected' : ''}>Warrior</option>
                            <option value="Paladin" ${logsClass === 'Paladin' ? 'selected' : ''}>Paladin</option>
                            <option value="Hunter" ${logsClass === 'Hunter' ? 'selected' : ''}>Hunter</option>
                            <option value="Rogue" ${logsClass === 'Rogue' ? 'selected' : ''}>Rogue</option>
                            <option value="Priest" ${logsClass === 'Priest' ? 'selected' : ''}>Priest</option>
                            <option value="Shaman" ${logsClass === 'Shaman' ? 'selected' : ''}>Shaman</option>
                            <option value="Mage" ${logsClass === 'Mage' ? 'selected' : ''}>Mage</option>
                            <option value="Warlock" ${logsClass === 'Warlock' ? 'selected' : ''}>Warlock</option>
                            <option value="Druid" ${logsClass === 'Druid' ? 'selected' : ''}>Druid</option>
                        </select>
                    </div>
                    <div class="logs-form-buttons">
                        <button id="logs-add-character-cancel" class="logs-btn logs-btn-secondary">Cancel</button>
                        <button id="logs-add-character-submit" class="logs-btn logs-btn-primary">Add Character</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.currentAddCharacterModal = overlay;
        
        // Focus the Discord ID input
        const discordInput = overlay.querySelector('#logs-discord-id');
        setTimeout(() => discordInput.focus(), 100);
        
        // Add event listeners
        this.setupAddCharacterModalListeners(overlay);
    }

    setupAddCharacterModalListeners(overlay) {
        const closeBtn = overlay.querySelector('.logs-add-character-close');
        const cancelBtn = overlay.querySelector('#logs-add-character-cancel');
        const submitBtn = overlay.querySelector('#logs-add-character-submit');
        
        // Close modal events
        closeBtn.addEventListener('click', () => this.closeAddCharacterModal());
        cancelBtn.addEventListener('click', () => this.closeAddCharacterModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeAddCharacterModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentAddCharacterModal) this.closeAddCharacterModal();
        });
        
        // Submit form
        submitBtn.addEventListener('click', () => this.handleAddCharacterSubmit());
        
        // Submit on Enter key in any input
        overlay.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleAddCharacterSubmit();
            });
        });
    }

    closeAddCharacterModal() {
        if (this.currentAddCharacterModal) {
            document.body.removeChild(this.currentAddCharacterModal);
            this.currentAddCharacterModal = null;
            this.currentAddCharacterContext = null;
        }
    }

    async handleAddCharacterSubmit() {
        if (!this.currentAddCharacterContext) return;
        
        const { rowId, logsName, logsClass } = this.currentAddCharacterContext;
        
        // Get form values
        const discordId = document.getElementById('logs-discord-id').value.trim();
        const characterName = document.getElementById('logs-character-name').value.trim();
        const characterClass = document.getElementById('logs-character-class').value;
        
        // Validate inputs
        if (!discordId) {
            alert('Discord ID is required');
            return;
        }
        
        if (!characterName) {
            alert('Character name is required');
            return;
        }
        
        try {
            // First, add the character to the database
            const response = await fetch('/api/add-character', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    discordId: discordId,
                    characterName: characterName,
                    characterClass: characterClass
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                if (response.status === 409) {
                    // Character already exists
                    const proceed = confirm(`Character "${characterName}" (${characterClass}) already exists in the database. Do you want to proceed with confirming this player for the logs?`);
                    if (!proceed) return;
                } else {
                    throw new Error(error.message || 'Failed to add character');
                }
            }
            
            // Close the modal
            this.closeAddCharacterModal();
            
            // Store the confirmed player (use the logs name/class as the confirmed data)
            await this.storeConfirmedPlayer(discordId, logsName, logsClass);
            
            // Update the UI to show the confirmed match
            this.updateRowToMatched(rowId, logsName, logsClass, discordId);
            
        } catch (error) {
            console.error('Error adding character:', error);
            alert('Failed to add character. Please try again.');
        }
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