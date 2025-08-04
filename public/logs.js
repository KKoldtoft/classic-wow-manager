// WoW Logs Analysis JavaScript

class WoWLogsAnalyzer {
    constructor() {
        this.apiKey = 'e5c41ab0436b3a44c0e9c2fbd6cf016d';
        this.baseUrl = 'https://vanilla.warcraftlogs.com:443/v1/';
        this.currentLogData = null;
        
        // Use our backend proxy endpoint instead of direct Google Apps Script call
        this.rpbApiUrl = '/api/logs/rpb';
        

        
        this.initializeEventListeners();
        
        // Check for stored log data on page load
        this.checkForStoredLogData();
    }

    async checkForStoredLogData() {
        const activeEventSession = localStorage.getItem('activeEventSession');
        if (!activeEventSession) {
            console.log('📄 [STORED DATA] No active event session, skipping stored data check');
            return;
        }

        console.log(`📄 [STORED DATA] Checking for stored log data for event: ${activeEventSession}`);
        
        try {
            const response = await fetch(`/api/log-data/${activeEventSession}`);
            const result = await response.json();
            
            if (result.success && result.hasData && result.data.length > 0) {
                console.log(`✅ [STORED DATA] Found stored data for ${result.data.length} players`);
                try {
                    await this.displayStoredLogData(result.data);
                    // Also check RPB status after displaying stored data
                    await this.checkRPBStatus();
                } catch (displayError) {
                    console.error('❌ [STORED DATA] Error displaying stored data:', displayError);
                    console.log('📄 [STORED DATA] Falling back to blank page');
                }
            } else {
                console.log('📄 [STORED DATA] No stored data found, showing blank page');
                // Still check RPB status even if no stored data
                await this.checkRPBStatus();
            }
            
            // Pre-fill workflow input field with existing log URL if available
            await this.preFillWorkflowLogUrl();
            
        } catch (error) {
            console.error('❌ [STORED DATA] Error checking for stored data:', error);
        }
    }

    async checkRPBStatus() {
        const activeEventSession = localStorage.getItem('activeEventSession');
        if (!activeEventSession) {
            console.log('📊 [RPB STATUS] No active event session, skipping RPB status check');
            return;
        }

        try {
            console.log(`📊 [RPB STATUS] Checking RPB status for event: ${activeEventSession}`);
            const response = await fetch(`/api/rpb-tracking/${activeEventSession}`);
            const result = await response.json();
            
            if (result.success && result.hasRPB) {
                console.log(`📊 [RPB STATUS] Found RPB status: ${result.status}`);
                this.displayRPBStatus(result);
            } else {
                console.log('📊 [RPB STATUS] No RPB tracking found for this event');
            }
        } catch (error) {
            console.error('❌ [RPB STATUS] Error checking RPB status:', error);
        }
    }

    async preFillWorkflowLogUrl() {
        const activeEventSession = localStorage.getItem('activeEventSession');
        if (!activeEventSession) {
            console.log('🔗 [PRE-FILL] No active event session, skipping workflow URL pre-fill');
            return;
        }

        try {
            console.log(`🔗 [PRE-FILL] Checking for existing log URL for event: ${activeEventSession}`);
            
            // Try RPB tracking table first (has full log_url)
            const rpbResponse = await fetch(`/api/rpb-tracking/${activeEventSession}`);
            const rpbResult = await rpbResponse.json();
            
            let logUrl = null;
            
            if (rpbResult.success && rpbResult.hasRPB && rpbResult.logUrl) {
                logUrl = rpbResult.logUrl;
                console.log(`✅ [PRE-FILL] Found log URL from RPB tracking: ${logUrl}`);
            } else {
                // Fallback: try log_data table (has log_id, need to construct URL)
                const logDataResponse = await fetch(`/api/log-data/${activeEventSession}`);
                const logDataResult = await logDataResponse.json();
                
                if (logDataResult.success && logDataResult.hasData && logDataResult.data && logDataResult.data.length > 0) {
                    const logId = logDataResult.data[0]?.log_id;
                    if (logId) {
                        logUrl = `https://classic.warcraftlogs.com/reports/${logId}`;
                        console.log(`✅ [PRE-FILL] Constructed log URL from log_data: ${logUrl}`);
                    }
                }
            }
            
            // Pre-fill the workflow input field if we found a URL
            if (logUrl) {
                const workflowInput = document.getElementById('workflowLogInput');
                if (workflowInput && !workflowInput.value) {
                    workflowInput.value = logUrl;
                    console.log(`🔗 [PRE-FILL] Pre-filled workflow input with: ${logUrl}`);
                }
            } else {
                console.log('🔗 [PRE-FILL] No existing log URL found for this event');
            }
            
        } catch (error) {
            console.error('❌ [PRE-FILL] Error pre-filling workflow log URL:', error);
        }
    }

    displayRPBStatus(rpbData) {
        const inputSection = document.querySelector('.logs-input-section');
        const rpbBtn = document.getElementById('runRpbBtn');
        
        // Create or update RPB status display
        let statusDiv = document.getElementById('rpbStatusDisplay');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'rpbStatusDisplay';
            statusDiv.className = 'rpb-status-display';
            inputSection.appendChild(statusDiv);
        }

        let statusHTML = '';

        if (rpbData.status === 'completed') {
            // RPB is completed
            statusHTML = `
                <div class="rpb-status-completed">
                    <div class="status-header">
                        <h3>✅ RPB Analysis Completed</h3>
                        <p>Analysis was completed on ${new Date(rpbData.completedAt).toLocaleString()}</p>
                    </div>
                    <div class="status-actions">
                        ${rpbData.archiveUrl ? `
                            <a href="${rpbData.archiveUrl}" target="_blank" class="btn btn-success">
                                🗂️ View Archived Copy (${rpbData.archiveName})
                            </a>
                        ` : `
                            <button onclick="wowLogsAnalyzer.archiveRPBResults()" class="btn btn-success">
                                📁 Create Archive
                            </button>
                        `}
                    </div>
                </div>
            `;
            
        } else if (rpbData.status === 'processing') {
            // RPB is currently processing
            statusHTML = `
                <div class="rpb-status-processing">
                    <div class="status-header">
                        <h3>⏳ RPB Analysis In Progress</h3>
                        <p>Please wait while the analysis is being processed...</p>
                    </div>
                    <div class="processing-spinner">
                        <div class="spinner"></div>
                    </div>
                </div>
            `;
            
            // Poll for status updates
            setTimeout(() => this.checkRPBStatus(), 5000);
            
        } else if (rpbData.status === 'error') {
            // RPB failed
            statusHTML = `
                <div class="rpb-status-error">
                    <div class="status-header">
                        <h3>❌ RPB Analysis Failed</h3>
                        <p>There was an error processing the analysis. You can try running it again.</p>
                    </div>
                    <div class="status-actions">
                        <button onclick="wowLogsAnalyzer.runNewRPBAnalysis()" class="btn btn-primary">
                            🔄 Try Again
                        </button>
                    </div>
                </div>
            `;
            
            // Show the original RPB button as backup
            if (rpbBtn) rpbBtn.style.display = 'inline-block';
        }

        statusDiv.innerHTML = statusHTML;
    }

    async displayStoredLogData(storedData) {
        console.log(`🎨 [STORED DATA] Displaying stored log data for ${storedData.length} players`);
        
        // Fetch roster data for proper role detection
        try {
            const rosterDataForSpecs = await this.fetchRosterData();
            this.currentRosterPlayers = rosterDataForSpecs?.raidDrop || [];
            console.log(`📋 [STORED DATA] Loaded ${this.currentRosterPlayers.length} roster players for role detection`);
        } catch (error) {
            console.warn('⚠️ [STORED DATA] Could not fetch roster data:', error);
            this.currentRosterPlayers = [];
        }
        
        // Convert stored data to expected format
        const damageEntries = storedData
            .filter(player => player.damage_amount > 0)
            .map(player => ({
                name: player.character_name,
                total: parseInt(player.damage_amount),
                type: player.character_class,
                icon: player.character_class
            }))
            .sort((a, b) => b.total - a.total);

        const healingEntries = storedData
            .filter(player => player.healing_amount > 0)
            .map(player => ({
                name: player.character_name,
                total: parseInt(player.healing_amount),
                type: player.character_class,
                icon: player.character_class
            }))
            .sort((a, b) => b.total - a.total);

        // Create role map from stored data
        const roleMap = {};
        storedData.forEach(player => {
            if (player.discord_id && player.role_detected) {
                roleMap[player.discord_id] = {
                    role: player.role_detected,
                    source: player.role_source || 'unknown',
                    specName: player.spec_name || 'Unknown',
                    isConfirmed: true
                };
            }
        });

        // Simulate the current data structure
        this.currentLogData = {
            logId: storedData[0]?.log_id || 'stored',
            damage: { entries: damageEntries },
            healing: { entries: healingEntries },
            roleMap: roleMap
        };
        
        console.log(`📊 [STORED DATA] Created data structure:`);
        console.log(`   └─ Damage entries: ${damageEntries.length}`);
        console.log(`   └─ Healing entries: ${healingEntries.length}`);
        console.log(`   └─ Role mappings: ${Object.keys(roleMap).length}`);

        // Show the data sections
        console.log('🎯 [STORED DATA] Calling showData()');
        this.showData();
        
        // Display characters, damage and healing data (adapted for stored data)
        console.log('🎯 [STORED DATA] Calling displayCharactersData()');
        try {
            await this.displayCharactersData();
            console.log('✅ [STORED DATA] Characters displayed successfully');
        } catch (error) {
            console.error('❌ [STORED DATA] Error displaying characters:', error);
        }
        
        console.log('🎯 [STORED DATA] Calling displayDamageData()');
        console.log('🔍 [DEBUG] Current data structure:', this.currentLogData);
        console.log('🔍 [DEBUG] Role map keys:', Object.keys(this.currentLogData.roleMap));
        try {
            this.displayDamageData();
            console.log('✅ [STORED DATA] Damage data displayed successfully');
        } catch (error) {
            console.error('❌ [STORED DATA] Error displaying damage data:', error);
            console.error('❌ [STORED DATA] Error stack:', error.stack);
        }
        
        console.log('🎯 [STORED DATA] Calling displayHealingData()');
        try {
            this.displayHealingData();
            console.log('✅ [STORED DATA] Healing data displayed successfully');
        } catch (error) {
            console.error('❌ [STORED DATA] Error displaying healing data:', error);
            console.error('❌ [STORED DATA] Error stack:', error.stack);
        }
        
        // Hide unwanted sections
        console.log('🎯 [STORED DATA] Hiding Fight Data and Raid Summary panels');
        this.hideFightDataPanel();
        this.hideSummaryPanel();
        
        console.log('✅ [STORED DATA] Successfully displayed stored data');
    }

    showStoredDataNotification() {
        const playerCount = (this.currentLogData.damage?.entries?.length || 0) + 
                           (this.currentLogData.healing?.entries?.length || 0);
        const uniquePlayers = new Set([
            ...(this.currentLogData.damage?.entries?.map(e => e.name) || []),
            ...(this.currentLogData.healing?.entries?.map(e => e.name) || [])
        ]).size;
        
        const notification = document.createElement('div');
        notification.className = 'stored-data-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">💾</span>
                <span class="notification-text">
                    Loaded stored log data for this event (${uniquePlayers} players) - 
                    Damage & Healing sections with role detection
                </span>
                <button class="btn-refresh-data" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Insert at the top of the log data container
        const container = document.querySelector('.log-data-container');
        if (container) {
            container.insertBefore(notification, container.firstChild);
        }
    }

    async storeLogDataToDatabase(logId, roleMap) {
        const activeEventSession = localStorage.getItem('activeEventSession');
        if (!activeEventSession) {
            console.log('💾 [STORE DATA] No active event session, skipping storage');
            return;
        }

        console.log(`💾 [STORE DATA] Storing log data for event: ${activeEventSession}`);

        try {
            // Prepare data for storage
            const logData = [];
            
            // Get all players from damage and healing data
            const allPlayers = new Map();
            
            // Add damage data
            if (this.currentLogData.damage?.entries) {
                this.currentLogData.damage.entries.forEach(entry => {
                    allPlayers.set(entry.name, {
                        characterName: entry.name,
                        characterClass: entry.type || 'Unknown',
                        damageAmount: entry.total || 0,
                        healingAmount: 0
                    });
                });
            }
            
            // Add healing data
            if (this.currentLogData.healing?.entries) {
                this.currentLogData.healing.entries.forEach(entry => {
                    if (allPlayers.has(entry.name)) {
                        allPlayers.get(entry.name).healingAmount = entry.total || 0;
                    } else {
                        allPlayers.set(entry.name, {
                            characterName: entry.name,
                            characterClass: entry.type || 'Unknown',
                            damageAmount: 0,
                            healingAmount: entry.total || 0
                        });
                    }
                });
            }
            
            // Get roster players for Discord ID mapping
            const rosterPlayers = this.currentRosterPlayers || [];
            
            // Convert to storage format
            allPlayers.forEach((playerData, playerName) => {
                // Find Discord ID via roster matching
                const rosterPlayer = rosterPlayers.find(p => 
                    p.name && p.name.toLowerCase() === playerName.toLowerCase()
                );
                
                // Get role information
                let roleDetected = null;
                let roleSource = null;
                let specName = null;
                let discordId = rosterPlayer?.discordId || null;
                
                if (discordId && roleMap[discordId]) {
                    const roleInfo = roleMap[discordId];
                    roleDetected = roleInfo.role;
                    roleSource = roleInfo.source;
                    specName = roleInfo.specName;
                }
                
                logData.push({
                    characterName: playerData.characterName,
                    characterClass: playerData.characterClass,
                    discordId: discordId,
                    roleDetected: roleDetected,
                    roleSource: roleSource,
                    specName: specName,
                    damageAmount: playerData.damageAmount,
                    healingAmount: playerData.healingAmount,
                    logId: logId
                });
            });
            
            console.log(`💾 [STORE DATA] Prepared ${logData.length} player records for storage`);
            
            // Send to backend
            const response = await fetch(`/api/log-data/${activeEventSession}/store`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ logData })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ [STORE DATA] Successfully stored log data: ${result.message}`);
            } else {
                console.error('❌ [STORE DATA] Failed to store log data:', result.message);
            }
            
        } catch (error) {
            console.error('❌ [STORE DATA] Error storing log data:', error);
        }
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

        // ====================================
        // UNIFIED WORKFLOW EVENT LISTENERS
        // ====================================

        // Complete workflow button click
        document.getElementById('runCompleteWorkflowBtn').addEventListener('click', () => {
            this.runCompleteWorkflow();
        });

        // Enter key in workflow input field
        document.getElementById('workflowLogInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.runCompleteWorkflow();
            }
        });

        // Retry workflow button
        document.getElementById('retryWorkflowBtn').addEventListener('click', () => {
            this.retryWorkflowFromFailedStep();
        });

        // Reset workflow button
        document.getElementById('resetWorkflowBtn').addEventListener('click', () => {
            this.resetWorkflow();
        });

        // ====================================
        // WORLD BUFFS EVENT LISTENERS
        // ====================================

        // World Buffs button click
        document.getElementById('runWorldBuffsBtn').addEventListener('click', () => {
            this.runWorldBuffsAnalysis();
        });

        // Enter key in World Buffs input field
        document.getElementById('worldBuffsLogInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.runWorldBuffsAnalysis();
            }
        });

        // ====================================
        // FROST RESISTANCE EVENT LISTENERS
        // ====================================

        // Frost Resistance button click
        document.getElementById('runFrostResBtn').addEventListener('click', () => {
            this.runFrostResAnalysis();
        });

        // Enter key in Frost Resistance input field
        document.getElementById('frostResLogInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.runFrostResAnalysis();
            }
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

    // Spec-to-role mapping for accurate role detection
    static HEALING_SPECS = [
        'Holy', 'Discipline',           // Priest
        'Restoration', 'Restoration1',  // Shaman & Druid
        'Holy1'                         // Paladin
    ];

    static TANK_SPECS = [
        'Protection', 'Protection1',    // Warrior & Paladin
        'Guardian', 'Bear'              // Druid
    ];

    // Everything else is considered DPS

    determineRoleFromSpec(specName, className, roleName) {
        // Primary: Use spec-based detection
        if (specName) {
            if (this.constructor.HEALING_SPECS.includes(specName)) {
                return 'healer';
            }
            if (this.constructor.TANK_SPECS.includes(specName)) {
                return 'tank';
            }
            // If spec exists but isn't healing or tank, it's DPS
            return 'dps';
        }

        // Fallback: Use roleName from Raid-Helper
        if (roleName === 'Tanks') {
            return 'tank';
        } else if (roleName === 'Healers') {
            return 'healer';
        } else if (roleName === 'Melee' || roleName === 'Ranged') {
            return 'dps';
        }

        // Final fallback: Assume DPS
        return 'dps';
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

    async fetchRosterData() {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            if (!activeEventSession) {
                console.warn('No active event session found for roster data');
                return null;
            }

            console.log('Fetching roster data for managed roster spec overrides:', activeEventSession);
            
            const response = await fetch(`/api/roster/${activeEventSession}`);

            if (!response.ok) {
                console.warn('Failed to fetch roster data, continuing without spec overrides');
                return null;
            }

            const data = await response.json();
            console.log('Roster data fetched for spec overrides:', data);
            return data;
        } catch (error) {
            console.error('Failed to fetch roster data for spec overrides:', error);
            return null;
        }
    }

    parseRaidHelperRoles(raidHelperData, rosterData = null) {
        if (!raidHelperData || !raidHelperData.signUps) {
            return {};
        }

        console.log('🔍 Parsing roles with spec-based detection...');
        const roleMap = {};
        
        // Check for large roster to reduce logging verbosity
        const isLargeRoster = raidHelperData.signUps && raidHelperData.signUps.length > 30;
        if (isLargeRoster) {
            console.log(`📊 Large roster detected (${raidHelperData.signUps.length} signups) - reducing log verbosity to prevent browser crashes`);
        }
        
        // Create a map for roster spec overrides if available
        const specOverrides = {};
        if (rosterData && rosterData.isManaged && rosterData.raidDrop) {
            console.log('📋 Processing managed roster spec overrides...');
            rosterData.raidDrop.forEach(player => {
                if (player && player.userid && player.spec) {
                    specOverrides[player.userid] = {
                        spec: player.spec,
                        className: player.class
                    };
                }
            });
            console.log('📋 Found spec overrides for', Object.keys(specOverrides).length, 'players');
        }
        
        raidHelperData.signUps.forEach(signup => {
            if (signup.status !== 'primary') return; // Only consider primary signups
            
            const userId = signup.userId;
            let specName = signup.specName;
            let className = signup.className;
            const roleName = signup.roleName;
            
            // Check for managed roster spec overrides
            if (specOverrides[userId]) {
                specName = specOverrides[userId].spec;
                className = specOverrides[userId].className;
                if (!isLargeRoster) {
                    console.log(`🔄 Using spec override for ${signup.name}: ${specName} (${className})`);
                }
            }
            
            // Determine role using spec-based detection
            const role = this.determineRoleFromSpec(specName, className, roleName);
            
            // Map by Discord user ID
            roleMap[userId] = {
                role: role,
                specName: specName,
                className: className,
                roleName: roleName,
                isConfirmed: true,
                source: specOverrides[userId] ? 'spec_override' : (specName ? 'spec_based' : 'role_based')
            };
            
            if (!isLargeRoster) {
                console.log(`✅ ${signup.name}: ${role} (${specName || 'no spec'} ${className}) - Source: ${roleMap[userId].source}`);
            }
        });
        
        if (isLargeRoster) {
            // Provide summary for large rosters
            const roleCounts = Object.values(roleMap).reduce((acc, role) => {
                acc[role.role] = (acc[role.role] || 0) + 1;
                return acc;
            }, {});
            console.log('🎯 Role processing complete for large roster:');
            console.log(`   └─ Total players: ${Object.keys(roleMap).length}`);
            console.log(`   └─ DPS: ${roleCounts.dps || 0}, Healers: ${roleCounts.healer || 0}, Tanks: ${roleCounts.tank || 0}`);
        } else {
            console.log('🎯 Final role map by Discord ID:', Object.keys(roleMap).length, 'players processed');
        }
        return roleMap;
    }

    inferRoleFromPerformance(playerName, playerData, roleMap, damageEntries, healingEntries, rosterPlayers) {
        // Reduce logging verbosity for large rosters to prevent browser crashes
        const isLargeRoster = rosterPlayers.length > 30;
        
        if (!isLargeRoster) {
            console.log(`🔍 [ROLE DETECTION] Analyzing role for player: ${playerName}`);
        }
        
        // First, try to find the Discord ID for this player via roster matching
        const rosterPlayer = rosterPlayers.find(p => 
            p.name && p.name.toLowerCase() === playerName.toLowerCase()
        );
        
        if (rosterPlayer && rosterPlayer.discordId && roleMap[rosterPlayer.discordId]) {
            // Found confirmed role via Discord ID match
            const roleData = roleMap[rosterPlayer.discordId];
            if (!isLargeRoster) {
                console.log(`✅ [ROLE DETECTION] ${playerName}: Found confirmed role via Discord ID ${rosterPlayer.discordId}`);
                console.log(`   └─ Role: ${roleData.role ? roleData.role.toUpperCase() : 'UNKNOWN'}`);
                console.log(`   └─ Spec: ${roleData.specName || 'N/A'}`);
                console.log(`   └─ Source: ${roleData.source || 'unknown'}`);
                console.log(`   └─ Method: Discord ID Match`);
            }
            return roleData;
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
            if (!isLargeRoster) {
                console.log(`⚔️ [ROLE DETECTION] ${playerName}: Inferred as DPS based on performance`);
                console.log(`   └─ Player damage: ${playerDamage.toLocaleString()}`);
                console.log(`   └─ Lowest confirmed DPS: ${lowestConfirmedDPSDamage.toLocaleString()}`);
                console.log(`   └─ Method: Performance Inference`);
            }
            return {
                role: 'dps',
                className: 'Unknown',
                roleName: 'Inferred DPS',
                isConfirmed: false
            };
        }
        
        if (playerHealing > lowestConfirmedHealerHealing && confirmedHealers.length > 0) {
            if (!isLargeRoster) {
                console.log(`❤️ [ROLE DETECTION] ${playerName}: Inferred as HEALER based on performance`);
                console.log(`   └─ Player healing: ${playerHealing.toLocaleString()}`);
                console.log(`   └─ Lowest confirmed healer: ${lowestConfirmedHealerHealing.toLocaleString()}`);
                console.log(`   └─ Method: Performance Inference`);
            }
            return {
                role: 'healer',
                className: 'Unknown', 
                roleName: 'Inferred Healer',
                isConfirmed: false
            };
        }
        
        if (!isLargeRoster) {
            console.log(`❌ [ROLE DETECTION] ${playerName}: No role could be determined`);
            console.log(`   └─ Player damage: ${playerDamage.toLocaleString()}`);
            console.log(`   └─ Player healing: ${playerHealing.toLocaleString()}`);
            console.log(`   └─ Roster match: ${rosterPlayer ? 'Found' : 'Not found'}`);
            console.log(`   └─ Discord ID: ${rosterPlayer?.discordId || 'N/A'}`);
        }
        
        return null;
    }

    createRoleSourceLegend() {
        return `
            <div class="role-source-legend">
                <h4>Role Detection Sources:</h4>
                <div class="legend-item">
                    <span class="legend-dot" style="background-color: #28a745;"></span>
                    Roster Override (Managed rosters with custom specs)
                </div>
                <div class="legend-item">
                    <span class="legend-dot" style="background-color: #007bff;"></span>
                    Spec-based (Determined from player's talent specialization)
                </div>
                <div class="legend-item">
                    <span class="legend-dot" style="background-color: #ffc107;"></span>
                    Role-based (Fallback using Raid-Helper role assignment)
                </div>
                <div class="legend-item">
                    <span style="opacity: 0.7;">🔍</span>
                    Performance Inference (No dot - inferred from damage/healing output)
                </div>
            </div>
        `;
    }

    getRoleIcon(roleData, isConfirmed = true) {
        if (!roleData) return '';
        
        // Handle both old format (string) and new format (object)
        const role = typeof roleData === 'string' ? roleData : roleData.role;
        const specName = typeof roleData === 'object' ? roleData.specName : null;
        const source = typeof roleData === 'object' ? roleData.source : null;
        
        const iconClass = isConfirmed ? 'role-icon' : 'role-icon inferred';
        
        // Build enhanced tooltip with spec information
        let title = '';
        if (isConfirmed) {
            title = role.charAt(0).toUpperCase() + role.slice(1);
            if (specName) {
                title += ` (${specName})`;
            }
            if (source) {
                const sourceText = source === 'spec_override' ? 'Roster Override' : 
                                 source === 'spec_based' ? 'Spec-based' : 'Role-based';
                title += ` - ${sourceText}`;
            }
        } else {
            title = `Inferred ${role.charAt(0).toUpperCase() + role.slice(1)}`;
        }
        
        // Add source indicator dot
        let sourceIndicator = '';
        if (source && isConfirmed) {
            const sourceColors = {
                'spec_override': '#28a745',    // Green for roster override
                'spec_based': '#007bff',       // Blue for spec-based  
                'role_based': '#ffc107'        // Yellow for role fallback
            };
            const sourceColor = sourceColors[source] || '#6c757d';
            sourceIndicator = `<span class="source-dot" style="background-color: ${sourceColor};"></span>`;
        }
        
        switch (role) {
            case 'tank':
                return `<span class="${iconClass} tank" title="${title}">🛡️${sourceIndicator}</span>`;
            case 'dps':
                return `<span class="${iconClass} dps" title="${title}">⚔️${sourceIndicator}</span>`;
            case 'healer':
                return `<span class="${iconClass} healer" title="${title}">❤️${sourceIndicator}</span>`;
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
            
            // Fetch roster data for managed roster spec overrides
            console.log('Fetching roster data for spec overrides...');
            const rosterDataForSpecs = await this.fetchRosterData();
            
            const roleMap = this.parseRaidHelperRoles(raidHelperData, rosterDataForSpecs);

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
        
        // Hide unwanted sections for live data too
        console.log('🎯 [LIVE DATA] Hiding Fight Data and Raid Summary panels');
        this.hideFightDataPanel();
        this.hideSummaryPanel();

            // Store the data to database
            await this.storeLogDataToDatabase(logId, roleMap);

            // Automatically run automatch after all data has been loaded and displayed
            console.log('🤖 [AUTO-MATCH] Running automatic player matching...');
            try {
                await this.runAutomatch();
                console.log('✅ [AUTO-MATCH] Automatic matching completed successfully');
            } catch (automatchError) {
                console.warn('⚠️ [AUTO-MATCH] Automatic matching failed, but analysis succeeded:', automatchError);
                // Don't throw the error - we don't want to fail the entire analysis if automatch fails
            }

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
        const container = document.getElementById('charactersDataContent');

        if (!container) {
            console.error('charactersDataContent element not found');
            return;
        }

        // Check if we have live API data or stored data
        const data = this.currentLogData.fights;
        let exportedCharacters;
        let friendlies;

        if (data && data.exportedCharacters) {
            // Live API data
            exportedCharacters = data.exportedCharacters;
            friendlies = data.friendlies;
        } else {
            // Stored data - create exportedCharacters from damage/healing entries
            console.log('🔄 [CHARACTERS] Creating character list from stored damage/healing data');
            const characterMap = new Map();
            
            // Collect all unique characters from damage and healing data
            const damageEntries = this.currentLogData.damage?.entries || [];
            const healingEntries = this.currentLogData.healing?.entries || [];
            
            [...damageEntries, ...healingEntries].forEach(entry => {
                if (entry.name && !characterMap.has(entry.name)) {
                    characterMap.set(entry.name, {
                        name: entry.name,
                        id: entry.id || 0,
                        guid: entry.guid || 0,
                        type: entry.type || 'Unknown',
                        icon: entry.icon || entry.type || 'Unknown'
                    });
                }
            });
            
            exportedCharacters = Array.from(characterMap.values());
            friendlies = exportedCharacters; // Use the same data for friendlies
        }

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
        console.log('🔍 [CHARACTER DISPLAY] About to fetch confirmed players...');
        const confirmedPlayers = await this.fetchConfirmedPlayers();
        console.log('✅ [CHARACTER DISPLAY] Confirmed players received:', confirmedPlayers);
        
        // Create comparison display
        this.displayCharacterComparison(sortedCharacters, friendliesMap, rosterData, container, confirmedPlayers);
    }

    displayDamageData() {
        console.log('🎯 [DAMAGE] Starting displayDamageData()');
        const damageData = this.currentLogData.damage;
        const container = document.getElementById('damageDataContent');

        if (!container) {
            console.error('❌ [DAMAGE] damageDataContent element not found');
            return;
        }

        console.log('📊 [DAMAGE] Damage data structure:', damageData);
        console.log('📊 [DAMAGE] Entries count:', damageData?.entries?.length || 0);

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

        let damageHtml = this.createRoleSourceLegend() + '<div class="damage-list">';
        
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
                roleIcon = this.getRoleIcon(roleInfo, roleInfo.isConfirmed);
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
        console.log('🎯 [HEALING] Starting displayHealingData()');
        const healingData = this.currentLogData.healing;
        const container = document.getElementById('healingDataContent');

        if (!container) {
            console.error('❌ [HEALING] healingDataContent element not found');
            return;
        }

        console.log('📊 [HEALING] Healing data structure:', healingData);
        console.log('📊 [HEALING] Entries count:', healingData?.entries?.length || 0);

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

        let healingHtml = this.createRoleSourceLegend() + '<div class="healing-list">';
        
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
                roleIcon = this.getRoleIcon(roleInfo, roleInfo.isConfirmed);
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
        
        // Check if we have live API data with fights.friendlies
        const friendlies = this.currentLogData?.fights?.friendlies;
        if (friendlies) {
            friendlies.forEach(friendly => {
                if (friendly.name) {
                    friendliesMap[friendly.name] = friendly;
                }
            });
        } else {
            // For stored data, create friendlies map from damage/healing entries
            console.log('🔄 [FRIENDLIES] Using stored data, creating friendlies map from entries');
            const allEntries = [
                ...(this.currentLogData?.damage?.entries || []),
                ...(this.currentLogData?.healing?.entries || [])
            ];
            
            allEntries.forEach(entry => {
                if (entry.name && !friendliesMap[entry.name]) {
                    friendliesMap[entry.name] = {
                        name: entry.name,
                        type: entry.type || 'Unknown',
                        id: entry.id || 0,
                        guid: entry.guid || 0,
                        icon: entry.icon || entry.type || 'Unknown'
                    };
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
            'Druid': 'class-bg-druid',
            // Handle role-based class names from roster data
            'Tank': 'class-bg-warrior',  // Most tanks in Classic are Warriors
            'DPS': 'class-bg-unknown',   // DPS could be any class, use unknown
            'Healer': 'class-bg-unknown'  // Healers can be Priest/Druid/Shaman/Paladin, use unknown
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

    async fetchConfirmedPlayers() {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                console.log('No activeEventSession found for confirmed players lookup');
                return [];
            }

            console.log('🔍 [FETCH ALL] Fetching ALL confirmed players for raid:', activeEventSession);
        
            // Fetch ALL confirmed players (both manually and automatically matched)
            const response = await fetch(`/api/confirmed-logs/${activeEventSession}/players`);
        
            if (!response.ok) {
                console.error('❌ [FETCH ALL] Failed to fetch confirmed players:', response.status, response.statusText);
                throw new Error(`Failed to fetch confirmed players: ${response.status} ${response.statusText}`);
            }
        
            const result = await response.json();
            console.log('✅ [FETCH ALL] ALL confirmed players fetched:', result.data);
            
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
        console.log('🔄 [APPLY START] About to apply confirmed players to comparison');
        console.log('🔄 [APPLY START] Confirmed players from DB:', confirmedPlayers);
        const restoredPlayers = this.applyConfirmedPlayers(sortedCharacters, rosterPlayers, confirmedPlayers);
        console.log('🔄 [APPLY END] Restoration completed, restored players:', restoredPlayers);
        
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
        
        comparisonHtml += '<div class="character-validation-wrapper">';
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
            
            // Check if this is already a confirmed player (to avoid re-storing as exact match)
            const isAlreadyConfirmed = confirmedPlayers.find(confirmed => 
                confirmed.character_name.toLowerCase() === logsName.toLowerCase()
            );
            
            // Find exact match first
            let matchInfo = { type: 'none', rosterName: null, similarity: 0 };
            
            const exactMatch = rosterNames.find(name => name.toLowerCase() === logsName.toLowerCase());
            if (exactMatch) {
                matchInfo = { type: 'exact', rosterName: exactMatch, similarity: 1.0 };
                usedRosterNames.add(exactMatch);
                
                // Only store as automatic exact match if it's NOT already confirmed manually
                if (!isAlreadyConfirmed) {
                    // Find roster player for this exact match to get Discord ID
                    const rosterPlayer = rosterPlayers.find(p => p.name === exactMatch);
                    if (rosterPlayer && rosterPlayer.discordId) {
                        exactMatches.push({
                            discordId: rosterPlayer.discordId,
                            characterName: logsName,
                            characterClass: characterClass
                        });
                    }
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
            
            // Get Discord IDs for display
            let logsDiscordId = null;
            let rosterDiscordId = null;
            
            // For logs side - check confirmed players first, then exact matches
            if (confirmedPlayer && confirmedPlayer.discord_id) {
                logsDiscordId = confirmedPlayer.discord_id;
            } else if (rosterPlayer && rosterPlayer.discordId && finalMatchInfo.type === 'exact') {
                logsDiscordId = rosterPlayer.discordId;
            }
            
            // For roster side - get from rosterPlayer if available
            if (rosterPlayer && rosterPlayer.discordId) {
                rosterDiscordId = rosterPlayer.discordId;
            }
            
            // Format Discord ID display (last 4 digits)
            const formatDiscordId = (discordId) => {
                if (!discordId) return '';
                const last4 = discordId.slice(-4);
                return `<div style="font-size: 0.8em; color: black; margin-top: 2px;">...${last4}</div>`;
            };
            
            comparisonHtml += `
                <div class="character-comparison-row" id="${rowId}">
                    <div class="logs-character ${classBackgroundClass}">
                        <span class="character-name-black">${logsName}</span>
                        ${formatDiscordId(logsDiscordId)}
                    </div>
                    <div class="comparison-indicator">
                        ${this.getComparisonIndicator(finalMatchInfo)}
                    </div>
                    <div class="roster-character ${finalRosterClassBackgroundClass}">
                        ${finalMatchInfo.rosterName ? 
                            `<span class="roster-name-black ${finalMatchInfo.type} ${clickableClass}" ${clickableAttributes} ${discordIdAttribute}>${finalMatchInfo.rosterName}</span>
                             ${formatDiscordId(rosterDiscordId)}` : 
                            `<span class="roster-name missing ${clickableClass}" ${clickableAttributes}>No match</span>`}
                    </div>
                </div>
            `;
        });
        
        comparisonHtml += '</div>'; // Close character-comparison-container
        
        // Show unmatched roster names
        const unmatchedRosterPlayers = rosterPlayers.filter(player => !usedRosterNames.has(player.name));
        if (unmatchedRosterPlayers.length > 0) {
            comparisonHtml += '<div class="unmatched-section">';
            comparisonHtml += '<h4>❌ Unmatched Roster Players:</h4>';
            
            // Process each unmatched player and their additional characters
            for (const player of unmatchedRosterPlayers) {
                const unmatchedClassBackgroundClass = this.getClassBackgroundClass(player.class);
                const formatDiscordId = (discordId) => {
                    if (!discordId) return '';
                    const last4 = discordId.slice(-4);
                    return `<div style="font-size: 0.8em; color: black; margin-top: 2px;">...${last4}</div>`;
                };
                
                // Main roster player
                comparisonHtml += `
                    <div class="character-comparison-row unmatched">
                        <div class="roster-character ${unmatchedClassBackgroundClass}">
                            <span class="roster-name-black unmatched">${player.name}</span>
                            ${formatDiscordId(player.discordId)}
                        </div>
                    </div>
                `;
                
                // Add placeholder for additional characters (will be populated via AJAX)
                if (player.discordId) {
                    comparisonHtml += `<div id="additional-chars-${player.discordId}" class="additional-characters-container"></div>`;
                }
            }
            
            comparisonHtml += '</div>'; // Close unmatched-section
        }
        
        comparisonHtml += '</div>'; // Close character-validation-wrapper
        
        // Add automatch results display (automatch now runs automatically with Step 1)
        comparisonHtml += `
            <div style="margin: 20px 0; text-align: center;">
                <div id="automatchResults" style="font-size: 0.9em; color: #666;"></div>
            </div>
        `;
        
        container.innerHTML = comparisonHtml;
        
        // Add event listeners to clickable roster names
        this.attachRosterNameClickListeners();
        
        // Add event listener for reset button if it exists
        this.attachResetButtonListener();
        
        // Store reference to container for real-time updates
        this.currentComparisonContainer = container;
        
        // Fetch and display additional characters for unmatched roster players
        this.loadAdditionalCharactersForUnmatchedPlayers(unmatchedRosterPlayers);
        
        // Store exact matches automatically
        if (exactMatches.length > 0) {
            console.log(`📝 Storing ${exactMatches.length} exact matches (excluding already confirmed players)`);
            this.storeExactMatches(exactMatches);
        } else {
            console.log('📝 No new exact matches to store (all matches were already confirmed manually)');
        }
        
        // Update validation counts after DOM is rendered
        setTimeout(() => this.updateRosterValidation(), 100);
    }

    async loadAdditionalCharactersForUnmatchedPlayers(unmatchedRosterPlayers) {
        // Process each unmatched player to fetch their additional characters
        for (const player of unmatchedRosterPlayers) {
            if (player.discordId) {
                try {
                    await this.fetchAndDisplayAdditionalCharacters(player.discordId, player.name);
                } catch (error) {
                    console.error(`Error fetching additional characters for ${player.name} (${player.discordId}):`, error);
                }
            }
        }
    }

    async fetchAndDisplayAdditionalCharacters(discordId, primaryPlayerName) {
        try {
            const response = await fetch(`/api/players/by-discord-id/${discordId}`);
            const result = await response.json();
            
            if (result.success && result.characters && result.characters.length > 0) {
                // Filter out the primary character (already displayed) and get additional ones
                const additionalCharacters = result.characters.filter(char => 
                    char.character_name.toLowerCase() !== primaryPlayerName.toLowerCase()
                );
                
                if (additionalCharacters.length > 0) {
                    this.displayAdditionalCharacters(discordId, additionalCharacters, primaryPlayerName);
                }
            }
        } catch (error) {
            console.error('Error fetching additional characters:', error);
        }
    }

    displayAdditionalCharacters(discordId, additionalCharacters, primaryPlayerName) {
        const container = document.getElementById(`additional-chars-${discordId}`);
        if (!container) return;
        
        const formatDiscordId = (discordId) => {
            if (!discordId) return '';
            const last4 = discordId.slice(-4);
            return `<div style="font-size: 0.8em; color: black; margin-top: 2px;">...${last4}</div>`;
        };
        
        let additionalHtml = '';
        additionalCharacters.forEach(char => {
            const characterClassBackgroundClass = this.getClassBackgroundClass(char.class);
            additionalHtml += `
                <div class="character-comparison-row unmatched additional-character">
                    <div class="roster-character ${characterClassBackgroundClass}" style="margin-left: 20px; opacity: 0.8;">
                        <span class="roster-name-black unmatched" style="font-style: italic; font-size: 0.9em;">
                            ↳ ${char.character_name}
                        </span>
                        ${formatDiscordId(discordId)}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = additionalHtml;
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
        console.log('🔄 Original roster players before applying confirmed:', rosterPlayers.map(p => ({name: p.name, discordId: p.discordId})));
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
        console.log('🔄 Roster players after applying confirmed:', rosterPlayers.map(p => ({name: p.name, discordId: p.discordId})));
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



    async runAutomatch() {
        const resultsDiv = document.getElementById('automatchResults');
        
        if (!resultsDiv) return;
        
        // Clear previous results
        resultsDiv.innerHTML = '';
        
        try {
            console.log('🤖 [AUTOMATCH] Starting automatch process...');
            
            // Get all "No match" and partial match entries
            const noMatchEntries = this.findNoMatchEntries();
            console.log(`🤖 [AUTOMATCH] Found ${noMatchEntries.length} entries to process (no-match + partial-match)`);
            
            if (noMatchEntries.length === 0) {
                resultsDiv.innerHTML = '<div style="color: #28a745;">✅ No unmatched or partial match players found!</div>';
                return;
            }
            
            // Phase 1: Match with unmatched roster players
            const phase1Results = await this.automatchWithUnmatchedRoster(noMatchEntries);
            console.log(`🤖 [AUTOMATCH] Phase 1 completed: ${phase1Results.matches.length} matches`);
            
            // Phase 2: Match remaining with Players table
            const remainingNoMatch = this.findNoMatchEntries(); // Re-check after Phase 1
            const phase2Results = await this.automatchWithPlayersTable(remainingNoMatch);
            console.log(`🤖 [AUTOMATCH] Phase 2 completed: ${phase2Results.matches.length} matches`);
            
            // Display results
            this.displayAutomatchResults(phase1Results, phase2Results, resultsDiv);
            
            // Update validation counts
            setTimeout(() => this.updateRosterValidation(), 100);
            
        } catch (error) {
            console.error('❌ [AUTOMATCH] Error during automatch:', error);
            resultsDiv.innerHTML = '<div style="color: #dc3545;">❌ Error during automatch process</div>';
        }
    }

    findNoMatchEntries() {
        const noMatchEntries = [];
        const comparisonRows = document.querySelectorAll('.character-comparison-row:not(.unmatched)');
        
        comparisonRows.forEach(row => {
            const rosterCell = row.querySelector('.roster-character .roster-name, .roster-character .roster-name-black');
            const indicator = row.querySelector('.comparison-indicator');
            
            let shouldInclude = false;
            let matchType = 'unknown';
            
            // Check for "No match" entries
            if (rosterCell && rosterCell.textContent.trim() === 'No match') {
                shouldInclude = true;
                matchType = 'no-match';
            }
            
            // Check for partial matches (percentage indicators like "🔶 75%")
            if (indicator && indicator.textContent.includes('🔶') && indicator.textContent.includes('%')) {
                shouldInclude = true;
                matchType = 'partial-match';
            }
            
            if (shouldInclude) {
                const logsCell = row.querySelector('.logs-character .character-name-black');
                if (logsCell) {
                    const logsName = logsCell.textContent.trim();
                    const logsClass = this.getCharacterClassFromLogsCell(row);
                    noMatchEntries.push({
                        rowId: row.id,
                        logsName: logsName,
                        logsClass: logsClass,
                        rowElement: row,
                        matchType: matchType,
                        currentRosterName: rosterCell ? rosterCell.textContent.trim() : 'No match'
                    });
                }
            }
        });
        
        console.log(`🤖 [FIND ENTRIES] Found ${noMatchEntries.length} entries to auto-match:`, 
            noMatchEntries.map(e => `${e.logsName} (${e.matchType})`));
        
        return noMatchEntries;
    }

    getCharacterClassFromLogsCell(rowElement) {
        // Extract class from the logs character cell background class
        const logsCell = rowElement.querySelector('.logs-character');
        if (logsCell) {
            const classList = Array.from(logsCell.classList);
            const classMatch = classList.find(cls => cls.startsWith('class-bg-'));
            if (classMatch) {
                const className = classMatch.replace('class-bg-', '');
                // Convert CSS class back to proper class name
                const classMap = {
                    'warrior': 'Warrior',
                    'paladin': 'Paladin', 
                    'hunter': 'Hunter',
                    'rogue': 'Rogue',
                    'priest': 'Priest',
                    'shaman': 'Shaman',
                    'mage': 'Mage',
                    'warlock': 'Warlock',
                    'druid': 'Druid'
                };
                return classMap[className] || 'Unknown';
            }
        }
        return 'Unknown';
    }

    async automatchWithUnmatchedRoster(noMatchEntries) {
        const matches = [];
        
        // Get unmatched roster players from the actual "Unmatched Roster Players" section
        const unmatchedSection = document.querySelector('.unmatched-section');
        const unmatchedCandidates = [];
        
        if (unmatchedSection) {
            // Get main unmatched roster players
            const mainUnmatchedRows = unmatchedSection.querySelectorAll('.character-comparison-row.unmatched:not(.additional-character)');
            mainUnmatchedRows.forEach(row => {
                const nameElement = row.querySelector('.roster-name-black.unmatched');
                const discordIdElement = row.querySelector('[style*="..."]'); // Discord ID display
                
                if (nameElement) {
                    const name = nameElement.textContent.trim();
                    const classBackground = Array.from(row.querySelector('.roster-character').classList)
                        .find(cls => cls.startsWith('class-bg-'));
                    const characterClass = this.getClassFromBackgroundClass(classBackground);
                    
                    // Extract Discord ID from the display
                    let discordId = null;
                    if (discordIdElement) {
                        const discordText = discordIdElement.textContent.trim();
                        const match = discordText.match(/\.\.\.(\d+)/);
                        if (match) {
                            // Find full Discord ID from currentRosterPlayers
                            const fullPlayer = this.currentRosterPlayers.find(p => 
                                p.discordId && p.discordId.endsWith(match[1])
                            );
                            if (fullPlayer) {
                                discordId = fullPlayer.discordId;
                            }
                        }
                    }
                    
                    console.log(`🤖 [PHASE 1] Main unmatched: ${name} (${characterClass}) - Discord: ${discordId}`);
                    unmatchedCandidates.push({
                        name: name,
                        class: characterClass,
                        discordId: discordId,
                        type: 'main'
                    });
                }
            });
            
            // Get additional characters (alts) from the additional-characters containers
            const additionalContainers = unmatchedSection.querySelectorAll('.additional-characters-container');
            additionalContainers.forEach(container => {
                const discordId = container.id.replace('additional-chars-', '');
                const additionalRows = container.querySelectorAll('.additional-character');
                
                additionalRows.forEach(row => {
                    const nameElement = row.querySelector('.roster-name-black.unmatched');
                    if (nameElement) {
                        const fullName = nameElement.textContent.trim();
                        const name = fullName.replace('↳ ', ''); // Remove the arrow prefix
                        const classBackground = Array.from(row.querySelector('.roster-character').classList)
                            .find(cls => cls.startsWith('class-bg-'));
                        const characterClass = this.getClassFromBackgroundClass(classBackground);
                        
                        console.log(`🤖 [PHASE 1] Alt character: ${name} (${characterClass}) - Discord: ${discordId}`);
                        unmatchedCandidates.push({
                            name: name,
                            class: characterClass,
                            discordId: discordId,
                            type: 'alt'
                        });
                    }
                });
            });
        }
        
        console.log(`🤖 [PHASE 1] Checking ${noMatchEntries.length} no-match entries against ${unmatchedCandidates.length} unmatched candidates (main + alts)`);
        
        for (const noMatchEntry of noMatchEntries) {
            console.log(`🤖 [PHASE 1] Looking for match for: ${noMatchEntry.logsName} (${noMatchEntry.logsClass})`);
            
            const matchingCandidate = unmatchedCandidates.find(candidate => {
                const nameMatch = candidate.name.toLowerCase() === noMatchEntry.logsName.toLowerCase();
                const classMatch = this.isClassMatch(candidate.class, noMatchEntry.logsClass);
                
                console.log(`🤖 [PHASE 1]   Checking ${candidate.name} (${candidate.class}): name=${nameMatch}, class=${classMatch}`);
                return nameMatch && classMatch && candidate.discordId;
            });
            
            if (matchingCandidate) {
                const improvementType = noMatchEntry.matchType === 'no-match' ? 'No match → Exact match' : 
                                      `Partial match (${noMatchEntry.currentRosterName}) → Exact match`;
                console.log(`🤖 [PHASE 1] ✅ Found match: ${noMatchEntry.logsName} (${noMatchEntry.logsClass}) -> ${matchingCandidate.name} (Discord: ${matchingCandidate.discordId}) [${matchingCandidate.type}] (${improvementType})`);
                
                try {
                    // Store the confirmed player
                    await this.storeConfirmedPlayer(matchingCandidate.discordId, noMatchEntry.logsName, noMatchEntry.logsClass);
                    
                    // Update the UI
                    this.updateRowToMatched(noMatchEntry.rowId, noMatchEntry.logsName, noMatchEntry.logsClass, matchingCandidate.discordId);
                    
                    matches.push({
                        logsName: noMatchEntry.logsName,
                        logsClass: noMatchEntry.logsClass,
                        rosterName: matchingCandidate.name,
                        discordId: matchingCandidate.discordId,
                        type: matchingCandidate.type,
                        improvementType: improvementType,
                        originalMatchType: noMatchEntry.matchType
                    });
                    
                    // Remove from candidates to prevent duplicate matches
                    const index = unmatchedCandidates.indexOf(matchingCandidate);
                    if (index > -1) {
                        unmatchedCandidates.splice(index, 1);
                    }
                    
                } catch (error) {
                    console.error(`❌ [PHASE 1] Error storing match for ${noMatchEntry.logsName}:`, error);
                }
            } else {
                console.log(`🤖 [PHASE 1] ❌ No match found for: ${noMatchEntry.logsName} (${noMatchEntry.logsClass}) [${noMatchEntry.matchType}]`);
            }
        }
        
        return { matches };
    }

    getClassFromBackgroundClass(classBackground) {
        if (!classBackground) return 'Unknown';
        
        const classMap = {
            'class-bg-warrior': 'Warrior',
            'class-bg-paladin': 'Paladin',
            'class-bg-hunter': 'Hunter',
            'class-bg-rogue': 'Rogue',
            'class-bg-priest': 'Priest',
            'class-bg-shaman': 'Shaman',
            'class-bg-mage': 'Mage',
            'class-bg-warlock': 'Warlock',
            'class-bg-druid': 'Druid',
            'class-bg-unknown': 'Unknown'
        };
        
        return classMap[classBackground] || 'Unknown';
    }

    isClassMatch(rosterClass, logsClass) {
        // Direct match
        if (rosterClass === logsClass) return true;
        
        // Role-based matching
        if (rosterClass === 'Tank' && logsClass === 'Warrior') return true;
        if (rosterClass === 'Healer' && ['Priest', 'Druid', 'Shaman', 'Paladin'].includes(logsClass)) return true;
        if (rosterClass === 'DPS' && ['Warrior', 'Rogue', 'Hunter', 'Mage', 'Warlock'].includes(logsClass)) return true;
        
        return false;
    }

    async automatchWithPlayersTable(noMatchEntries) {
        const matches = [];
        
        console.log(`🤖 [PHASE 2] Searching Players table for ${noMatchEntries.length} remaining no-match entries`);
        
        for (const noMatchEntry of noMatchEntries) {
            try {
                // Search for exact match in Players table
                const response = await fetch(`/api/search-players?query=${encodeURIComponent(noMatchEntry.logsName)}`);
                const searchResults = await response.json();
                
                // Find exact name and class match
                const exactMatch = searchResults.find(player => 
                    player.character_name.toLowerCase() === noMatchEntry.logsName.toLowerCase() &&
                    player.class === noMatchEntry.logsClass &&
                    player.discord_id
                );
                
                if (exactMatch) {
                    const improvementType = noMatchEntry.matchType === 'no-match' ? 'No match → Exact match' : 
                                          `Partial match (${noMatchEntry.currentRosterName}) → Exact match`;
                    console.log(`🤖 [PHASE 2] Found match in Players table: ${noMatchEntry.logsName} (${noMatchEntry.logsClass}) -> Discord: ${exactMatch.discord_id} (${improvementType})`);
                    
                    // Store the confirmed player
                    await this.storeConfirmedPlayer(exactMatch.discord_id, noMatchEntry.logsName, noMatchEntry.logsClass);
                    
                    // Update the UI
                    this.updateRowToMatched(noMatchEntry.rowId, noMatchEntry.logsName, noMatchEntry.logsClass, exactMatch.discord_id);
                    
                    matches.push({
                        logsName: noMatchEntry.logsName,
                        logsClass: noMatchEntry.logsClass,
                        discordId: exactMatch.discord_id,
                        improvementType: improvementType,
                        originalMatchType: noMatchEntry.matchType
                    });
                }
                
            } catch (error) {
                console.error(`❌ [PHASE 2] Error searching for ${noMatchEntry.logsName}:`, error);
            }
        }
        
        return { matches };
    }

    displayAutomatchResults(phase1Results, phase2Results, resultsDiv) {
        let resultHtml = '';
        
        // Phase 1 results
        if (phase1Results.matches.length > 0) {
            const noMatchCount = phase1Results.matches.filter(m => m.originalMatchType === 'no-match').length;
            const partialMatchCount = phase1Results.matches.filter(m => m.originalMatchType === 'partial-match').length;
            
            resultHtml += `<div style="color: #28a745; margin-bottom: 8px;">
                <div style="font-weight: bold;">✅ ${phase1Results.matches.length} players matched from Unmatched Roster:</div>`;
            
            if (noMatchCount > 0) {
                const noMatchNames = phase1Results.matches
                    .filter(m => m.originalMatchType === 'no-match')
                    .map(m => m.logsName).join(', ');
                resultHtml += `<div style="margin-left: 15px; color: #155724;">
                    🆕 ${noMatchCount} new matches: ${noMatchNames}
                </div>`;
            }
            
            if (partialMatchCount > 0) {
                const partialMatchNames = phase1Results.matches
                    .filter(m => m.originalMatchType === 'partial-match')
                    .map(m => m.logsName).join(', ');
                resultHtml += `<div style="margin-left: 15px; color: #0c5460;">
                    📈 ${partialMatchCount} improved matches: ${partialMatchNames}
                </div>`;
            }
            
            resultHtml += `</div>`;
        }
        
        // Phase 2 results  
        if (phase2Results.matches.length > 0) {
            const noMatchCount = phase2Results.matches.filter(m => m.originalMatchType === 'no-match').length;
            const partialMatchCount = phase2Results.matches.filter(m => m.originalMatchType === 'partial-match').length;
            
            resultHtml += `<div style="color: #28a745; margin-bottom: 8px;">
                <div style="font-weight: bold;">✅ ${phase2Results.matches.length} players matched from Players table:</div>`;
                
            if (noMatchCount > 0) {
                const noMatchNames = phase2Results.matches
                    .filter(m => m.originalMatchType === 'no-match')
                    .map(m => m.logsName).join(', ');
                resultHtml += `<div style="margin-left: 15px; color: #155724;">
                    🆕 ${noMatchCount} new matches: ${noMatchNames}
                </div>`;
            }
            
            if (partialMatchCount > 0) {
                const partialMatchNames = phase2Results.matches
                    .filter(m => m.originalMatchType === 'partial-match')
                    .map(m => m.logsName).join(', ');
                resultHtml += `<div style="margin-left: 15px; color: #0c5460;">
                    📈 ${partialMatchCount} improved matches: ${partialMatchNames}
                </div>`;
            }
            
            resultHtml += `</div>`;
        }
        
        // No matches found
        if (phase1Results.matches.length === 0 && phase2Results.matches.length === 0) {
            resultHtml = '<div style="color: #ffc107;">⚠️ No automatic matches found</div>';
        }
        
        resultsDiv.innerHTML = resultHtml;
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
            console.log('🔧 [MANUAL MATCH] About to store manual match with:', {
                discordId: rosterPlayer.discordId,
                characterName: logsName,
                characterClass: logsClass,
                rosterPlayerData: rosterPlayer
            });
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
        
        console.log(`🔧 [STORE MANUAL] Storing manual match:`, {
            raidId: activeEventSession,
            discordId: discordId,
            characterName: characterName,
            characterClass: characterClass,
            timestamp: new Date().toISOString()
        });
        
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
        
        const responseData = await response.json();
        console.log(`✅ [STORE MANUAL] Stored confirmed player: ${characterName} (${characterClass}) - Discord: ${discordId}`);
        console.log(`✅ [STORE MANUAL] Server response:`, responseData);
        
        // Immediately verify the storage by fetching it back
        setTimeout(async () => {
            try {
                const verifyResponse = await fetch(`/api/confirmed-logs/${activeEventSession}/players`);
                if (verifyResponse.ok) {
                    const verifyResult = await verifyResponse.json();
                    const foundPlayer = verifyResult.data?.find(p => 
                        p.discord_id === discordId && 
                        p.character_name.toLowerCase() === characterName.toLowerCase()
                    );
                    if (foundPlayer) {
                        console.log(`✅ [VERIFY MANUAL] Manual match successfully verified in database:`, foundPlayer);
                    } else {
                        console.error(`❌ [VERIFY MANUAL] Manual match NOT found in database after storage!`);
                        console.error(`❌ [VERIFY MANUAL] Looking for: discordId=${discordId}, name=${characterName}`);
                        console.error(`❌ [VERIFY MANUAL] Available players:`, verifyResult.data);
                    }
                }
            } catch (error) {
                console.error('❌ [VERIFY MANUAL] Error verifying manual match:', error);
            }
        }, 500); // Wait 500ms to let the database transaction complete
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

        // Update RPB status to 'processing'
        await this.updateRPBStatus(input.trim(), 'processing');

        // Show loading state
        this.showRPBLoading();

        try {
            // Two-phase approach to eliminate race conditions
            await this.twoPhaseRPBExecution(input.trim());

        } catch (error) {
            console.error('RPB Analysis failed:', error);
            // Update status to 'error'
            await this.updateRPBStatus(input.trim(), 'error');
            this.showError(`Failed to run RPB analysis: ${error.message}`);
        }
    }

    runNewRPBAnalysis() {
        // Clear the RPB status display
        const statusDiv = document.getElementById('rpbStatusDisplay');
        if (statusDiv) {
            statusDiv.remove();
        }
        
        // Show the original RPB button
        const rpbBtn = document.getElementById('runRpbBtn');
        if (rpbBtn) rpbBtn.style.display = 'inline-block';
        
        // Clear any existing log data display
        const logDataDiv = document.getElementById('logData');
        if (logDataDiv) {
            logDataDiv.style.display = 'none';
        }
    }

    async updateRPBStatus(logUrl, status, archiveUrl = null, archiveName = null, analysisType = 'rpb') {
        const activeEventSession = localStorage.getItem('activeEventSession');
        if (!activeEventSession) {
            console.log(`📊 [${analysisType.toUpperCase()} STATUS] No active event session for status update`);
            return;
        }

        try {
            console.log(`📊 [${analysisType.toUpperCase()} STATUS] Updating status to: ${status}`);
            
            const response = await fetch(`/api/rpb-tracking/${activeEventSession}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    logUrl,
                    status,
                    archiveUrl,
                    archiveName,
                    analysisType
                })
            });

            const result = await response.json();
            if (result.success) {
                console.log(`✅ [${analysisType.toUpperCase()} STATUS] Successfully updated status to: ${status}`);
            } else {
                console.error(`❌ [${analysisType.toUpperCase()} STATUS] Failed to update status:`, result.error);
            }
        } catch (error) {
            console.error(`❌ [${analysisType.toUpperCase()} STATUS] Error updating status:`, error);
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
        const maxDurationMs = 7 * 60 * 1000; // 7 minutes
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
                    throw new Error('RPB processing timed out after 7 minutes');
                }

            } catch (error) {
                if (!this.rpbCompleted) {
                    // Only show error if we haven't completed yet
                    if (elapsedMs >= maxDurationMs) {
                        this.showError('RPB processing timed out after 7 minutes');
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
                            <p>Running RPB analysis... This may take up to 7 minutes.</p>
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
        
        // Update RPB status to 'completed' in the database
        const logInput = document.getElementById('logInput').value;
        this.updateRPBStatus(logInput.trim(), 'completed');
        
        // Check if we're in a workflow - if so, don't show individual completion
        if (this.workflowState && this.workflowState.currentStep > 0) {
            console.log('🔄 [WORKFLOW] RPB completed, continuing workflow...');
            return;
        }
        
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
                        📁 Archive and Import RPB
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
            
            // Also refresh the RPB status display
            this.checkRPBStatus();
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
        
        // Disable button and show loading state (if button exists)
        if (archiveBtn) {
            archiveBtn.disabled = true;
            archiveBtn.innerHTML = '⏳ Creating Archive...';
        }
        
        try {
            console.log('📁 [ARCHIVE] Starting RPB backup creation...');
            
            // Call backend proxy to create the backup via Google Apps Script
            const response = await fetch('/api/logs/rpb-archive', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('📁 [ARCHIVE] Backend proxy response:', result);

            if (result.success) {
                // Update RPB tracking with archive URL
                const logInput = document.getElementById('logInput').value;
                await this.updateRPBStatus(
                    logInput.trim(), 
                    'completed', 
                    result.url, 
                    result.sheetName
                );
                
                // Show success with link to archived sheet
                this.showArchiveSuccess(result);
                console.log('✅ [ARCHIVE] RPB backup created successfully:', result.url);
            } else {
                throw new Error(result.error || 'Failed to create RPB backup');
            }

        } catch (error) {
            console.error('❌ [ARCHIVE] Archive failed:', error);
            
            // Enhanced error logging for debugging
            console.log('🔍 [ARCHIVE] Error details:', {
                name: error.name,
                message: error.message,
                status: error.status || 'unknown'
            });
            
            this.showArchiveError(error.message);
        } finally {
            // Re-enable button (if button exists)
            if (archiveBtn) {
                archiveBtn.disabled = false;
                archiveBtn.innerHTML = '📁 Archive and Import RPB';
            }
        }
    }

    showArchiveSuccess(result) {
        // Update the completion message to include archive link
        const logDataDiv = document.getElementById('logData');
        const masterSheetUrl = `https://docs.google.com/spreadsheets/d/11Y9nIYRdxPsQivpQGaK1B0Mc-tbnCR45A1I4-RaKvyk/edit?gid=588029694#gid=588029694`;
        
        logDataDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; background: var(--card-bg, #1e1e1e); border-radius: 8px;">
                <h2 style="color: var(--success-color, #28a745); margin-bottom: 1rem;">✅ RPB Analysis Complete & Archived!</h2>
                <p style="margin-bottom: 1rem; color: var(--text-secondary, #bbb);">
                    Your detailed raid performance analysis is ready and has been archived.
                </p>
                <div style="background: var(--secondary-bg, #2a2a2a); padding: 1rem; border-radius: 4px; margin-bottom: 2rem;">
                    <p style="margin: 0; color: var(--text-primary, #e0e0e0); font-weight: bold;">
                        📁 Archived as: ${result.sheetName}
                    </p>
                    <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary, #bbb); font-size: 0.9rem;">
                        Created: ${result.createdAt || 'Now'}
                    </p>
                </div>
                <a href="${result.url}" target="_blank" class="btn btn-success" style="margin-right: 1rem;">
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

    // ==============================================
    // UNIFIED WORKFLOW FUNCTIONS
    // ==============================================

    async runCompleteWorkflow() {
        const input = document.getElementById('workflowLogInput').value;
        const logId = this.extractLogId(input);

        if (!logId) {
            this.showError('Invalid log URL or ID. Please check the format and try again.');
            return;
        }

        // Get active event session for import step
        const activeEventSession = localStorage.getItem('activeEventSession');
        if (!activeEventSession) {
            this.showError('No active event session found. Please select an event first.');
            return;
        }

        console.log('🚀 [WORKFLOW] Starting complete workflow for log:', input);
        
        // Initialize workflow state
        this.workflowState = {
            currentStep: 0,
            failedStep: null,
            logUrl: input,
            eventId: activeEventSession
        };
        
        // Show progress UI and hide other elements
        this.showWorkflowProgress();
        this.hideOtherElements();
        
        // Disable workflow button
        const workflowBtn = document.getElementById('runCompleteWorkflowBtn');
        if (workflowBtn) {
            workflowBtn.disabled = true;
            workflowBtn.textContent = 'Running Workflow...';
        }

        try {
            // Step 1: Confirm Logs
            this.workflowState.currentStep = 1;
            await this.runWorkflowStep1(input);
            
            // Step 2: Run RPB Analysis
            this.workflowState.currentStep = 2;
            await this.runWorkflowStep2(input);
            
            // Step 3: Archive RPB Results
            this.workflowState.currentStep = 3;
            await this.runWorkflowStep3(input);
            
            // Step 4: Import RPB Data
            this.workflowState.currentStep = 4;
            await this.runWorkflowStep4(activeEventSession);
            
            // Step 5: World Buffs Analysis (moved earlier)
            this.workflowState.currentStep = 5;
            await this.runWorkflowStep5(input);
            
            // Step 8: Frost Resistance Analysis (moved earlier)
            this.workflowState.currentStep = 8;
            await this.runWorkflowStep8(input);
            
            // Step 6: Archive World Buffs (moved later to allow Google Apps Script to complete)
            this.workflowState.currentStep = 6;
            await this.runWorkflowStep6(input);
            
            // Step 9: Archive Frost Resistance (moved later to allow Google Apps Script to complete)
            this.workflowState.currentStep = 9;
            await this.runWorkflowStep9(input);
            
            // Step 7: Import World Buffs Data (moved to end)
            this.workflowState.currentStep = 7;
            await this.runWorkflowStep7(activeEventSession);
            
            // Step 10: Import Frost Resistance Data (moved to end)
            this.workflowState.currentStep = 10;
            await this.runWorkflowStep10(activeEventSession);
            
            // Show completion
            await this.showWorkflowComplete();
            
        } catch (error) {
            console.error('❌ [WORKFLOW] Workflow failed:', error);
            this.workflowState.failedStep = this.workflowState.currentStep;
            this.showWorkflowError(error.message);
        } finally {
            // Re-enable workflow button
            if (workflowBtn) {
                workflowBtn.disabled = false;
                workflowBtn.textContent = 'Run Complete Workflow';
            }
        }
    }

    async runWorkflowStep1(logUrl) {
        console.log('📋 [WORKFLOW] Step 1: Confirming logs...');
        this.updateWorkflowStep(1, 'active', 'Analyzing logs and matching players...', '🔄');
        
        try {
            // Set the main log input for the analyze function to use
            const mainLogInput = document.getElementById('logInput');
            if (mainLogInput) {
                mainLogInput.value = logUrl;
            }

            // Run the existing analyzeLog function (which now includes automatch)
            await this.analyzeLog();
            
            // Check for unmatched players after automatch
            const unmatchedCount = this.countUnmatchedPlayers();
            
            if (unmatchedCount > 0) {
                // Get list of unmatched player names for display
                const unmatchedPlayers = this.getUnmatchedPlayersList();
                const playerList = unmatchedPlayers.slice(0, 3).join(', ') + (unmatchedPlayers.length > 3 ? `, and ${unmatchedPlayers.length - 3} more` : '');
                
                // Show warning but mark step as completed
                this.updateWorkflowStep(1, 'completed', `⚠️ ${unmatchedCount} players not matched: ${playerList}`, '⚠️');
                
                // Add a styled notification to the progress UI
                this.addWorkflowNotification(
                    'warning',
                    `${unmatchedCount} players were not matched to a Discord ID: ${playerList}. ` +
                    'You need to match them manually, or they will not be saved to the Players database.'
                );
                
                console.log(`⚠️ [WORKFLOW] Step 1 completed with ${unmatchedCount} unmatched players`);
            } else {
                this.updateWorkflowStep(1, 'completed', 'All players matched successfully', '✅');
                console.log('✅ [WORKFLOW] Step 1 completed - all players matched');
            }
            
        } catch (error) {
            this.updateWorkflowStep(1, 'error', `Log analysis failed: ${error.message}`, '❌');
            throw error;
        }
    }

    async runWorkflowStep2(logUrl) {
        console.log('📊 [WORKFLOW] Step 2: Starting RPB Analysis...');
        this.updateWorkflowStep(2, 'active', 'Running RPB analysis...', '🔄', true);
        
        // Start progress tracking for 7 minutes
        const progressTimer = this.startStepProgressTimer(2, 7 * 60 * 1000); // 7 minutes
        
        try {
            // Set the main log input for existing RPB functions to use
            const mainLogInput = document.getElementById('logInput');
            if (mainLogInput) {
                mainLogInput.value = logUrl;
            }

            // Update RPB status to 'processing'
            await this.updateRPBStatus(logUrl.trim(), 'processing');

            // Start the two-phase RPB execution
            await this.twoPhaseRPBExecution(logUrl.trim());
            
            // Wait for RPB completion by polling status
            await this.waitForRPBCompletion();
            
            // Clear progress timer and complete the step
            clearInterval(progressTimer);
            this.completeStepWithProgressAnimation(2, 'RPB analysis completed successfully');
            console.log('✅ [WORKFLOW] Step 2 completed');
            
        } catch (error) {
            clearInterval(progressTimer);
            this.updateWorkflowStep(2, 'error', `RPB analysis failed: ${error.message}`, '❌');
            throw error;
        }
    }

    async runWorkflowStep3(logUrl) {
        console.log('📁 [WORKFLOW] Step 3: Archiving results...');
        this.updateWorkflowStep(3, 'active', 'Creating archive backup...', '🔄');
        
        try {
            // Temporarily set the logInput value for the archive function
            const logInput = document.getElementById('logInput');
            const originalValue = logInput ? logInput.value : '';
            if (logInput) {
                logInput.value = logUrl;
            }
            
            // Call the existing archive function
            await this.callArchiveFunction();
            
            // Restore original value
            if (logInput) {
                logInput.value = originalValue;
            }
            
            this.updateWorkflowStep(3, 'completed', 'Archive created successfully', '✅');
            console.log('✅ [WORKFLOW] Step 3 completed');
            
        } catch (error) {
            console.error('❌ [WORKFLOW] Step 3 failed:', error);
            this.updateWorkflowStep(3, 'error', 'Archive failed - continuing anyway', '⚠️');
            
            // Add a skip option and continue instead of failing the entire workflow
            console.log('⚠️ [WORKFLOW] Archive failed, but continuing to import step...');
            
            // Show a warning notification
            this.addWorkflowNotification('warning', 
                `Archive step failed: ${error.message}. Continuing with data import anyway.`);
            
            // Don't throw the error - let the workflow continue
        }
    }

    async runWorkflowStep4(eventId) {
        console.log('📥 [WORKFLOW] Step 4: Importing data...');
        console.log('🔍 [WORKFLOW] Step 4: Looking for archive URL for event:', eventId);
        this.updateWorkflowStep(4, 'active', 'Importing data to database...', '🔄');
        
        try {
            // Get the archive URL from RPB tracking
            const archiveUrl = await this.getArchiveUrlFromTracking(eventId);
            console.log('🔍 [WORKFLOW] Step 4: Archive URL found:', archiveUrl);
            
            if (!archiveUrl) {
                console.error('❌ [WORKFLOW] Step 4: No archive URL found in tracking table');
                throw new Error('No archive URL found from previous steps. Check that step 3 (archive) completed successfully.');
            }

            // Call the import function
            console.log('📥 [WORKFLOW] Step 4: Calling import function with URL:', archiveUrl);
            await this.callImportFunction(archiveUrl, eventId);
            
            this.updateWorkflowStep(4, 'completed', 'Data imported successfully', '✅');
            console.log('✅ [WORKFLOW] Step 4 completed');
            
        } catch (error) {
            console.error('❌ [WORKFLOW] Step 4 detailed error:', error);
            this.updateWorkflowStep(4, 'error', `Import failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Step 5: World Buffs Analysis
    async runWorkflowStep5(logUrl) {
        console.log('🌍 [WORKFLOW] Step 5: World Buffs Analysis...');
        this.updateWorkflowStep(5, 'active', 'Running World Buffs analysis...', '🔄', true);
        
        // Start progress tracking for 2 minutes
        const progressTimer = this.startStepProgressTimer(5, 2 * 60 * 1000); // 2 minutes
        
        try {
            // Clear previous status
            await this.clearWorldBuffsStatus();
            
            // Start World Buffs processing
            await this.startWorldBuffsProcessing(logUrl);
            
            // Wait for completion
            await this.pollWorldBuffsStatus();
            
            // Clear progress timer and complete the step
            clearInterval(progressTimer);
            this.completeStepWithProgressAnimation(5, 'World Buffs analysis completed');
            console.log('✅ [WORKFLOW] Step 5 completed');
            
        } catch (error) {
            clearInterval(progressTimer);
            this.updateWorkflowStep(5, 'error', `World Buffs analysis failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Step 6: Archive World Buffs
    async runWorkflowStep6(logUrl) {
        console.log('📁 [WORKFLOW] Step 6: Archiving World Buffs...');
        this.updateWorkflowStep(6, 'active', 'Creating World Buffs archive...', '🔄');
        
        try {
            // Call World Buffs backup function
            const response = await fetch('/api/logs/cla-backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'createClaBackupWithCheck' })
            });

            if (!response.ok) {
                throw new Error(`Failed to create World Buffs backup: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown backup error');
            }

            // Store archive URL in database
            await this.storeWorldBuffsArchiveUrl(result, logUrl, this.workflowState.eventId);
            
            this.updateWorkflowStep(6, 'completed', 'World Buffs archive created', '✅');
            console.log('✅ [WORKFLOW] Step 6 completed');
            
        } catch (error) {
            this.updateWorkflowStep(6, 'error', `World Buffs archive failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Step 7: Import World Buffs Data
    async runWorkflowStep7(eventId) {
        console.log('📥 [WORKFLOW] Step 7: Importing World Buffs data...');
        this.updateWorkflowStep(7, 'active', 'Importing World Buffs to database...', '🔄');
        
        try {
            // Get World Buffs archive URL from tracking  
            const archiveUrl = await this.getArchiveUrlFromTracking(eventId, 'world_buffs');
            if (!archiveUrl) {
                throw new Error('No World Buffs archive URL found');
            }

            // Import World Buffs data
            await this.importWorldBuffsData(archiveUrl);
            
            this.updateWorkflowStep(7, 'completed', 'World Buffs data imported', '✅');
            console.log('✅ [WORKFLOW] Step 7 completed');
            
        } catch (error) {
            this.updateWorkflowStep(7, 'error', `World Buffs import failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Step 8: Frost Resistance Analysis
    async runWorkflowStep8(logUrl) {
        console.log('🧊 [WORKFLOW] Step 8: Frost Resistance Analysis...');
        this.updateWorkflowStep(8, 'active', 'Running Frost Resistance analysis...', '🔄', true);
        
        // Start progress tracking for 2 minutes
        const progressTimer = this.startStepProgressTimer(8, 2 * 60 * 1000); // 2 minutes
        
        try {
            // Clear previous status
            await this.clearFrostResStatus();
            
            // Start Frost Resistance processing
            await this.startFrostResProcessing(logUrl);
            
            // Wait for completion
            await this.pollFrostResStatus();
            
            // Clear progress timer and complete the step
            clearInterval(progressTimer);
            this.completeStepWithProgressAnimation(8, 'Frost Resistance analysis completed');
            console.log('✅ [WORKFLOW] Step 8 completed');
            
        } catch (error) {
            clearInterval(progressTimer);
            this.updateWorkflowStep(8, 'error', `Frost Resistance analysis failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Step 9: Archive Frost Resistance
    async runWorkflowStep9(logUrl) {
        console.log('📁 [WORKFLOW] Step 9: Archiving Frost Resistance...');
        this.updateWorkflowStep(9, 'active', 'Creating Frost Resistance archive...', '🔄');
        
        try {
            // Call Frost Resistance backup function
            const response = await fetch('/api/logs/frost-res', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'createClaBackupWithCheck' })
            });

            if (!response.ok) {
                throw new Error(`Failed to create Frost Resistance backup: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown backup error');
            }

            // Store archive URL in database
            await this.storeFrostResArchiveUrl(result, logUrl, this.workflowState.eventId);
            
            this.updateWorkflowStep(9, 'completed', 'Frost Resistance archive created', '✅');
            console.log('✅ [WORKFLOW] Step 9 completed');
            
        } catch (error) {
            this.updateWorkflowStep(9, 'error', `Frost Resistance archive failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Step 10: Import Frost Resistance Data
    async runWorkflowStep10(eventId) {
        console.log('📥 [WORKFLOW] Step 10: Importing Frost Resistance data...');
        this.updateWorkflowStep(10, 'active', 'Importing Frost Resistance to database...', '🔄');
        
        try {
            // Get Frost Resistance archive URL from tracking
            const archiveUrl = await this.getArchiveUrlFromTracking(eventId, 'frost_resistance');
            if (!archiveUrl) {
                throw new Error('No Frost Resistance archive URL found');
            }

            // Import Frost Resistance data
            await this.importFrostResData(archiveUrl);
            
            this.updateWorkflowStep(10, 'completed', 'Frost Resistance data imported', '✅');
            console.log('✅ [WORKFLOW] Step 10 completed');
            
        } catch (error) {
            this.updateWorkflowStep(10, 'error', `Frost Resistance import failed: ${error.message}`, '❌');
            throw error;
        }
    }

    // Helper function to wait for RPB completion
    async waitForRPBCompletion() {
        return new Promise((resolve, reject) => {
            const maxWaitTime = 7 * 60 * 1000; // 7 minutes
            const checkInterval = 3000; // 3 seconds
            const startTime = Date.now();
            
            const checkCompletion = async () => {
                try {
                    const response = await fetch(this.rpbApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'checkStatus' })
                    });
                    
                    const result = await response.json();
                    
                    if (result.status === 'COMPLETE' || (result.status && result.status.toString().startsWith('COMPLETE'))) {
                        resolve();
                        return;
                    }
                    
                    if (result.status && result.status.toString().startsWith('ERROR')) {
                        reject(new Error(result.status));
                        return;
                    }
                    
                    // Update progress status
                    const elapsed = Date.now() - startTime;
                    const progressPercent = Math.min((elapsed / maxWaitTime) * 100, 95);
                    this.updateWorkflowStep(2, 'active', `RPB analysis in progress... ${Math.round(progressPercent)}%`, '🔄', true);
                    
                    // Continue checking if not timed out
                    if (elapsed < maxWaitTime) {
                        setTimeout(checkCompletion, checkInterval);
                    } else {
                        reject(new Error('RPB analysis timed out after 7 minutes'));
                    }
                    
                } catch (error) {
                    console.warn('Status check failed, retrying...', error);
                    setTimeout(checkCompletion, checkInterval);
                }
            };
            
            checkCompletion();
        });
    }

    // Helper function to call archive function
    async callArchiveFunction() {
        return new Promise((resolve, reject) => {
            // Store original handlers
            const originalShowArchiveSuccess = this.showArchiveSuccess.bind(this);
            const originalShowArchiveError = this.showArchiveError.bind(this);
            
            // Override handlers for workflow
            this.showArchiveSuccess = (result) => {
                // Restore original handlers
                this.showArchiveSuccess = originalShowArchiveSuccess;
                this.showArchiveError = originalShowArchiveError;
                resolve(result);
            };
            
            this.showArchiveError = (errorMessage) => {
                // Restore original handlers
                this.showArchiveSuccess = originalShowArchiveSuccess;
                this.showArchiveError = originalShowArchiveError;
                reject(new Error(errorMessage));
            };
            
            // Call the existing archive function
            this.archiveRPBResults();
        });
    }

    // Helper function to get archive URL from tracking
    async getArchiveUrlFromTracking(eventId, analysisType = 'rpb') {
        try {
            console.log('🔍 [TRACKING] Fetching archive URL for event:', eventId, 'type:', analysisType);
            const response = await fetch(`/api/rpb-tracking/${eventId}?analysisType=${analysisType}`);
            console.log('🔍 [TRACKING] Response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('🔍 [TRACKING] Response data:', data);
                
                // With analysisType parameter, archiveUrl is directly in response
                if (data.success && data.archiveUrl) {
                    console.log('✅ [TRACKING] Archive URL found:', data.archiveUrl);
                    return data.archiveUrl;
                } else {
                    console.warn('⚠️ [TRACKING] No archive URL in response:', data);
                    console.warn('🔍 [TRACKING] Response structure:', JSON.stringify(data, null, 2));
                    return null;
                }
            } else {
                console.error('❌ [TRACKING] Bad response:', response.status, response.statusText);
                return null;
            }
        } catch (error) {
            console.error('❌ [TRACKING] Failed to get archive URL:', error);
            return null;
        }
    }

    async getAllArchiveUrls(eventId) {
        const archiveTypes = ['rpb', 'world_buffs', 'frost_resistance'];
        const archiveUrls = [];
        
        for (const type of archiveTypes) {
            try {
                const url = await this.getArchiveUrlFromTracking(eventId, type);
                if (url) {
                    archiveUrls.push({ type, url });
                }
            } catch (error) {
                console.warn(`⚠️ [TRACKING] Failed to get ${type} archive URL:`, error);
            }
        }
        
        return archiveUrls;
    }

    // Helper function to call import function (replicating rpb_import.js logic)
    async callImportFunction(sheetUrl, eventId) {
        const response = await fetch('/api/import-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetUrl, eventId })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Import failed');
        }

        return result;
    }

    // Progress UI functions
    showWorkflowProgress() {
        console.log('📊 [WORKFLOW] Showing workflow progress');
        // Keep input section visible but disable the button
        const inputSection = document.getElementById('workflowInputSection');
        const progressSection = document.getElementById('progressStepsSection');
        const runButton = document.getElementById('runCompleteWorkflowBtn');
        const workflowInput = document.getElementById('workflowLogInput');
        
        if (progressSection) progressSection.style.display = 'block';
        
        // Disable and style the button during workflow
        if (runButton) {
            runButton.disabled = true;
            runButton.innerHTML = '<span class="workflow-spinner"></span> Running Workflow...';
            runButton.style.cursor = 'not-allowed';
        }
        
        // Make input readonly during workflow
        if (workflowInput) {
            workflowInput.readOnly = true;
            workflowInput.style.backgroundColor = 'var(--input-bg-disabled, #333)';
            workflowInput.style.cursor = 'not-allowed';
        }
        
        // Reset all steps to waiting state
        for (let i = 1; i <= 10; i++) {
            this.updateWorkflowStep(i, 'waiting', 'Waiting...', '⏳');
        }
        
        this.hideOtherElements();
    }

    hideOtherElements() {
        // Hide existing elements that might interfere
        const elementsToHide = ['loadingIndicator', 'errorDisplay'];
        elementsToHide.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        });
        
        // Show logData container but hide specific sections except characters
        const logData = document.getElementById('logData');
        if (logData) {
            logData.style.display = 'block';
            
            // Hide all sections except characters
            const sectionsToHide = ['fightDataContent', 'damageDataContent', 'healingDataContent', 'summaryDataContent', 'rawDataContent'];
            sectionsToHide.forEach(id => {
                const section = document.getElementById(id);
                if (section) section.parentElement.style.display = 'none';
            });
            
            // Make sure characters section is visible
            const charactersSection = document.getElementById('charactersDataContent');
            if (charactersSection) charactersSection.parentElement.style.display = 'block';
        }
    }

    updateWorkflowStep(stepNumber, state, statusText, indicator, withProgress = false) {
        const stepDiv = document.getElementById(`step${stepNumber}Progress`);
        const statusDiv = document.getElementById(`step${stepNumber}Status`);
        const indicatorDiv = document.getElementById(`step${stepNumber}Indicator`);
        
        if (stepDiv && statusDiv && indicatorDiv) {
            // Remove all state classes
            stepDiv.classList.remove('active', 'completed', 'error', 'waiting', 'with-progress');
            
            // Add new state class
            if (state !== 'waiting') {
                stepDiv.classList.add(state);
            }
            
            // Add progress bar class for long-running steps
            if (withProgress && state === 'active') {
                stepDiv.classList.add('with-progress');
            }
            
            statusDiv.textContent = statusText;
            indicatorDiv.textContent = indicator;
        }
    }

    updateWorkflowStepProgress(stepNumber, percentage) {
        const stepDiv = document.getElementById(`step${stepNumber}Progress`);
        if (stepDiv && stepDiv.classList.contains('with-progress')) {
            stepDiv.style.setProperty('--progress-width', `${percentage}%`);
        }
    }

    startStepProgressTimer(stepNumber, durationMs) {
        const startTime = Date.now();
        const updateInterval = 100; // Update every 100ms for smooth animation
        
        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const percentage = Math.min((elapsed / durationMs) * 100, 100);
            
            this.updateWorkflowStepProgress(stepNumber, percentage);
            
            // If we reach 100%, stop the timer
            if (percentage >= 100) {
                clearInterval(timer);
            }
        }, updateInterval);
        
        return timer;
    }

    async completeStepWithProgressAnimation(stepNumber, completionMessage) {
        // Quickly animate to 100% if not already there
        this.updateWorkflowStepProgress(stepNumber, 100);
        
        // Wait a moment for the animation to complete
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Update to completed state
        this.updateWorkflowStep(stepNumber, 'completed', completionMessage, '✅');
    }

    countUnmatchedPlayers() {
        const comparisonRows = document.querySelectorAll('.character-comparison-row:not(.unmatched)');
        let unmatchedCount = 0;
        
        comparisonRows.forEach(row => {
            const rosterCell = row.querySelector('.roster-character .roster-name, .roster-character .roster-name-black');
            const indicator = row.querySelector('.comparison-indicator');
            
            // Count "No match" entries
            if (rosterCell && rosterCell.textContent.trim() === 'No match') {
                unmatchedCount++;
            }
            
            // Count partial matches (🔶 percentage)
            if (indicator && indicator.textContent.includes('🔶') && indicator.textContent.includes('%')) {
                unmatchedCount++;
            }
        });
        
        return unmatchedCount;
    }

    getUnmatchedPlayersList() {
        const comparisonRows = document.querySelectorAll('.character-comparison-row:not(.unmatched)');
        const unmatchedPlayers = [];
        
        comparisonRows.forEach(row => {
            const logsCell = row.querySelector('.logs-character .character-name-black');
            const rosterCell = row.querySelector('.roster-character .roster-name, .roster-character .roster-name-black');
            const indicator = row.querySelector('.comparison-indicator');
            
            if (logsCell) {
                const playerName = logsCell.textContent.trim();
                
                // Check for "No match" or partial match
                const isNoMatch = rosterCell && rosterCell.textContent.trim() === 'No match';
                const isPartialMatch = indicator && indicator.textContent.includes('🔶') && indicator.textContent.includes('%');
                
                if (isNoMatch || isPartialMatch) {
                    unmatchedPlayers.push(playerName);
                }
            }
        });
        
        return unmatchedPlayers;
    }

    addWorkflowNotification(type, message) {
        const progressDiv = document.getElementById('workflowProgress');
        if (!progressDiv) return;
        
        // Remove any existing notifications
        const existingNotification = progressDiv.querySelector('.workflow-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'workflow-notification';
        
        // Set styling based on type
        const colors = {
            warning: {
                bg: 'rgba(255, 193, 7, 0.1)',
                border: '#ffc107',
                text: '#856404'
            },
            error: {
                bg: 'rgba(220, 53, 69, 0.1)',
                border: '#dc3545',
                text: '#721c24'
            },
            info: {
                bg: 'rgba(13, 202, 240, 0.1)',
                border: '#0dcaf0',
                text: '#055160'
            }
        };
        
        const color = colors[type] || colors.info;
        
        notification.style.cssText = `
            margin: 1rem 0;
            padding: 0.75rem 1rem;
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-radius: 6px;
            color: ${color.text};
            font-size: 0.9rem;
            line-height: 1.4;
        `;
        
        notification.textContent = message;
        
        // Insert after the progress steps
        const progressSteps = progressDiv.querySelector('.progress-steps');
        if (progressSteps) {
            progressSteps.insertAdjacentElement('afterend', notification);
        }
    }

    async showWorkflowComplete() {
        // Fetch archive URLs from tracking
        const eventId = this.workflowState.eventId;
        const archiveUrls = await this.getAllArchiveUrls(eventId);
        
        // Find the Characters section to insert completion message above it
        const charactersSection = document.querySelector('#logData .data-section');
        if (charactersSection) {
            // Create completion message
            const completionMessage = document.createElement('div');
            completionMessage.id = 'workflowCompletionMessage';
            completionMessage.style.cssText = `
                text-align: center;
                margin: 1.5rem auto;
                padding: 1.5rem;
                background: rgba(40, 167, 69, 0.1);
                border: 1px solid var(--success-color, #28a745);
                border-radius: 8px;
                color: var(--success-color, #28a745);
                max-width: 800px;
            `;
            
            const archiveSection = archiveUrls.length > 0 ? `
                <div style="margin: 1.5rem 0;">
                    <h5 style="margin: 0 0 1rem 0; color: var(--primary-color, #4a9eff);">📁 Archive Files Created:</h5>
                    <div class="workflow-completion-archives">
                        ${archiveUrls.map(archive => `
                            <a href="${archive.url}" target="_blank" class="btn btn-primary">
                                ${archive.type === 'rpb' ? '📊' : archive.type === 'world_buffs' ? '🌍' : '🧊'} 
                                ${archive.type === 'rpb' ? 'RPB Analysis' : archive.type === 'world_buffs' ? 'World Buffs' : 'Frost Resistance'}
                            </a>
                        `).join('')}
                    </div>
                </div>
            ` : '';
            
            completionMessage.innerHTML = `
                <h4 style="margin: 0 0 1rem 0;">🎉 Complete Workflow Finished!</h4>
                <p style="margin: 0 0 1rem 0;">All 10 steps completed successfully!</p>
                ${archiveSection}
                <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(74, 158, 255, 0.1); border-radius: 6px;">
                    <h5 style="margin: 0 0 0.5rem 0; color: var(--primary-color, #4a9eff);">💾 Database Import Status:</h5>
                    <p style="margin: 0; color: var(--text-primary, #e0e0e0);">
                        ✅ RPB data imported successfully<br>
                        ✅ World Buffs data imported successfully<br>
                        ✅ Frost Resistance data imported successfully
                    </p>
                </div>
            `;
            
            // Insert before the Characters section
            charactersSection.parentNode.insertBefore(completionMessage, charactersSection);
        }
        
        // Restore button and input states for next workflow
        const runButton = document.getElementById('runCompleteWorkflowBtn');
        const workflowInput = document.getElementById('workflowLogInput');
        
        if (runButton) {
            runButton.disabled = false;
            runButton.innerHTML = 'Run Complete Workflow';
            runButton.style.cursor = 'pointer';
        }
        
        if (workflowInput) {
            workflowInput.readOnly = false;
            workflowInput.style.backgroundColor = '';
            workflowInput.style.cursor = '';
        }
        
        // Show reset button in the workflow actions
        const actionsDiv = document.getElementById('workflowActions');
        if (actionsDiv) {
            actionsDiv.style.display = 'block';
            const retryBtn = document.getElementById('retryWorkflowBtn');
            if (retryBtn) retryBtn.style.display = 'none';
        }
    }



    showWorkflowError(errorMessage) {
        // Restore button and input states since workflow has failed
        const runButton = document.getElementById('runCompleteWorkflowBtn');
        const workflowInput = document.getElementById('workflowLogInput');
        
        if (runButton) {
            runButton.disabled = false;
            runButton.innerHTML = 'Run Complete Workflow';
            runButton.style.cursor = 'pointer';
        }
        
        if (workflowInput) {
            workflowInput.readOnly = false;
            workflowInput.style.backgroundColor = '';
            workflowInput.style.cursor = '';
        }
        
        const progressDiv = document.getElementById('workflowProgress');
        if (progressDiv) {
            // Add error message
            const errorMessageDiv = document.createElement('div');
            errorMessageDiv.style.cssText = `
                text-align: center;
                margin-top: 1.5rem;
                padding: 1rem;
                background: rgba(220, 53, 69, 0.1);
                border: 1px solid var(--error-color, #dc3545);
                border-radius: 6px;
                color: var(--error-color, #dc3545);
            `;
            errorMessageDiv.innerHTML = `
                <h4 style="margin: 0 0 0.5rem 0;">❌ Workflow Failed</h4>
                <p style="margin: 0;">${errorMessage}</p>
            `;
            
            progressDiv.appendChild(errorMessageDiv);
            
            // Show action buttons
            const actionsDiv = document.getElementById('workflowActions');
            if (actionsDiv) {
                actionsDiv.style.display = 'block';
            }
        }
    }

    resetWorkflow() {
        // Keep input section visible and hide progress steps
        const inputSection = document.getElementById('workflowInputSection');
        const progressSection = document.getElementById('progressStepsSection');
        
        if (inputSection) inputSection.style.display = 'block';
        if (progressSection) {
            progressSection.style.display = 'none';
            // Remove any completion/error messages
            const messages = progressSection.querySelectorAll('div[style*="margin-top: 1.5rem"]');
            messages.forEach(msg => msg.remove());
        }
        
        // Reset button and input states
        const workflowBtn = document.getElementById('runCompleteWorkflowBtn');
        const workflowInput = document.getElementById('workflowLogInput');
        
        if (workflowBtn) {
            workflowBtn.disabled = false;
            workflowBtn.innerHTML = 'Run Complete Workflow';
            workflowBtn.style.cursor = 'pointer';
        }
        
        if (workflowInput) {
            workflowInput.value = '';
            workflowInput.readOnly = false;
            workflowInput.style.backgroundColor = '';
            workflowInput.style.cursor = '';
        }
        
        // Hide actions
        const actionsDiv = document.getElementById('workflowActions');
        if (actionsDiv) {
            actionsDiv.style.display = 'none';
        }

        // Reset all step indicators to initial state
        for (let i = 1; i <= 10; i++) {
            this.updateWorkflowStep(i, '', 'Waiting...', '⏳');
        }

        // Hide logData section and remove completion message
        const logData = document.getElementById('logData');
        if (logData) logData.style.display = 'none';
        
        // Remove completion message if it exists
        const completionMessage = document.getElementById('workflowCompletionMessage');
        if (completionMessage) {
            completionMessage.remove();
        }

        // Reset workflow state
        this.workflowState = {
            currentStep: 0,
            failedStep: null,
            logUrl: null,
            eventId: null
        };
    }

    // Enhanced retry mechanism that can continue from failed step
    async retryWorkflowFromFailedStep() {
        if (!this.workflowState || !this.workflowState.failedStep) {
            // If no failed step info, restart from beginning
            this.runCompleteWorkflow();
            return;
        }

        const { failedStep, logUrl, eventId } = this.workflowState;
        
        console.log(`🔄 [WORKFLOW] Retrying from step ${failedStep}...`);
        
        // Show progress UI
        this.showWorkflowProgress();
        
        // Clear error state from failed step
        this.updateWorkflowStep(failedStep, 'waiting', 'Waiting...', '⏳');
        
        // Set completed status for previous steps
        for (let i = 1; i < failedStep; i++) {
            this.updateWorkflowStep(i, 'completed', 'Previously completed', '✅');
        }

        try {
            // Resume from failed step and complete all remaining steps
            switch (failedStep) {
                case 1:
                    await this.runWorkflowStep1(logUrl);
                    // Fall through to run remaining steps
                case 2:
                    this.workflowState.currentStep = 2;
                    await this.runWorkflowStep2(logUrl);
                    // Fall through to run remaining steps
                case 3:
                    this.workflowState.currentStep = 3;
                    await this.runWorkflowStep3(logUrl);
                    // Fall through to run remaining steps
                case 4:
                    this.workflowState.currentStep = 4;
                    await this.runWorkflowStep4(eventId);
                    // Fall through to run remaining steps
                case 5:
                    this.workflowState.currentStep = 5;
                    await this.runWorkflowStep5(logUrl);
                    // Fall through to run remaining steps
                case 6:
                    this.workflowState.currentStep = 6;
                    await this.runWorkflowStep6(logUrl);
                    // Fall through to run remaining steps
                case 7:
                    this.workflowState.currentStep = 7;
                    await this.runWorkflowStep7(eventId);
                    // Fall through to run remaining steps
                case 8:
                    this.workflowState.currentStep = 8;
                    await this.runWorkflowStep8(logUrl);
                    // Fall through to run remaining steps
                case 9:
                    this.workflowState.currentStep = 9;
                    await this.runWorkflowStep9(logUrl);
                    // Fall through to run remaining steps
                case 10:
                    this.workflowState.currentStep = 10;
                    await this.runWorkflowStep10(eventId);
                    break;
                default:
                    throw new Error(`Unknown step: ${failedStep}`);
            }
            
            await this.showWorkflowComplete();
            
        } catch (error) {
            console.error(`❌ [WORKFLOW] Retry failed at step ${failedStep}:`, error);
            this.showWorkflowError(error.message);
        }
    }

    // ==============================================
    // WORLD BUFFS FUNCTIONS
    // ==============================================

    async runWorldBuffsAnalysis() {
        const worldBuffsBtn = document.getElementById('runWorldBuffsBtn');
        
        // Get log URL from World Buffs input field
        const inputElement = document.getElementById('worldBuffsLogInput');
        console.log('🌍 [WORLD BUFFS] Input element found:', inputElement);
        
        if (!inputElement) {
            this.showWorldBuffsError('Input field not found. Please refresh the page and try again.');
            return;
        }
        
        const input = inputElement.value;
        console.log('🌍 [WORLD BUFFS] Input value:', `"${input}"`);
        console.log('🌍 [WORLD BUFFS] Input length:', input.length);
        
        if (!input || input.trim().length === 0) {
            this.showWorldBuffsError('Please enter a WoW logs URL or ID.');
            return;
        }
        
        const logId = this.extractLogId(input);
        console.log('🌍 [WORLD BUFFS] Extracted log ID:', logId);
        
        // Test with user's examples for debugging
        console.log('🔍 [DEBUG] Test with "3RHMnKDFV2ZPaGbX":', this.extractLogId('3RHMnKDFV2ZPaGbX'));
        console.log('🔍 [DEBUG] Test with full URL:', this.extractLogId('https://vanilla.warcraftlogs.com/reports/3RHMnKDFV2ZPaGbX'));

        if (!logId) {
            this.showWorldBuffsError('Invalid log URL or ID. Please check the format and try again.');
            return;
        }
        
        // Disable button and show loading state
        if (worldBuffsBtn) {
            worldBuffsBtn.disabled = true;
            worldBuffsBtn.innerHTML = '⏳ Populating World Buffs...';
        }

        try {
            console.log('🌍 [WORLD BUFFS] Starting world buffs analysis for log:', input.trim());
            
            // Clear previous status
            await this.clearWorldBuffsStatus();
            
            // Start world buffs processing with log URL
            await this.startWorldBuffsProcessing(input.trim());
            
            // Start status monitoring
            this.worldBuffsCompleted = false;
            this.pollWorldBuffsStatus();
            
        } catch (error) {
            console.error('❌ [WORLD BUFFS] Analysis failed:', error);
            this.showWorldBuffsError(error.message);
        } finally {
            // Re-enable button
            if (worldBuffsBtn) {
                worldBuffsBtn.disabled = false;
                worldBuffsBtn.innerHTML = '🌍 Populate World Buffs';
            }
        }
    }

    async clearWorldBuffsStatus() {
        try {
            console.log('🧹 [WORLD BUFFS] Clearing previous status...');
            
            const response = await fetch('/api/logs/world-buffs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'clearStatus'
                })
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error('Failed to clear status: ' + result.error);
            }
            
            console.log('✅ [WORLD BUFFS] Status cleared');
            
        } catch (error) {
            console.error('❌ [WORLD BUFFS] Error clearing status:', error);
            throw error;
        }
    }

    async startWorldBuffsProcessing(logUrl) {
        try {
            console.log('🚀 [WORLD BUFFS] Starting world buffs processing for:', logUrl);
            
            // Start the processing without waiting for completion to avoid Heroku timeout
            const processingPromise = fetch('/api/logs/world-buffs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'populateWorldBuffs',
                    logUrl: logUrl
                })
            });

            // Set a reasonable timeout for the initial request
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout - continuing with polling')), 25000) // 25 seconds
            );

            try {
                // Try to get the response, but don't wait too long
                const response = await Promise.race([processingPromise, timeoutPromise]);
                const result = await response.json();
                
                if (!result.success) {
                    console.warn('⚠️ [WORLD BUFFS] Initial request returned error, will continue polling:', result.error);
                } else {
                    console.log('✅ [WORLD BUFFS] Processing started successfully');
                }
            } catch (error) {
                // If the initial request times out or fails, that's okay - the processing might still be running
                if (error.message.includes('timeout') || error.message.includes('503') || error.message.includes('Service Unavailable')) {
                    console.log('⚠️ [WORLD BUFFS] Initial request timed out (likely Heroku timeout), continuing with polling...');
                    // Update workflow status to indicate we're handling the timeout gracefully
                    if (this.workflowState && this.workflowState.currentStep === 5) {
                        this.updateWorkflowStep(5, 'active', 'Processing (handling server timeout)...', '🔄', true);
                    }
                } else {
                    console.log('⚠️ [WORLD BUFFS] Initial request failed, continuing with polling...', error.message);
                }
            }
            
            console.log('✅ [WORLD BUFFS] Processing initiated, will poll for completion');
            
        } catch (error) {
            console.error('❌ [WORLD BUFFS] Error starting processing:', error);
            throw error;
        }
    }

    async pollWorldBuffsStatus() {
        const maxDurationMs = 2 * 60 * 1000; // 2 minutes
        const pollIntervalMs = 3000; // 3 seconds
        const startTime = Date.now();

        const checkStatus = async () => {
            if (this.worldBuffsCompleted) return;

            const elapsedMs = Date.now() - startTime;

            try {
                const response = await fetch('/api/logs/world-buffs', {
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
                    this.worldBuffsCompleted = true;
                    this.showWorldBuffsComplete();
                    return;
                } else if (result.status && result.status.toString().startsWith('ERROR')) {
                    this.worldBuffsCompleted = true;
                    throw new Error(result.status);
                }

                // Continue polling if still processing
                if (elapsedMs < maxDurationMs) {
                    setTimeout(checkStatus, pollIntervalMs);
                } else {
                    this.worldBuffsCompleted = true;
                    throw new Error('World Buffs analysis timed out after 2 minutes');
                }

            } catch (error) {
                this.worldBuffsCompleted = true;
                console.error('❌ [WORLD BUFFS] Status check failed:', error);
                this.showWorldBuffsError(error.message);
            }
        };

        // Start checking immediately
        checkStatus();
    }

    showWorldBuffsComplete() {
        console.log('✅ [WORLD BUFFS] Analysis completed successfully');
        
        // Check if we're in a workflow - if so, don't show individual completion
        if (this.workflowState && this.workflowState.currentStep > 0) {
            console.log('🔄 [WORKFLOW] World Buffs completed, continuing workflow...');
            return;
        }
        
        // Show success message with backup button
        const successDiv = document.createElement('div');
        successDiv.className = 'world-buffs-success';
        successDiv.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; background: var(--card-bg, #1e1e1e); border-radius: 8px; margin: 1rem auto; max-width: 600px; border-left: 4px solid var(--success-color, #28a745);">
                <h3 style="color: var(--success-color, #28a745); margin: 0 0 0.5rem 0;">🌍 World Buffs Populated Successfully!</h3>
                <p style="color: var(--text-secondary, #bbb); margin: 0 0 1rem 0;">World buffs data has been updated in the Google Sheet.</p>
                <button id="createClaBackupBtn" class="btn-success" style="margin-top: 0.5rem;">
                    🗄️ Copy and Archive
                </button>
                <div id="claBackupResult" style="margin-top: 1rem; display: none;"></div>
            </div>
        `;
        
        // Insert after the world buffs section
        const worldBuffsSection = document.querySelector('.world-buffs-section');
        if (worldBuffsSection) {
            worldBuffsSection.parentNode.insertBefore(successDiv, worldBuffsSection.nextSibling);
            
            // Add click listener to backup button
            const backupBtn = successDiv.querySelector('#createClaBackupBtn');
            if (backupBtn) {
                backupBtn.addEventListener('click', () => this.createClaBackup());
            }
            
            // Remove success message after 30 seconds (increased to give time for backup)
            setTimeout(() => {
                if (successDiv.parentNode) {
                    successDiv.parentNode.removeChild(successDiv);
                }
            }, 30000);
        }
    }

    showWorldBuffsError(errorMessage) {
        console.error('❌ [WORLD BUFFS] Error:', errorMessage);
        
        // Show error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'world-buffs-error';
        errorDiv.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; background: var(--card-bg, #1e1e1e); border-radius: 8px; margin: 1rem auto; max-width: 600px; border-left: 4px solid #dc3545;">
                <h3 style="color: #dc3545; margin: 0 0 0.5rem 0;">❌ World Buffs Error</h3>
                <p style="color: var(--text-secondary, #bbb); margin: 0;">${errorMessage}</p>
            </div>
        `;
        
        // Insert after the world buffs section
        const worldBuffsSection = document.querySelector('.world-buffs-section');
        if (worldBuffsSection) {
            worldBuffsSection.parentNode.insertBefore(errorDiv, worldBuffsSection.nextSibling);
            
            // Remove error message after 10 seconds
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, 10000);
        }
    }

    async createClaBackup() {
        console.log('🗄️ [CLA BACKUP] Starting backup creation...');
        
        try {
            // Disable the backup button and show loading
            const backupBtn = document.getElementById('createClaBackupBtn');
            const resultDiv = document.getElementById('claBackupResult');
            
            if (backupBtn) {
                backupBtn.disabled = true;
                backupBtn.innerHTML = '⏳ Creating Backup...';
            }
            
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<p style="color: var(--text-secondary, #bbb);">Creating backup copy...</p>';
            }

            // Make request to create backup
            const response = await fetch('/api/logs/cla-backup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'createClaBackupWithCheck'
                })
            });

            const result = await response.json();
            console.log('🗄️ [CLA BACKUP] Backup response:', result);

            if (result.success) {
                // Store archive URL in database
                await this.storeWorldBuffsArchiveUrl(result);
                
                // Import the archived sheet data into database
                await this.importWorldBuffsData(result.backupUrl);
                
                // Show success with link to the backup
                if (resultDiv) {
                    resultDiv.innerHTML = `
                        <div style="padding: 1rem; background: rgba(40, 167, 69, 0.1); border-radius: 4px; border-left: 4px solid var(--success-color, #28a745);">
                            <h4 style="color: var(--success-color, #28a745); margin: 0 0 0.5rem 0;">✅ Backup Created & Data Imported!</h4>
                            <p style="margin: 0 0 0.5rem 0; color: var(--text-secondary, #bbb);">
                                Archive: <strong>${result.backupName}</strong><br>
                                <small>Data imported into database ✅</small>
                            </p>
                            <a href="${result.backupUrl}" target="_blank" class="btn-success" style="text-decoration: none; display: inline-block;">
                                📊 Open Archived Sheet
                            </a>
                        </div>
                    `;
                }
                
                if (backupBtn) {
                    backupBtn.innerHTML = '✅ Backup Complete';
                    backupBtn.style.background = 'var(--success-color, #28a745)';
                }
                
                console.log('✅ [CLA BACKUP] Backup created successfully:', result.backupUrl);
                
            } else {
                throw new Error(result.error || 'Unknown backup error');
            }

        } catch (error) {
            console.error('❌ [CLA BACKUP] Backup or import failed:', error);
            
            // Show error message
            const resultDiv = document.getElementById('claBackupResult');
            if (resultDiv) {
                const errorMessage = error.message || 'Failed to create backup or import data';
                const isImportError = errorMessage.includes('import') || errorMessage.includes('Import');
                
                resultDiv.innerHTML = `
                    <div style="padding: 1rem; background: rgba(220, 53, 69, 0.1); border-radius: 4px; border-left: 4px solid #dc3545;">
                        <h4 style="color: #dc3545; margin: 0 0 0.5rem 0;">❌ ${isImportError ? 'Import Failed' : 'Backup Failed'}</h4>
                        <p style="margin: 0; color: var(--text-secondary, #bbb);">${errorMessage}</p>
                        ${isImportError ? '<small style="color: var(--text-secondary, #bbb);">The backup was created but data import failed. You can try manually importing later.</small>' : ''}
                    </div>
                `;
            }
            
            // Reset button
            const backupBtn = document.getElementById('createClaBackupBtn');
            if (backupBtn) {
                backupBtn.disabled = false;
                backupBtn.innerHTML = '🗄️ Copy and Archive';
                backupBtn.style.background = '';
            }
        }
    }

    async storeWorldBuffsArchiveUrl(archiveResult, logUrl = null, eventId = null) {
        try {
            // Use provided parameters or fallback to DOM elements
            let activeEventSession = eventId || localStorage.getItem('activeEventSession');
            let logId = logUrl;
            
            // If no logUrl provided, try to get from input field
            if (!logId) {
                const logInput = document.getElementById('worldBuffsLogInput').value;
                logId = this.extractLogId(logInput);
            } else {
                // If logUrl is provided, extract just the ID part
                logId = this.extractLogId(logUrl);
            }
            
            if (!activeEventSession || !logId) {
                console.warn('⚠️ [WORLD BUFFS] Missing event session or log ID for archive storage');
                console.warn('⚠️ [WORLD BUFFS] eventId:', activeEventSession, 'logId:', logId);
                return;
            }

            console.log('💾 [WORLD BUFFS] Storing archive URL in database...');
            
            const response = await fetch(`/api/rpb-tracking/${activeEventSession}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    logUrl: logId,
                    status: 'completed',
                    archiveUrl: archiveResult.backupUrl,
                    archiveName: archiveResult.backupName,
                    analysisType: 'world_buffs'
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ [WORLD BUFFS] Archive URL stored in database:', result);
            } else {
                console.warn('⚠️ [WORLD BUFFS] Failed to store archive URL in database');
            }
        } catch (error) {
            console.warn('⚠️ [WORLD BUFFS] Error storing archive URL:', error);
        }
    }

    async importWorldBuffsData(sheetUrl) {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                console.warn('⚠️ [WORLD BUFFS IMPORT] Missing event session for data import');
                return;
            }

            console.log('📊 [WORLD BUFFS IMPORT] Importing data from archived sheet...');
            
            const response = await fetch('/api/import-world-buffs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sheetUrl: sheetUrl,
                    eventId: activeEventSession,
                    analysisType: 'world_buffs'
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to import World Buffs data: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ [WORLD BUFFS IMPORT] Successfully imported ${result.playerCount} players with ${result.buffsCount} buff entries`);
            } else {
                console.error('❌ [WORLD BUFFS IMPORT] Failed to import data:', result.message);
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('❌ [WORLD BUFFS IMPORT] Error importing data:', error);
            throw error; // Re-throw so the UI can handle it
        }
    }

    // ====================================
    // FROST RESISTANCE FUNCTIONS
    // ====================================

    async runFrostResAnalysis() {
        console.log('🧊 [FROST RES] Starting frost resistance analysis...');
        
        try {
            // Get the input element and value
            const input = document.getElementById('frostResLogInput');
            console.log('🧊 [FROST RES] Input element found:', input);
            
            if (!input || !input.value.trim()) {
                this.showFrostResError('Please enter a WoW logs URL or ID');
                return;
            }
            
            const logValue = input.value.trim();
            console.log('🧊 [FROST RES] Input value:', `"${logValue}"`);
            console.log('🧊 [FROST RES] Input length:', logValue.length);
            
            // Extract the log ID
            const logId = this.extractLogId(logValue);
            console.log('🧊 [FROST RES] Extracted log ID:', logId);
            
            if (!logId) {
                this.showFrostResError('Invalid log URL or ID. Please check the format and try again.');
                return;
            }
            
            console.log('🧊 [FROST RES] Starting frost resistance analysis for log:', logId);
            
            // Disable button during processing
            const button = document.getElementById('runFrostResBtn');
            if (button) {
                button.disabled = true;
                button.innerHTML = '⏳ Analyzing...';
            }
            
            // Clear previous status
            await this.clearFrostResStatus();
            
            // Start frost resistance processing
            await this.startFrostResProcessing(input.value.trim());
            
            // Poll for completion
            await this.pollFrostResStatus();
            
        } catch (error) {
            console.error('❌ [FROST RES] Analysis failed:', error);
            this.showFrostResError(error.message || 'Frost resistance analysis failed');
            
            // Re-enable button
            const button = document.getElementById('runFrostResBtn');
            if (button) {
                button.disabled = false;
                button.innerHTML = '🧊 Analyze Frost Resistance';
            }
        }
    }

    async clearFrostResStatus() {
        try {
            console.log('🧹 [FROST RES] Clearing previous status...');
            
            const response = await fetch('/api/logs/frost-res', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'clearStatus'
                })
            });

            const result = await response.json();
            console.log('✅ [FROST RES] Status cleared');
            
        } catch (error) {
            console.error('❌ [FROST RES] Error clearing status:', error);
            throw error;
        }
    }

    async startFrostResProcessing(logUrl) {
        try {
            console.log('🚀 [FROST RES] Starting frost resistance processing...');
            
            // Start the processing without waiting for completion to avoid Heroku timeout
            const processingPromise = fetch('/api/logs/frost-res', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'populateFrostRes',
                    logUrl: logUrl
                })
            });

            // Set a reasonable timeout for the initial request
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout - continuing with polling')), 25000) // 25 seconds
            );

            try {
                // Try to get the response, but don't wait too long
                const response = await Promise.race([processingPromise, timeoutPromise]);
                const result = await response.json();
                
                if (!result.success) {
                    console.warn('⚠️ [FROST RES] Initial request returned error, will continue polling:', result.error);
                } else {
                    console.log('✅ [FROST RES] Processing started successfully');
                }
            } catch (error) {
                // If the initial request times out or fails, that's okay - the processing might still be running
                if (error.message.includes('timeout') || error.message.includes('503') || error.message.includes('Service Unavailable')) {
                    console.log('⚠️ [FROST RES] Initial request timed out (likely Heroku timeout), continuing with polling...');
                    // Update workflow status to indicate we're handling the timeout gracefully
                    if (this.workflowState && this.workflowState.currentStep === 8) {
                        this.updateWorkflowStep(8, 'active', 'Processing (handling server timeout)...', '🔄', true);
                    }
                } else {
                    console.log('⚠️ [FROST RES] Initial request failed, continuing with polling...', error.message);
                }
            }
            
            console.log('✅ [FROST RES] Processing initiated, will poll for completion');
            
        } catch (error) {
            console.error('❌ [FROST RES] Error starting processing:', error);
            throw error;
        }
    }

    async pollFrostResStatus() {
        console.log('📊 [FROST RES] Starting status polling...');
        
        const startTime = Date.now();
        const timeoutMs = 2 * 60 * 1000; // 2 minutes timeout
        
        const checkStatus = async () => {
            try {
                const response = await fetch('/api/logs/frost-res', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'checkStatus'
                    })
                });

                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to check status');
                }
                
                const status = result.status || 'PENDING';
                console.log('📊 [FROST RES] Current status:', status);
                
                if (status === 'COMPLETE') {
                    this.showFrostResComplete();
                    return;
                } else if (status.toString().startsWith('ERROR')) {
                    throw new Error(status.replace('ERROR: ', '') || 'Frost resistance processing failed');
                } else if (Date.now() - startTime > timeoutMs) {
                    throw new Error('Frost resistance processing timed out');
                } else {
                    // Continue polling
                    setTimeout(checkStatus, 3000); // Check every 3 seconds
                }
                
            } catch (error) {
                console.error('❌ [FROST RES] Status polling error:', error);
                this.showFrostResError(error.message || 'Frost resistance processing failed');
                
                // Re-enable button
                const button = document.getElementById('runFrostResBtn');
                if (button) {
                    button.disabled = false;
                    button.innerHTML = '🧊 Analyze Frost Resistance';
                }
            }
        };

        // Start checking immediately
        checkStatus();
    }

    showFrostResComplete() {
        console.log('✅ [FROST RES] Analysis completed successfully');
        
        // Check if we're in a workflow - if so, don't show individual completion
        if (this.workflowState && this.workflowState.currentStep > 0) {
            console.log('🔄 [WORKFLOW] Frost Resistance completed, continuing workflow...');
            return;
        }
        
        // Show success message with backup button
        const successDiv = document.createElement('div');
        successDiv.className = 'frost-res-success';
        successDiv.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; background: var(--card-bg, #1e1e1e); border-radius: 8px; margin: 1rem auto; max-width: 600px; border-left: 4px solid var(--success-color, #28a745);">
                <h3 style="color: var(--success-color, #28a745); margin: 0 0 0.5rem 0;">🧊 Frost Resistance Analysis Complete!</h3>
                <p style="color: var(--text-secondary, #bbb); margin: 0 0 1rem 0;">Frost resistance data has been analyzed and updated in the Google Sheet.</p>
                <button id="createFrostResBackupBtn" class="btn-success" style="margin-top: 0.5rem;">
                    🗄️ Copy and Archive
                </button>
                <div id="frostResBackupResult" style="margin-top: 1rem; display: none;"></div>
            </div>
        `;
        
        // Insert after the frost resistance section
        const frostResSection = document.querySelector('.frost-res-section');
        if (frostResSection) {
            frostResSection.parentNode.insertBefore(successDiv, frostResSection.nextSibling);
            
            // Add click listener to backup button
            const backupBtn = successDiv.querySelector('#createFrostResBackupBtn');
            if (backupBtn) {
                backupBtn.addEventListener('click', () => this.createFrostResBackup());
            }
            
            // Remove success message after 30 seconds (increased to give time for backup)
            setTimeout(() => {
                if (successDiv.parentNode) {
                    successDiv.parentNode.removeChild(successDiv);
                }
            }, 30000);
        }
        
        // Re-enable button
        const button = document.getElementById('runFrostResBtn');
        if (button) {
            button.disabled = false;
            button.innerHTML = '🧊 Analyze Frost Resistance';
        }
    }

    showFrostResError(errorMessage) {
        console.error('❌ [FROST RES] Error:', errorMessage);
        
        // Show error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'frost-res-error';
        errorDiv.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; background: var(--card-bg, #1e1e1e); border-radius: 8px; margin: 1rem auto; max-width: 600px; border-left: 4px solid #dc3545;">
                <h3 style="color: #dc3545; margin: 0 0 0.5rem 0;">❌ Frost Resistance Error</h3>
                <p style="color: var(--text-secondary, #bbb); margin: 0;">${errorMessage}</p>
            </div>
        `;
        
        // Insert after the frost resistance section
        const frostResSection = document.querySelector('.frost-res-section');
        if (frostResSection) {
            frostResSection.parentNode.insertBefore(errorDiv, frostResSection.nextSibling);
            
            // Remove error message after 10 seconds
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, 10000);
        }
        
        // Re-enable button
        const button = document.getElementById('runFrostResBtn');
        if (button) {
            button.disabled = false;
            button.innerHTML = '🧊 Analyze Frost Resistance';
        }
    }

    async createFrostResBackup() {
        console.log('🗄️ [FROST RES BACKUP] Starting backup creation...');
        
        try {
            // Disable the backup button and show loading
            const backupBtn = document.getElementById('createFrostResBackupBtn');
            const resultDiv = document.getElementById('frostResBackupResult');
            
            if (backupBtn) {
                backupBtn.disabled = true;
                backupBtn.innerHTML = '⏳ Creating Backup...';
            }
            
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<p style="color: var(--text-secondary, #bbb);">Creating backup copy...</p>';
            }

            // Make request to create backup
            const response = await fetch('/api/logs/frost-res', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'createClaBackupWithCheck'
                })
            });

            const result = await response.json();
            console.log('🗄️ [FROST RES BACKUP] Backup response:', result);

            if (result.success) {
                // Store archive URL in database
                await this.storeFrostResArchiveUrl(result);
                
                // Import the archived sheet data into database
                await this.importFrostResData(result.backupUrl);
                
                // Show success with link to the backup
                if (resultDiv) {
                    resultDiv.innerHTML = `
                        <div style="padding: 1rem; background: rgba(40, 167, 69, 0.1); border-radius: 4px; border-left: 4px solid var(--success-color, #28a745);">
                            <h4 style="color: var(--success-color, #28a745); margin: 0 0 0.5rem 0;">✅ Backup Created & Data Imported!</h4>
                            <p style="margin: 0 0 0.5rem 0; color: var(--text-secondary, #bbb);">
                                Archive: <strong>${result.backupName}</strong><br>
                                <small>Data imported into database ✅</small>
                            </p>
                            <a href="${result.backupUrl}" target="_blank" class="btn-success" style="text-decoration: none; display: inline-block;">
                                📊 Open Archived Sheet
                            </a>
                        </div>
                    `;
                }
                
                if (backupBtn) {
                    backupBtn.innerHTML = '✅ Backup Complete';
                    backupBtn.style.background = 'var(--success-color, #28a745)';
                }
                
                console.log('✅ [FROST RES BACKUP] Backup created successfully:', result.backupUrl);
                
            } else {
                throw new Error(result.error || 'Unknown backup error');
            }

        } catch (error) {
            console.error('❌ [FROST RES BACKUP] Backup or import failed:', error);
            
            // Show error message
            const resultDiv = document.getElementById('frostResBackupResult');
            if (resultDiv) {
                const errorMessage = error.message || 'Failed to create backup or import data';
                const isImportError = errorMessage.includes('import') || errorMessage.includes('Import');
                
                resultDiv.innerHTML = `
                    <div style="padding: 1rem; background: rgba(220, 53, 69, 0.1); border-radius: 4px; border-left: 4px solid #dc3545;">
                        <h4 style="color: #dc3545; margin: 0 0 0.5rem 0;">❌ ${isImportError ? 'Import Failed' : 'Backup Failed'}</h4>
                        <p style="margin: 0; color: var(--text-secondary, #bbb);">${errorMessage}</p>
                        ${isImportError ? '<small style="color: var(--text-secondary, #bbb);">The backup was created but data import failed. You can try manually importing later.</small>' : ''}
                    </div>
                `;
            }
            
            // Reset button
            const backupBtn = document.getElementById('createFrostResBackupBtn');
            if (backupBtn) {
                backupBtn.disabled = false;
                backupBtn.innerHTML = '🗄️ Copy and Archive';
                backupBtn.style.background = '';
            }
        }
    }

    async storeFrostResArchiveUrl(archiveResult, logUrl = null, eventId = null) {
        try {
            // Use provided parameters or fallback to DOM elements
            let activeEventSession = eventId || localStorage.getItem('activeEventSession');
            let logId = logUrl;
            
            // If no logUrl provided, try to get from input field
            if (!logId) {
                const logInput = document.getElementById('frostResLogInput').value;
                logId = this.extractLogId(logInput);
            } else {
                // If logUrl is provided, extract just the ID part
                logId = this.extractLogId(logUrl);
            }
            
            if (!activeEventSession || !logId) {
                console.warn('⚠️ [FROST RES] Missing event session or log ID for archive storage');
                console.warn('⚠️ [FROST RES] eventId:', activeEventSession, 'logId:', logId);
                return;
            }

            console.log('💾 [FROST RES] Storing archive URL in database...');
            
            const response = await fetch(`/api/rpb-tracking/${activeEventSession}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    logUrl: logId,
                    status: 'completed',
                    archiveUrl: archiveResult.backupUrl,
                    archiveName: archiveResult.backupName,
                    analysisType: 'frost_resistance'
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ [FROST RES] Archive URL stored in database:', result);
            } else {
                console.warn('⚠️ [FROST RES] Failed to store archive URL in database');
            }
        } catch (error) {
            console.warn('⚠️ [FROST RES] Error storing archive URL:', error);
        }
    }

    async importFrostResData(sheetUrl) {
        try {
            const activeEventSession = localStorage.getItem('activeEventSession');
            
            if (!activeEventSession) {
                console.warn('⚠️ [FROST RES IMPORT] Missing event session for data import');
                return;
            }

            console.log('📊 [FROST RES IMPORT] Importing data from archived sheet...');
            
            const response = await fetch('/api/import-world-buffs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sheetUrl: sheetUrl,
                    eventId: activeEventSession,
                    analysisType: 'frost_resistance'
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to import Frost Resistance data: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                const count = result.frostResCount || result.playerCount;
                console.log(`✅ [FROST RES IMPORT] Successfully imported ${result.playerCount} players with frost resistance data`);
            } else {
                console.error('❌ [FROST RES IMPORT] Failed to import data:', result.message);
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('❌ [FROST RES IMPORT] Error importing data:', error);
            throw error; // Re-throw so the UI can handle it
        }
    }
}

// Initialize the analyzer when the page loads
let wowLogsAnalyzer;
document.addEventListener('DOMContentLoaded', () => {
    wowLogsAnalyzer = new WoWLogsAnalyzer();
}); 