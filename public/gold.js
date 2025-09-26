// Gold Pot Page JavaScript

class GoldPotManager {
    constructor() {
        this.allPlayers = [];
        this.filteredPlayers = [];
        this.currentEventId = null;
        // Map: lowercase character name -> realm (server)
        this.nameToRealm = new Map();
        // Datasets for point computation
        this.logData = [];
        this.rewardSettings = {};
        this.datasets = {};
        this.totalPointsAll = 0;
        this.sharedGoldPot = 0;
        this.totalGoldPot = 0;
        this.playerTotals = new Map(); // name -> { class, points, gold }
        // Snapshot/manual mode support
        this.snapshotLocked = false;
        this.snapshotEntries = [];
        // Assigned tanks (from /assignments Tanking panel markers)
        this.assignedTanks = new Set();
        
        this.initializeEventListeners();
        this.loadData();
        // Keep numeric colors normalized in breakdowns
        this._normalizeBreakdownColors = this._normalizeBreakdownColors.bind(this);
    }

    initializeEventListeners() {
        // Filter change listeners
        const classFilter = document.getElementById('classFilter');
        
        if (classFilter) {
            classFilter.addEventListener('change', () => this.applyFilters());
        }

        const debugToggle = document.getElementById('debugToggle');
        const debugExport = document.getElementById('debugExport');
        const debugPanel = document.getElementById('debugPanel');
        if (debugToggle && debugPanel) {
            debugToggle.addEventListener('click', () => {
                const show = debugPanel.style.display === 'none';
                debugPanel.style.display = show ? 'block' : 'none';
                debugExport.style.display = show ? 'inline-flex' : 'none';
                if (show) this.renderDebugPanel();
            });
        }
        if (debugExport) {
            debugExport.addEventListener('click', () => this.exportDebugJson());
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

            // Normalize URL: if we have an active event but current URL is not event-scoped, guard against loops
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                const isEventScoped = parts.includes('event') && parts[parts.indexOf('event') + 1];
                const isGoldPage = parts.includes('gold');
                const triedKey = `gold_norm_${this.currentEventId}`;
                if (!isEventScoped && isGoldPage && this.currentEventId) {
                    if (!sessionStorage.getItem(triedKey)) {
                        sessionStorage.setItem(triedKey, '1');
                        window.location.replace(`/event/${this.currentEventId}/gold`);
                        return;
                    }
                }
            } catch {}

            if (eventIdFromUrl) {
                localStorage.setItem('activeEventSession', eventIdFromUrl);
                if (typeof updateRaidBar === 'function') {
                    setTimeout(() => updateRaidBar(), 0);
                }
            }
            
            // Gate by auth status and management role for certain sections
            const user = await (await fetch('/user').catch(()=>({ok:false})) ).json().catch(()=>({loggedIn:false}))
            if (!user || !user.loggedIn) {
                this.showAuthGate();
                return;
            }

            // Hide Gargul export for non-management
            try {
                const gargul = document.getElementById('gargulExportSection');
                if (gargul) gargul.style.display = (user.hasManagementRole ? 'block' : 'none');
            } catch {}

            if (!this.currentEventId) { this.showError('No active event session found. Please select an event from the events page.'); return; }

            console.log('Loading gold pot data for event:', this.currentEventId);
            
            // Fetch base data in parallel (players from logs/confirmed list only)
            const [eventData, playersData, goldPot] = await Promise.all([
                this.fetchEventDetails(),
                this.fetchConfirmedPlayers(),
                this.fetchGoldPot()
            ]);

            // Store mapping name -> discordId from confirmed players (for DM tools)
            try {
                this.nameToDiscordId = new Map();
                (Array.isArray(playersData) ? playersData : []).forEach(row => {
                    const nm = String(row?.character_name || '').trim();
                    const id = String(row?.discord_id || '').trim();
                    if (nm && id) this.nameToDiscordId.set(nm.toLowerCase(), id);
                });
            } catch {}

            // Store and display players
            // Canonical engine fetch; prefer engine (default) in auto mode; always engine in manual mode
            const pref = localStorage.getItem('gold_use_engine_auto');
            const preferEngineAuto = (pref === null || pref === '1');
            let engineAvailable = false;
            let eff = null;
            try {
                const resp = await fetch(`/api/rewards/${this.currentEventId}/effective`).catch(()=>null);
                engineAvailable = !!(resp && resp.ok);
                eff = engineAvailable ? await resp.json() : null;
            } catch {}
            if (eff && eff.success) {
                if (eff.mode === 'manual' || preferEngineAuto) {
                    // Use engine result
                    this.engineResult = eff;
                    this.snapshotLocked = (eff.mode === 'manual');
                    // Ensure realms are loaded for Gargul export
                    try { await this.fetchNameRealms(); } catch {}
                    // Build players list from engine players
                    this.allPlayers = (eff.players||[]).map(p=>({ character_name:p.name, character_class:p.class||'Unknown' }));
                    // Build totals map
                    this.playerTotals = new Map(Object.entries(eff.totals||{}).map(([k,v])=>[k, { name:v.name, class:v.class, points:v.points, gold:v.gold }]));
                    // Gold meta
                    this.totalGoldPot = Number(eff.meta?.totalGoldPot||0);
                    this.sharedGoldPot = Number(eff.meta?.sharedGoldPot||0);
                    this.sharedGoldPotAdjusted = Number(eff.meta?.sharedGoldPotAdjusted||this.sharedGoldPot);
                    this.manualGoldPayoutTotal = Number(eff.meta?.manualGoldPayoutTotal||0);
                    this.totalPointsAll = Number(eff.meta?.totalPointsAll||0);
                    this.goldPerPoint = Number(eff.meta?.goldPerPoint||0);
                    // Render directly and show engine banner
                    this.renderSummaryAndList();
                    this.showContent();
                    try {
                        const banner = document.getElementById('engineBanner');
                        if (banner) { banner.style.display = 'none'; }
                        const parityBtn = document.getElementById('parityBtn');
                        const parityStatus = document.getElementById('parityStatus');
                        if (parityBtn) parityBtn.disabled = true;
                        if (parityStatus) parityStatus.textContent = 'N/A (engine in use)';
                        // Toggle only visible in engine auto mode
                        const toggleWrap = document.getElementById('computeToggle');
                        const toggle = document.getElementById('engineToggle');
                        if (toggleWrap && toggle) {
                            toggleWrap.style.display = (eff.mode === 'manual') ? 'none' : 'block';
                            toggle.checked = true;
                            toggle.onchange = () => { localStorage.setItem('gold_use_engine_auto', toggle.checked ? '1' : '0'); location.reload(); };
                        }
                    } catch {}
                    return;
                }
                // Engine available but user prefers legacy in auto mode; fall through to legacy compute
            }

            // Fetch raidlogs datasets needed to compute points (legacy path)
            await this.fetchRaidlogsDatasets();
            // Fetch realms from stored WCL summary JSON for this event
            await this.fetchNameRealms();
            // Compute manual gold payouts (from manual rewards marked as gold)
            try {
                const arr = Array.isArray(this.datasets.manualRewardsData) ? this.datasets.manualRewardsData : [];
                this.manualGoldPayoutTotal = arr.reduce((acc, e) => {
                    const isGold = !!(e && e.is_gold);
                    const val = Number(e && e.points) || 0;
                    return isGold && val > 0 ? acc + val : acc;
                }, 0);
            } catch { this.manualGoldPayoutTotal = 0; }
            // Fetch snapshot status/entries to mirror manual mode
            await this.fetchSnapshotStatus();
            if (this.snapshotLocked) {
                await this.fetchSnapshotData();
            }
            // Fetch primary roles mapping to mirror raidlogs computed logic
            await this.fetchPrimaryRoles();
            // Fetch assigned tanks (from assignments Tanking panel)
            await this.fetchAssignedTanks();
            // Reconcile players strictly to confirmed logData roster and dedupe
            this.reconcilePlayersWithLogData(playersData || []);
            // Compute totals per player
            this.computeTotals();
            // Render summary and list
            this.renderSummaryAndList();
            
            // Show content
            this.showContent();
            // Debug parity UI removed
            
        } catch (error) {
            console.error('Error loading gold pot data:', error);
            this.showError(error.message || 'Failed to load gold pot data');
        }
    }

    async fetchSnapshotStatus() {
        try {
            const res = await fetch(`/api/rewards-snapshot/${this.currentEventId}/status`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.success) {
                this.snapshotLocked = !!data.locked;
            }
        } catch {}
    }

    async fetchSnapshotData() {
        try {
            const res = await fetch(`/api/rewards-snapshot/${this.currentEventId}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.success) {
                this.snapshotEntries = data.data || [];
            }
        } catch {}
    }

    async fetchPrimaryRoles() {
        if (!this.currentEventId) return;
        try {
            const res = await fetch(`/api/player-role-mapping/${this.currentEventId}/primary-roles`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.success && data.primaryRoles) {
                this.primaryRoles = data.primaryRoles; // map of lowercased name -> 'dps' | 'healer' | 'tank'
            }
        } catch {}
    }

    // Populate assignedTanks from the main Tanking panel (skull, cross, square, moon)
    async fetchAssignedTanks() {
        this.assignedTanks = new Set();
        if (!this.currentEventId) return;
        try {
            const res = await fetch(`/api/assignments/${this.currentEventId}`);
            const data = await res.json();
            if (!data || !data.success) return;
            const panels = Array.isArray(data.panels) ? data.panels : [];
            const tankingPanel = panels.find(p => String(p.boss || '').toLowerCase() === 'tanking' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'))
                                || panels.find(p => String(p.boss || '').toLowerCase() === 'tanking');
            if (!tankingPanel || !Array.isArray(tankingPanel.entries)) return;
            const pickByMarker = (marker) => {
                const e = tankingPanel.entries.find(en => String(en.marker_icon_url || '').toLowerCase().includes(marker));
                const nm = (e && e.character_name) ? String(e.character_name).trim() : '';
                return nm ? nm.toLowerCase() : '';
            };
            ['skull','cross','square','moon'].forEach(m => {
                const nameKey = pickByMarker(m);
                if (nameKey) this.assignedTanks.add(nameKey);
            });
        } catch {}
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
            [`/api/windfury-data/${id}`, 'windfuryData'],
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
                    else {
                        const arr = (json.data || json.settings || json) && (json.data || []);
                        if (key === 'manualRewardsData') {
                            this.datasets[key] = (arr || []).map(e => ({ ...e, is_gold: !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||'')))) }));
                        } else {
                            this.datasets[key] = arr;
                        }
                    }
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

    // removed duplicate computeTotals (legacy)

    // Compute totals consistent with raidlogs (computed vs manual modes)
    computeTotals() {
        // Map of lowercase name to { class, points }
        const nameToPlayer = new Map();
        this.allPlayers.forEach(p => {
            nameToPlayer.set(String(p.character_name).toLowerCase(), { name: p.character_name, class: p.character_class, points: 0 });
        });

        // Base points
        nameToPlayer.forEach(v => { v.points += 100; });

        const confirmedNames = new Set((this.logData||[]).filter(p=>!this.shouldIgnorePlayer(p.character_name)).map(p=>String(p.character_name||'').toLowerCase()));

        if (this.snapshotLocked && Array.isArray(this.snapshotEntries) && this.snapshotEntries.length > 0) {
            // Build snapshot sums per panel and name
            const lower = s=>String(s||'').toLowerCase();
            const snapByPanelAndName = new Map();
            const put = (panelKey, characterName, points) => {
                const k = `${panelKey}__${lower(characterName)}`;
                snapByPanelAndName.set(k, (snapByPanelAndName.get(k)||0) + points);
            };
            (this.snapshotEntries||[]).forEach(r=>{
                const pts = Number(r.point_value_edited != null ? r.point_value_edited : r.point_value_original) || 0;
                if (!pts) return;
                put(r.panel_key, r.character_name, pts);
            });
            const mapFromPanel = (panelKey) => {
                const m = new Map();
                snapByPanelAndName.forEach((v, k) => {
                    const [pk, nm] = k.split('__');
                    if (pk === panelKey) m.set(nm, v);
                });
                return m;
            };
            const addMap = (m)=>{ m.forEach((v, nm)=>{ const p=nameToPlayer.get(nm); if(p) p.points+=v; }); };
            // Per-panel adds
            addMap(mapFromPanel('damage'));
            addMap(mapFromPanel('healing'));
            addMap(mapFromPanel('god_gamer_dps'));
            addMap(mapFromPanel('god_gamer_healer'));
            addMap(mapFromPanel('abilities'));
            addMap(mapFromPanel('mana_potions'));
            addMap(mapFromPanel('runes'));
            addMap(mapFromPanel('windfury_totems'));
            addMap(mapFromPanel('interrupts'));
            addMap(mapFromPanel('disarms'));
            // Snapshot mode: respect snapshot values as-is (they already reflect any manual edits)
            addMap(mapFromPanel('curse_recklessness'));
            addMap(mapFromPanel('curse_shadow'));
            addMap(mapFromPanel('curse_elements'));
            addMap(mapFromPanel('faerie_fire'));
            addMap(mapFromPanel('scorch'));
            addMap(mapFromPanel('demo_shout'));
            addMap(mapFromPanel('polymorph'));
            addMap(mapFromPanel('power_infusion'));
            addMap(mapFromPanel('decurses'));
            addMap(mapFromPanel('frost_resistance'));
            addMap(mapFromPanel('world_buffs_copy'));
            addMap(mapFromPanel('void_damage'));
            addMap(mapFromPanel('shaman_healers'));
            addMap(mapFromPanel('priest_healers'));
            addMap(mapFromPanel('druid_healers'));
            addMap(mapFromPanel('too_low_damage'));
            addMap(mapFromPanel('too_low_healing'));
            addMap(mapFromPanel('attendance_streaks'));
            addMap(mapFromPanel('guild_members'));
            addMap(mapFromPanel('big_buyer'));

            // Manual rewards (only for confirmed players) — exclude gold payouts from points
            (this.datasets.manualRewardsData||[]).forEach(e=>{
                const k=String(e.player_name||'').toLowerCase();
                if(!confirmedNames.has(k)) return;
                const isGold = !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||''))));
                if (isGold) return; // do not add to points
                const p=nameToPlayer.get(k); if(p) p.points+=(Number(e.points)||0);
            });
        } else {
            // Computed mode: use datasets + derived awards
            const damagePoints = this.rewardSettings.damage?.points_array || [];
            const damageSorted = (this.logData || [])
                .filter(p => !this.shouldIgnorePlayer(p.character_name))
                .filter(p => ((p.role_detected||'').toLowerCase()==='dps' || (p.role_detected||'').toLowerCase()==='tank') && (parseInt(p.damage_amount)||0)>0)
                .sort((a,b)=>(parseInt(b.damage_amount)||0)-(parseInt(a.damage_amount)||0));
            damageSorted.forEach((p, idx) => { const pts = idx < damagePoints.length ? (damagePoints[idx] || 0) : 0; const v = nameToPlayer.get(String(p.character_name).toLowerCase()); if (v && pts) v.points += pts; });

            const healingPoints = this.rewardSettings.healing?.points_array || [];
            const healers = (this.logData || [])
                .filter(p => !this.shouldIgnorePlayer(p.character_name))
                .filter(p => {
                    const nameKey = String(p.character_name||'').trim().toLowerCase();
                    const primaryRole = this.primaryRoles ? String(this.primaryRoles[nameKey]||'').toLowerCase() : '';
                    const detected = String(p.role_detected||'').toLowerCase();
                    const isHealer = (primaryRole === 'healer') || (detected === 'healer');
                    return isHealer && (parseInt(p.healing_amount)||0)>0;
                })
                .sort((a,b)=>(parseInt(b.healing_amount)||0)-(parseInt(a.healing_amount)||0));
            healers.forEach((p, idx) => { const pts = idx < healingPoints.length ? (healingPoints[idx] || 0) : 0; const v = nameToPlayer.get(String(p.character_name).toLowerCase()); if (v && pts) v.points += pts; });

            const addFrom = (arr) => { (arr||[]).forEach(row => { const nm=String(row.character_name||row.player_name||'').toLowerCase(); const v=nameToPlayer.get(nm); if(!v) return; const pts=Number(row.points)||0; v.points+=pts; }); };
            addFrom(this.datasets.abilitiesData);
            addFrom(this.datasets.windfuryData);
            addFrom(this.datasets.rocketHelmetData);
            addFrom(this.datasets.manaPotionsData);
            addFrom(this.datasets.runesData);
            addFrom(this.datasets.interruptsData);
            addFrom(this.datasets.disarmsData);
            // Sunder: compute points from sunder_count, excluding only assigned tanks; mirror raidlogs thresholds
            (function computeSunder(self){
                const rows = Array.isArray(self.datasets.sunderData) ? self.datasets.sunderData : [];
                if (!rows.length) return;
                const lower = s=>String(s||'').toLowerCase();
                const eligible = rows.filter(r => {
                    const nm = lower(r.character_name || r.player_name || '');
                    if (!confirmedNames.has(nm)) return false;
                    if (self.isTankForEvent(nm)) return false;
                    return true;
                });
                if (!eligible.length) return;
                const counts = eligible.map(r => Number(r.sunder_count)||0);
                const avg = counts.reduce((a,b)=>a+b,0) / eligible.length;
                if (!(avg > 0)) return;
                const computePts = (count) => {
                    const pct = (Number(count)||0) / avg * 100;
                    if (pct < 25) return -20;
                    if (pct < 50) return -15;
                    if (pct < 75) return -10;
                    if (pct < 90) return -5;
                    if (pct <= 109) return 0;
                    if (pct <= 124) return 5;
                    return 10;
                };
                rows.forEach(r => {
                    const nm = lower(r.character_name || r.player_name || '');
                    if (!confirmedNames.has(nm)) return;
                    if (self.isTankForEvent(nm)) return;
                    const v = nameToPlayer.get(nm);
                    if (!v) return;
                    const pts = computePts(r.sunder_count);
                    if (pts) v.points += pts; // include negatives
                });
            })(this);
            addFrom(this.datasets.curseData);
            addFrom(this.datasets.curseShadowData);
            addFrom(this.datasets.curseElementsData);
            addFrom(this.datasets.faerieFireData);
            addFrom(this.datasets.scorchData);
            addFrom(this.datasets.demoShoutData);
            addFrom(this.datasets.polymorphData);
            addFrom(this.datasets.powerInfusionData);
            addFrom(this.datasets.decursesData);
            // Frost Resistance: DPS-only (mirror raidlogs panel) — require explicit primary role mapping
            if (this.primaryRoles) {
                (this.datasets.frostResistanceData || []).forEach(row => {
                    const nameKey = String(row.character_name || row.player_name || '').trim().toLowerCase();
                    const v = nameToPlayer.get(nameKey);
                    if (!v) return;
                    const pr = String(this.primaryRoles[nameKey] || '').toLowerCase();
                    if (pr !== 'dps') return; // only DPS qualifies
                    const pts = Number(row.points) || 0;
                    v.points += pts;
                });
            }
            addFrom(this.datasets.worldBuffsData);
            addFrom(this.datasets.voidDamageData);
            addFrom(this.datasets.bigBuyerData);

            (this.datasets.playerStreaks||[]).forEach(r=>{ const key=String(r.character_name||'').toLowerCase(); const v=nameToPlayer.get(key); if(!v) return; const s=Number(r.player_streak)||0; let pts=0; if(s>=8)pts=15; else if(s===7)pts=12; else if(s===6)pts=9; else if(s===5)pts=6; else if(s===4)pts=3; v.points+=pts; });
            (this.datasets.guildMembers||[]).forEach(r=>{ const key=String(r.character_name||'').toLowerCase(); const v=nameToPlayer.get(key); if(v) v.points+=10; });

            // Manual rewards (only confirmed) — exclude gold payouts from points
            (this.datasets.manualRewardsData||[]).forEach(e=>{ const key=String(e.player_name||'').toLowerCase(); if(!confirmedNames.has(key)) return; const isGold=!!(e&&(e.is_gold||/\[GOLD\]/i.test(String(e.description||'')))); if(isGold) return; const v=nameToPlayer.get(key); if(v) v.points+=(Number(e.points)||0); });

            // God Gamer awards
            if (damageSorted.length>=2){ const diff=(parseInt(damageSorted[0].damage_amount)||0)-(parseInt(damageSorted[1].damage_amount)||0); let pts=0; if(diff>=250000)pts=30; else if(diff>=150000)pts=20; const key=String(damageSorted[0].character_name||'').toLowerCase(); const v=nameToPlayer.get(key); if(v) v.points+=pts; }
            if (healers.length>=2){ const diff=(parseInt(healers[0].healing_amount)||0)-(parseInt(healers[1].healing_amount)||0); let pts=0; if(diff>=250000)pts=20; else if(diff>=150000)pts=15; const key=String(healers[0].character_name||'').toLowerCase(); const v=nameToPlayer.get(key); if(v) v.points+=pts; }

            // Class-specific healer awards
            const byClass = (arr, cls) => arr.filter(p => String(p.character_class||'').toLowerCase().includes(cls));
            const shamans = byClass(healers,'shaman').slice(0,3); const priests=byClass(healers,'priest').slice(0,2); const druids=byClass(healers,'druid').slice(0,1);
            const award = (players, ptsArr)=>{ players.forEach((p,i)=>{ const key=String(p.character_name||'').toLowerCase(); const v=nameToPlayer.get(key); if(v) v.points+=(ptsArr[i]||0); }); };
            award(shamans,[25,20,15]); award(priests,[20,15]); award(druids,[15]);

            // Too Low DPS/HPS (exclude non-players) – only when we have primaryRoles mapping
            const aftMin = this.datasets.raidStats?.stats?.activeFightTime;
            if (aftMin && this.primaryRoles) {
                const sec = aftMin * 60;
                (this.logData || []).forEach(p => {
                    if (this.shouldIgnorePlayer(p.character_name)) return;
                    const key = String(p.character_name || '').trim().toLowerCase();
                    const role = String(this.primaryRoles[key] || '').toLowerCase();
                    const v = nameToPlayer.get(key); if (!v) return;
                    if (role === 'dps') {
                        const dps = (parseFloat(p.damage_amount) || 0) / sec; let pts = 0;
                        if (dps < 150) pts = -100; else if (dps < 200) pts = -50; else if (dps < 250) pts = -25;
                        v.points += pts;
                    } else if (role === 'healer') {
                        const hps = (parseFloat(p.healing_amount) || 0) / sec; let pts = 0;
                        if (hps < 85) pts = -100; else if (hps < 100) pts = -50; else if (hps < 125) pts = -25;
                        v.points += pts;
                    }
                });
            }
        }

        // Totals
        let totalPointsAll=0; nameToPlayer.forEach(v=>{ totalPointsAll+=Math.max(0, v.points); }); this.totalPointsAll=totalPointsAll;
        const baseShared2 = Number(this.sharedGoldPot) || 0;
        const payout2 = Number(this.manualGoldPayoutTotal) || 0;
        const adjustedShared2 = Math.max(0, baseShared2 - payout2);
        this.sharedGoldPotAdjusted = adjustedShared2;
        const gpp=(adjustedShared2>0&&totalPointsAll>0)? adjustedShared2/totalPointsAll : 0; this.goldPerPoint=gpp; nameToPlayer.forEach(v=>{ const effPts=Math.max(0, v.points); v.gold=Math.floor(effPts*gpp); });

        // Add manual gold payouts directly to player gold (no points impact)
        try {
            (this.datasets.manualRewardsData||[]).forEach(e=>{
                const key=String(e.player_name||'').toLowerCase();
                if(!confirmedNames.has(key)) return;
                const isGold=!!(e&&(e.is_gold||/\[GOLD\]/i.test(String(e.description||''))));
                if(!isGold) return;
                const amt=Number(e.points)||0; if(!(amt>0)) return;
                const v=nameToPlayer.get(key); if(v) v.gold = Math.max(0, (Number(v.gold)||0) + amt);
            });
        } catch {}
        this.playerTotals=nameToPlayer;
    }

    renderSummaryAndList() {
        // Summary
        const players = this.allPlayers;
        const playersCountEl = document.getElementById('playersCount');
        const playersTooltip = document.getElementById('playersTooltip');
        const totalPointsEl = document.getElementById('totalPoints');
        const totalGoldEl = document.getElementById('totalGold');
        if (playersCountEl) {
            const count = (players?.length || 0);
            playersCountEl.textContent = count.toLocaleString();
            // Highlight in red when not a full 40-player raid
            playersCountEl.style.color = (count === 40 ? '#f0f0f0' : '#ef4444');
        }
        if (playersTooltip) playersTooltip.innerHTML = players.map(p=>{
            const key = String(p.character_name||'').trim().toLowerCase();
            const realm = this.nameToRealm.get(key);
            const nm = p.character_name;
            return `<div title="${realm?`${nm}-${realm}`:nm}">${nm}</div>`;
        }).join('');
        const card = document.getElementById('cardPlayers');
        if (card && playersTooltip) {
            let timer=null; let shown=false;
            const show=()=>{ playersTooltip.style.display='block'; shown=true; };
            const hide=()=>{ playersTooltip.style.display='none'; shown=false; };
            card.onmouseenter=()=>{ timer=setTimeout(show,350); };
            card.onmousemove=()=>{ if(!shown){ clearTimeout(timer); timer=setTimeout(show,350);} };
            card.onmouseleave=()=>{ clearTimeout(timer); hide(); };
        }
        if (totalPointsEl) totalPointsEl.textContent = Math.round(this.totalPointsAll).toLocaleString();

        if (totalGoldEl) {
            const baseShared = Number(this.sharedGoldPot) || 0;
            const payout = Number(this.manualGoldPayoutTotal) || 0;
            const adjusted = Math.max(0, baseShared - payout);
            totalGoldEl.textContent = Number(adjusted).toLocaleString();
            // Show bracketed deduction under value
            let det = document.getElementById('gold-shared-deduction-goldpage');
            if (!det) {
                const card = totalGoldEl.closest('.card');
                if (card) {
                    det = document.createElement('div');
                    det.id = 'gold-shared-deduction-goldpage';
                    det.style.fontSize = '12px';
                    det.style.color = '#9ca3af';
                    det.style.marginTop = '2px';
                    card.appendChild(det);
                }
            }
            if (det) det.textContent = payout > 0 ? `(-${payout.toLocaleString()} gold)` : '';
        }
        const avgEl = document.getElementById('averageGold');
        if (avgEl) {
            const count = (this.allPlayers?.length || 0);
            const baseShared = Number(this.sharedGoldPot) || 0;
            const payout = Number(this.manualGoldPayoutTotal) || 0;
            const adjusted = Math.max(0, baseShared - payout);
            const avg = count > 0 ? Math.floor(adjusted / count) : 0;
            avgEl.textContent = Number(avg).toLocaleString();
        }

        // Players grid of cards
        const grid = document.getElementById('playersGrid');
        if (!grid) return;
        const sorted = this.allPlayers.slice().sort((a,b)=>{
            const order = ['warrior','rogue','hunter','mage','warlock','shaman','paladin','priest','druid'];
            const ai = order.indexOf(String(a.character_class||'').toLowerCase());
            const bi = order.indexOf(String(b.character_class||'').toLowerCase());
            if (ai !== bi) return ai - bi;
            return String(a.character_name||'').localeCompare(String(b.character_name||''));
        });
        const classColor = (cls)=>{
            const m={
                'warrior':'#C79C6E','paladin':'#F58CBA','hunter':'#ABD473','rogue':'#FFF569','priest':'#FFFFFF','shaman':'#0070DE','mage':'#69CCF0','warlock':'#9482C9','druid':'#FF7D0A','unknown':'#9CA3AF'
            }; return m[String(cls||'unknown').toLowerCase()]||'#9CA3AF';
        };
        const specIcon = (cls)=>{
            const icon={
                'warrior':'https://wow.zamimg.com/images/wow/icons/large/class_warrior.jpg',
                'paladin':'https://wow.zamimg.com/images/wow/icons/large/class_paladin.jpg',
                'hunter':'https://wow.zamimg.com/images/wow/icons/large/class_hunter.jpg',
                'rogue':'https://wow.zamimg.com/images/wow/icons/large/class_rogue.jpg',
                'priest':'https://wow.zamimg.com/images/wow/icons/large/class_priest.jpg',
                'shaman':'https://wow.zamimg.com/images/wow/icons/large/class_shaman.jpg',
                'mage':'https://wow.zamimg.com/images/wow/icons/large/class_mage.jpg',
                'warlock':'https://wow.zamimg.com/images/wow/icons/large/class_warlock.jpg',
                'druid':'https://wow.zamimg.com/images/wow/icons/large/class_druid.jpg'
            }; const key=String(cls||'unknown').toLowerCase(); return icon[key]||icon['warrior'];
        };
        const cards = [];
        sorted.forEach(p=>{
            const key = String(p.character_name||'').trim().toLowerCase();
            const totals = this.playerTotals.get(key) || { points:0, gold:0 };
            const bg = classColor(p.character_class);
            const icon = specIcon(p.character_class);
            const rows = this.buildPlayerBreakdownRows(key);
            const realm = this.nameToRealm.get(String(p.character_name||'').trim().toLowerCase());
            const title = realm ? `${p.character_name}-${realm}` : p.character_name;
            cards.push(`
                <div class="player-stack" style="display:flex; flex-direction:column; gap:0; align-items:center;">
                    <div class="player-card" style="background:${bg}; display:flex; align-items:center; border-bottom-left-radius:0; border-bottom-right-radius:0; margin-bottom:0;">
                        <img src="${icon}" alt="${p.character_class}" width="50" height="50" style="border-radius:6px; flex-shrink:0; margin-top:0; margin-right:12px;">
                        <div style="display:flex; flex-direction:column; color:#111; margin-top:0; justify-content:center;">
                            <div style="font-weight:900; font-size:20px; line-height:1.1; margin-top:2px;" title="${title}">${p.character_name}</div>
                        </div>
                    </div>
                    <div class="player-breakdown" style="background:${bg}; border-top-left-radius:0; border-top-right-radius:0; border-bottom-left-radius:12px; border-bottom-right-radius:12px; margin-top:0; padding:10px 12px 62px 12px; position:relative;">
                        ${rows}
                    </div>
                </div>
            `);
        });
        grid.innerHTML = cards.join('');
        // Show content
        this.showContent();

        // Normalize heights after render and image load
        const normalize = () => this.normalizePlayerCardHeights();
        setTimeout(normalize, 0);
        setTimeout(normalize, 300);
        setTimeout(normalize, 1000);
        if (!this._resizeHooked) {
            window.addEventListener('resize', normalize);
            this._resizeHooked = true;
        }

        // Apply numeric color classes inside breakdowns
        this._normalizeBreakdownColors();
        const mo = new MutationObserver(this._normalizeBreakdownColors);
        mo.observe(grid, { childList: true, subtree: true });
        this._breakdownObserver = mo;

        // Populate Gargul export
        this.populateGargulExport(sorted);
    }

    _normalizeBreakdownColors(){
        try{
            const rows = document.querySelectorAll('.player-breakdown .player-breakdown-row');
            rows.forEach(row=>{
                // second and third columns are points and gold
                const cols = row.querySelectorAll('div');
                if (cols.length >= 3) {
                    const ptsEl = cols[1];
                    const goldEl = cols[2];
                    // Remove previous flags
                    [row, ptsEl, goldEl].forEach(el=>{ el.classList && (el.classList.remove('val-positive','val-negative','val-zero','row-positive','row-negative')); });
                    // Parse signed numbers (text may include + prefix)
                    const parseSigned = (el)=>{
                        const s = (el && el.textContent) ? el.textContent : '';
                        const m = s.match(/[+\-]?\d+/);
                        return m ? parseInt(m[0],10) : 0;
                    };
                    const pts = parseSigned(ptsEl);
                    const gold = parseSigned(goldEl);
                    // Text stays white; set row background state by sign precedence: gold, then points
                    if (gold > 0 || pts > 0) row.classList.add('row-positive');
                    else if (gold < 0 || pts < 0) row.classList.add('row-negative');
                    // Keep value classes for potential future use (but text color is white by CSS)
                    if (pts > 0) ptsEl.classList.add('val-positive'); else if (pts < 0) ptsEl.classList.add('val-negative'); else ptsEl.classList.add('val-zero');
                    if (gold > 0) goldEl.classList.add('val-positive'); else if (gold < 0) goldEl.classList.add('val-negative'); else goldEl.classList.add('val-zero');
                }
            });
        }catch{}
    }

    // Build name -> realm mapping from stored WCL summary JSON for this event
    async fetchNameRealms(){
        this.nameToRealm = new Map();
        this._defaultRealm = null;
        try {
            // Try robust server-side realms helper first
            try {
                const rel = await fetch(`/api/event-realms/${this.currentEventId}?ts=${Date.now()}`, { cache: 'no-store' });
                if (rel && rel.ok) {
                    const data = await rel.json();
                    const realmsObj = (data && data.realms) ? data.realms : {};
                    Object.entries(realmsObj).forEach(([ln, rm])=>{ const k=String(ln||'').trim(); const v=String(rm||'').trim(); if(k&&v) this.nameToRealm.set(k, v); });
                    if (data && data.defaultRealm) this._defaultRealm = String(data.defaultRealm);
                    if (this.nameToRealm.size > 0) { console.log('[Gold] Realms via server helper:', this.nameToRealm.size); return; }
                }
            } catch {}

            // Important: avoid caches; ensure we read fresh JSON from server
            const resp = await fetch(`/api/event-endpoints-json/${this.currentEventId}?ts=${Date.now()}`, { cache: 'no-store' });
            if (!resp.ok) return;
            const body = await resp.json();
            const d = body && body.data;
            // If server stored a direct realms_json mapping, prefer it
            try {
                const obj = d && d.realms_json;
                if (obj && typeof obj === 'object') {
                    Object.entries(obj).forEach(([ln, rm])=>{ const k=String(ln||'').trim(); const v=String(rm||'').trim(); if(k&&v) this.nameToRealm.set(k.toLowerCase(), v); });
                    if (this.nameToRealm.size > 0) { console.log('[Gold] Realms via stored realms_json:', this.nameToRealm.size); return; }
                }
            } catch {}
            const wcl = d && d.wcl_summary_json;
            const fights = d && d.fights_json;
            // Helper: extract realm/server from various shapes
            const getRealm = (obj)=>{
                if (!obj) return '';
                // direct string
                if (typeof obj.server === 'string' && obj.server) return String(obj.server).trim();
                // object with name/slug
                if (obj.server && typeof obj.server === 'object') {
                    const cand = obj.server.name || obj.server.slug || obj.server.serverName || obj.server.realm || '';
                    if (cand) return String(cand).trim();
                }
                // other common fields
                const direct = obj.serverSlug || obj.serverName || obj.realm || obj.realmSlug || '';
                if (direct) return String(direct).trim();
                return '';
            };
            const put = (name, realm)=>{
                const n = String(name||'').trim();
                const r = String(realm||'').trim();
                if (n && r) this.nameToRealm.set(n.toLowerCase(), r);
            };
            const collectFromArray = (arr)=>{
                (arr||[]).forEach(p => {
                    const name = String(p?.name||p?.character_name||p?.playerName||p?.characterName||'').trim();
                    const realm = getRealm(p);
                    if (name && realm) put(name, realm);
                });
            };
            if (Array.isArray(wcl)) {
                collectFromArray(wcl);
            } else if (wcl && typeof wcl === 'object') {
                Object.values(wcl).forEach(ev => {
                    const comp = ev?.summary?.composition || ev?.composition || ev?.summary?.participants || ev?.participants || [];
                    collectFromArray(comp);
                });
            }
            // Extra fallback: fights JSON friendlies often contains server (sometimes nested under .server or as serverSlug)
            if (fights && Array.isArray(fights.friendlies)) {
                collectFromArray(fights.friendlies);
            }
            // Deep walk fallback: scan both blobs for any node with a name and recognizable server field
            try {
                const visit = (node) => {
                    if (!node || typeof node !== 'object') return;
                    const name = String(node.name || node.playerName || node.characterName || '').trim();
                    const realm = getRealm(node);
                    if (name && realm) put(name, realm);
                    if (Array.isArray(node)) { node.forEach(visit); return; }
                    Object.values(node).forEach(visit);
                };
                if (wcl) visit(wcl);
                if (fights) visit(fights);
            } catch {}
            console.log('[Gold] Built name→realm map entries:', this.nameToRealm.size);

            // Additionally collect Goblin Rocket Helmet users for +5 points panel
            try {
                const users = new Set();
                const wanted = 'Goblin Rocket Helmet';
                const friendlies = (fights && Array.isArray(fights.friendlies)) ? fights.friendlies : [];
                const nameToClass = new Map();
                (friendlies||[]).forEach(f => { if (f && f.name && f.type) nameToClass.set(String(f.name), String(f.type)); });
                function walk(node){
                    if(!node||typeof node!=='object') return;
                    if(node.combatantInfo && Array.isArray(node.combatantInfo.gear) && (node.name||node.playerName||node.characterName)){
                        const gear = node.combatantInfo.gear;
                        if(gear.some(it=>it&&it.name===wanted)){
                            users.add(String(node.name||node.playerName||node.characterName));
                        }
                    }
                    if(Array.isArray(node)) node.forEach(walk); else Object.values(node).forEach(walk);
                }
                walk(wcl);
                this.datasets.rocketHelmetData = Array.from(users).map(name => ({ character_name: name, character_class: nameToClass.get(name) || 'Unknown', points: 5 }));
            } catch { this.datasets.rocketHelmetData = []; }
        } catch {}
    }

    getDefaultRealm(){
        if (this._defaultRealm) return this._defaultRealm;
        try {
            const counts = new Map();
            this.nameToRealm.forEach((realm)=>{
                const r = String(realm||'').trim(); if (!r) return;
                counts.set(r, (counts.get(r)||0)+1);
            });
            let best=null, bestCnt=0;
            counts.forEach((cnt, realm)=>{ if (cnt>bestCnt){ bestCnt=cnt; best=realm; } });
            this._defaultRealm = best || null;
            if (!this._defaultRealm) {
                // Fallback: remember last known realm from previous events
                try {
                    const cached = localStorage.getItem('gold_lastRealm') || '';
                    if (cached) this._defaultRealm = cached;
                } catch {}
            } else {
                // Persist for future events where realm data is missing
                try { localStorage.setItem('gold_lastRealm', this._defaultRealm); } catch {}
            }
            return this._defaultRealm;
        } catch { return null; }
    }

    getDisplayNameWithRealm(name){
        const raw = String(name||'').trim();
        if (!raw) return '';
        const realm = this.nameToRealm.get(raw.toLowerCase());
        return realm ? `${raw}-${realm}` : raw;
    }

    async populateGargulExport(sortedPlayers){
        try {
            const ta = document.getElementById('gargulExport');
            if (!ta) return;
            const lines = ['Player,Gold'];
            const goldMap = new Map();
            const pushGold = (nameWithRealm, amount) => {
                if (!nameWithRealm) return;
                const prev = goldMap.get(nameWithRealm) || 0;
                goldMap.set(nameWithRealm, Math.max(0, prev + Math.max(0, Number(amount)||0)));
            };

            // Player rows (always ensure realms are present before composing Gargul)
            if (!this.nameToRealm || this.nameToRealm.size === 0) {
                try { await this.fetchNameRealms(); } catch {}
            }
            const allowDefaultRealm = (this.nameToRealm && this.nameToRealm.size > 0);
            sortedPlayers.forEach(p => {
                const key = String(p.character_name||'').trim().toLowerCase();
                const totals = this.playerTotals.get(key) || { gold: 0 };
                const realm = this.nameToRealm.get(key) || (allowDefaultRealm ? this.getDefaultRealm() : null);
                const nameOut = realm ? `${p.character_name}-${realm}` : p.character_name;
                pushGold(nameOut, Number(totals.gold||0));
            });

            // Management cuts
            const total = Number(this.totalGoldPot)||0;
            const mgmtTotal = Math.floor(total * 0.15);
            let rlPct = 4;
            try {
                const meta = await fetch(`/api/events/${this.currentEventId}/raidleader`).then(r => r.ok ? r.json() : null);
                if (meta && meta.success && meta.raidleaderCut != null) rlPct = Number(meta.raidleaderCut);
            } catch {}
            rlPct = Math.max(0, Math.min(10, isNaN(rlPct) ? 4 : rlPct));
            const helperPct = 3;
            const foundersPct = 2;
            const organizerBasePct = 6;
            let guildbankPct = 0;
            let organizerPct = organizerBasePct;
            if (rlPct < 4) guildbankPct = 4 - rlPct; else if (rlPct > 4) organizerPct = Math.max(0, organizerBasePct - (rlPct - 4));
            const amt = pct => Math.floor(total * (pct / 100));
            let rlAmt = amt(rlPct);
            let helperAmt = amt(helperPct);
            let foundersAmt = amt(foundersPct);
            let organizerAmt = amt(organizerPct);
            let guildbankAmt = amt(guildbankPct);
            let sumParts = rlAmt + helperAmt + foundersAmt + organizerAmt + guildbankAmt;
            let diff = mgmtTotal - sumParts;
            if (diff !== 0) {
                if (organizerPct > 0) organizerAmt += diff; else if (guildbankPct > 0) guildbankAmt += diff; else rlAmt += diff;
            }

            // Organizer → Tftroll-Golemagg
            pushGold('Tftroll-Golemagg', organizerAmt);
            // Helper → Lavol-Ashbringer
            pushGold('Lavol-Ashbringer', helperAmt);
            // Founders → split between Tftroll-Golemagg and Zaappi-Firemaw (odd 1g to Tftroll)
            const foundersHalf = Math.floor(foundersAmt / 2);
            const foundersRemainder = foundersAmt - foundersHalf * 2;
            pushGold('Tftroll-Golemagg', foundersHalf + foundersRemainder);
            pushGold('Zaappi-Firemaw', foundersHalf);
            // Guildbank (if any) → Onepbank-Firemaw
            if (guildbankAmt > 0) pushGold('Onepbank-Firemaw', guildbankAmt);

            // Raidleader → the RL from roster input; map to -realm using nameToRealm (fallback to default realm)
            try {
                const meta = await fetch(`/api/events/${this.currentEventId}/raidleader`).then(r => r.ok ? r.json() : null);
                const rlNameRaw = meta && meta.success ? String(meta.raidleaderName||'').trim() : '';
                if (rlNameRaw) {
                    const allowDefaultRealm = (this.nameToRealm && this.nameToRealm.size > 0);
                    const realm = this.nameToRealm.get(rlNameRaw.toLowerCase()) || (allowDefaultRealm ? this.getDefaultRealm() : null);
                    const nameOut = realm ? `${rlNameRaw}-${realm}` : rlNameRaw;
                    pushGold(nameOut, rlAmt);
                }
            } catch {}

            // Emit lines (in existing display order first, then any added)
            const emitted = new Set();
            sortedPlayers.forEach(p => {
                const key = String(p.character_name||'').trim().toLowerCase();
                const allowDefaultRealm = (this.nameToRealm && this.nameToRealm.size > 0);
                const realm = this.nameToRealm.get(key) || (allowDefaultRealm ? this.getDefaultRealm() : null);
                const nameOut = realm ? `${p.character_name}-${realm}` : p.character_name;
                if (!emitted.has(nameOut) && goldMap.has(nameOut)) {
                    lines.push(`${nameOut},${Number(goldMap.get(nameOut)||0)}`);
                    emitted.add(nameOut);
                }
            });
            Array.from(goldMap.entries()).forEach(([name, amount]) => {
                if (!emitted.has(name)) lines.push(`${name},${Number(amount||0)}`);
            });
            ta.value = lines.join('\n');

            const btn = document.getElementById('copyGargul');
            const status = document.getElementById('gargulCopyStatus');
            if (btn && !btn._wired) {
                btn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(ta.value);
                        if (status) { status.style.display = 'block'; setTimeout(()=> status.style.display='none', 1200); }
                    } catch (e) {
                        ta.select(); document.execCommand('copy'); if (status) { status.style.display='block'; setTimeout(()=> status.style.display='none', 1200); }
                    }
                });
                btn._wired = true;
            }
        } catch {}
    }

    normalizePlayerCardHeights() {
        const grid = document.getElementById('playersGrid');
        if (!grid) return;
        const stacks = Array.from(grid.querySelectorAll(':scope > div'));
        const breakdowns = Array.from(grid.querySelectorAll('.player-breakdown'));
        if (!stacks.length) return;
        // reset before measuring
        stacks.forEach(el => { el.style.minHeight = ''; });
        breakdowns.forEach(el => { el.style.minHeight = ''; });
        let maxStack = 0, maxBreak = 0;
        stacks.forEach(el => { maxStack = Math.max(maxStack, el.offsetHeight || 0); });
        breakdowns.forEach(el => { maxBreak = Math.max(maxBreak, el.scrollHeight || el.offsetHeight || 0); });
        if (maxStack > 0) stacks.forEach(el => { el.style.minHeight = maxStack + 'px'; });
        if (maxBreak > 0) breakdowns.forEach(el => { el.style.minHeight = maxBreak + 'px'; });
    }

    // Determine if a player should be treated as a tank for this event
    isTankForEvent(nameKey) {
        try {
            return this.assignedTanks.has(String(nameKey||'').toLowerCase());
        } catch { return false; }
    }
    
    buildPlayerBreakdownRows(nameKey) {
        const lower = s=>String(s||'').toLowerCase();
        const fmtTitle = (t)=>{
            const full=String(t||'');
            const short = full.length>10 ? full.slice(0,10)+'…' : full;
            return `<span title="${full}">${short}</span>`;
        };
        const gpp = this.goldPerPoint || 0;
        const role = String(this.primaryRoles?.[nameKey] || '').toLowerCase();
        const usingEngine = !!this.engineResult;

        // Collect per-panel contributions similar to raidlogs breakdown order
        const items = [];
        const push = (title, pts) => {
            if (!pts) return;
            const goldVal = Math.floor(pts * gpp);
            items.push({ title, pts, gold: goldVal });
        };

        // Base
        if (usingEngine) {
            const basePanel = (this.engineResult?.panels || []).find(p => p.panel_key === 'base');
            if (basePanel && Array.isArray(basePanel.rows)) {
                const row = basePanel.rows.find(r => lower(r.name) === nameKey);
                if (row && row.points) push('Base', Number(row.points) || 0);
            }
        } else {
            push('Base', 100);
        }

        // Helper to sum points for a name from a dataset
        const sumFrom = (arr)=> (arr||[]).reduce((acc,row)=> acc + (lower(row.character_name||row.player_name||'')===nameKey ? (Number(row.points)||0) : 0), 0);

        // Panels
        if (usingEngine) {
            const labelMap = {
                damage:'Dmg Rank', healing:'Heal Rank', god_gamer_dps:'God Gamer DPS', god_gamer_healer:'God Gamer Heal',
                abilities:'Sappers', mana_potions:'Mana pots', runes:'Runes', windfury_totems:'Totems', interrupts:'Interrupts', disarms:'Disarms',
                curse_recklessness:'Curse Reck', curse_shadow:'Curse Shad', curse_elements:'Curse Elem', faerie_fire:'Faerie Fir', scorch:'Scorch', demo_shout:'Demo Shout',
                polymorph:'Polymorph', power_infusion:'Power Inf', decurses:'Decurses', frost_resistance:'Frost Res', world_buffs_copy:'WorldBuffs',
                void_damage:'Void Dmg', shaman_healers:'Shaman Healer', priest_healers:'Priest Healer', druid_healers:'Druid Healer',
                too_low_damage:'Too Low Dmg', too_low_healing:'Too Low Heal', attendance_streaks:'Streak', guild_members:'Guild Mem', big_buyer:'Big Buyer', manual_points:'Manual'
            };
            (this.engineResult?.panels || []).forEach(p => {
                if (p.panel_key === 'base') return;
                const row = (p.rows || []).find(r => lower(r.name) === nameKey);
                if (!row || !row.points) return;
                const title = labelMap[p.panel_key] || p.panel_key;
                push(title, Number(row.points) || 0);
            });
        } else {
            push('Sappers', sumFrom(this.datasets.abilitiesData));
            push('Totems', sumFrom(this.datasets.windfuryData));
            push('RocketHelm', sumFrom(this.datasets.rocketHelmetData));
            push('Mana pots', sumFrom(this.datasets.manaPotionsData));
            push('Runes', sumFrom(this.datasets.runesData));
            push('Interrupts', sumFrom(this.datasets.interruptsData));
            push('Disarms', sumFrom(this.datasets.disarmsData));
        }
        // Sunder breakdown row: hide for tanks based on assignments; use snapshot when locked
        if (!usingEngine && !this.isTankForEvent(nameKey)) {
            if (this.snapshotLocked && Array.isArray(this.snapshotEntries) && this.snapshotEntries.length>0) {
                const sumSnap = (panelKey) => (this.snapshotEntries||[]).reduce((acc, r) => {
                    if (String(r.panel_key) === panelKey && lower(r.character_name) === nameKey) {
                        const pts = Number(r.point_value_edited != null ? r.point_value_edited : r.point_value_original) || 0;
                        return acc + pts;
                    }
                    return acc;
                }, 0);
                const pts = sumSnap('sunder');
                if (pts) push('Sunder', pts);
            } else {
                // Compute Sunder points for this name to mirror raidlogs thresholds and assigned-tank filtering
                const rows = Array.isArray(this.datasets.sunderData) ? this.datasets.sunderData : [];
                const lower = s=>String(s||'').toLowerCase();
                const elig = rows.filter(r => !this.isTankForEvent(lower(r.character_name||r.player_name||'')));
                const counts = elig.map(r => Number(r.sunder_count)||0);
                const avg = elig.length ? (counts.reduce((a,b)=>a+b,0)/elig.length) : 0;
                const computePts = (count) => {
                    if (!(avg>0)) return 0;
                    const pct = (Number(count)||0)/avg*100;
                    if (pct < 25) return -20;
                    if (pct < 50) return -15;
                    if (pct < 75) return -10;
                    if (pct < 90) return -5;
                    if (pct <= 109) return 0;
                    if (pct <= 124) return 5;
                    return 10;
                };
                const row = rows.find(r => lower(r.character_name||r.player_name||'')===nameKey);
                const pts = row ? computePts(row.sunder_count) : 0;
                if (pts) push('Sunder', pts);
            }
        }
        if (!usingEngine) {
            push('Curse Reck', sumFrom(this.datasets.curseData));
            push('Curse Shad', sumFrom(this.datasets.curseShadowData));
            push('Curse Elem', sumFrom(this.datasets.curseElementsData));
            push('Faerie Fir', sumFrom(this.datasets.faerieFireData));
            push('Scorch', sumFrom(this.datasets.scorchData));
            push('Demo Shout', sumFrom(this.datasets.demoShoutData));
            push('Polymorph', sumFrom(this.datasets.polymorphData));
            push('Power Inf', sumFrom(this.datasets.powerInfusionData));
            push('Decurses', sumFrom(this.datasets.decursesData));
            push('WorldBuffs', sumFrom(this.datasets.worldBuffsData));
        }
        // Only show frost resistance row for DPS to match totals logic
        if (!usingEngine && role === 'dps') {
            push('Frost Res', sumFrom(this.datasets.frostResistanceData));
        }
        if (!usingEngine) push('Void Dmg', sumFrom(this.datasets.voidDamageData));

        // Rankings and awards so the card matches totals
        if (!usingEngine && this.snapshotLocked && Array.isArray(this.snapshotEntries) && this.snapshotEntries.length>0) {
            const sumSnap = (panelKey) => (this.snapshotEntries||[]).reduce((acc, r) => {
                if (String(r.panel_key) === panelKey && lower(r.character_name) === nameKey) {
                    const pts = Number(r.point_value_edited != null ? r.point_value_edited : r.point_value_original) || 0;
                    return acc + pts;
                }
                return acc;
            }, 0);
            push('Dmg Rank', sumSnap('damage'));
            push('Heal Rank', sumSnap('healing'));
            push('God Gamer DPS', sumSnap('god_gamer_dps'));
            push('God Gamer Heal', sumSnap('god_gamer_healer'));
            push('Shaman Healer', sumSnap('shaman_healers'));
            push('Priest Healer', sumSnap('priest_healers'));
            push('Druid Healer', sumSnap('druid_healers'));
        } else if (!usingEngine) {
            const damagePoints = this.rewardSettings?.damage?.points_array || [];
            const damageSorted = (this.logData || [])
                .filter(p => !this.shouldIgnorePlayer(p.character_name))
                .filter(p => ((p.role_detected||'').toLowerCase()==='dps' || (p.role_detected||'').toLowerCase()==='tank') && (parseInt(p.damage_amount)||0) > 0)
                .sort((a,b)=>(parseInt(b.damage_amount)||0)-(parseInt(a.damage_amount)||0));
            const healers = (this.logData || [])
                .filter(p => !this.shouldIgnorePlayer(p.character_name))
                .filter(p => (p.role_detected||'').toLowerCase()==='healer' && (parseInt(p.healing_amount)||0) > 0)
                .sort((a,b)=>(parseInt(b.healing_amount)||0)-(parseInt(a.healing_amount)||0));

            const idxDamage = damageSorted.findIndex(p => lower(p.character_name) === nameKey);
            if (idxDamage >= 0 && idxDamage < damagePoints.length) {
                const pts = damagePoints[idxDamage] || 0; if (pts) push('Dmg Rank', pts);
            }

            const healingPoints = this.rewardSettings?.healing?.points_array || [];
            const idxHeal = healers.findIndex(p => lower(p.character_name) === nameKey);
            if (idxHeal >= 0 && idxHeal < healingPoints.length) {
                const pts = healingPoints[idxHeal] || 0; if (pts) push('Heal Rank', pts);
            }

            // God Gamer awards
            if (damageSorted.length >= 2) {
                const first = parseInt(damageSorted[0].damage_amount)||0;
                const second = parseInt(damageSorted[1].damage_amount)||0;
                const diff = first - second; let pts = 0;
                if (diff >= 250000) pts = 30; else if (diff >= 150000) pts = 20;
                if (pts && lower(damageSorted[0].character_name) === nameKey) push('God Gamer DPS', pts);
            }
            if (healers.length >= 2) {
                const first = parseInt(healers[0].healing_amount)||0;
                const second = parseInt(healers[1].healing_amount)||0;
                const diff = first - second; let pts = 0;
                if (diff >= 250000) pts = 20; else if (diff >= 150000) pts = 15;
                if (pts && lower(healers[0].character_name) === nameKey) push('God Gamer Heal', pts);
            }

            // Class-specific healer awards
            const byClass = (arr, cls) => arr.filter(p => String(p.character_class||'').toLowerCase().includes(cls));
            const shamans = byClass(healers,'shaman').slice(0,3);
            const priests = byClass(healers, 'priest').slice(0,2);
            const druids  = byClass(healers, 'druid').slice(0,1);
            const addAward = (label, arr, ptsArr) => {
                const i = arr.findIndex(p => lower(p.character_name) === nameKey);
                if (i >= 0 && i < ptsArr.length) { const pts = ptsArr[i] || 0; if (pts) push(label, pts); }
            };
            addAward('Shaman Healer', shamans, [25,20,15]);
            addAward('Priest Healer', priests, [20,15]);
            addAward('Druid Healer', druids, [15]);
        }

        // Too Low Damage / Healing
        if (!usingEngine && this.snapshotLocked && Array.isArray(this.snapshotEntries) && this.snapshotEntries.length>0) {
            const sumSnap = (panelKey) => (this.snapshotEntries||[]).reduce((acc, r) => {
                if (String(r.panel_key) === panelKey && lower(r.character_name) === nameKey) {
                    const pts = Number(r.point_value_edited != null ? r.point_value_edited : r.point_value_original) || 0;
                    return acc + pts;
                }
                return acc;
            }, 0);
            const tlDmg = sumSnap('too_low_damage');
            const tlHeal = sumSnap('too_low_healing');
            if (tlDmg) push('Too Low Dmg', tlDmg);
            if (tlHeal) push('Too Low Heal', tlHeal);
        } else if (!usingEngine) {
            const aftMin = this.datasets.raidStats?.stats?.activeFightTime;
            if (aftMin && this.primaryRoles) {
                const sec = aftMin * 60;
                const row = (this.logData||[]).find(p => lower(p.character_name)===nameKey);
                if (row) {
                    const role = String(this.primaryRoles[nameKey]||'').toLowerCase();
                    if (role==='dps') {
                        const dps = (parseFloat(row.damage_amount)||0) / sec;
                        let pts = 0; if (dps < 150) pts = -100; else if (dps < 200) pts = -50; else if (dps < 250) pts = -25;
                        if (pts) push('Too Low Dmg', pts);
                    } else if (role==='healer') {
                        const hps = (parseFloat(row.healing_amount)||0) / sec;
                        let pts = 0; if (hps < 85) pts = -100; else if (hps < 100) pts = -50; else if (hps < 125) pts = -25;
                        if (pts) push('Too Low Heal', pts);
                    }
                }
            }
        }

        // Streaks / Guild
        const streakRow = (this.datasets.playerStreaks||[]).find(r=> lower(r.character_name)===nameKey);
        if (streakRow) {
            const s = Number(streakRow.player_streak)||0; let pts=0; if(s>=8)pts=15; else if(s===7)pts=12; else if(s===6)pts=9; else if(s===5)pts=6; else if(s===4)pts=3;
            push('Streak', pts);
        }
        const guildHit = (this.datasets.guildMembers||[]).some(r=> lower(r.character_name)===nameKey);
        if (guildHit) push('Guild Mem', 10);

        // Big Buyer
        push('Big Buyer', sumFrom(this.datasets.bigBuyerData));

        // Manual rewards: split gold vs points
        const manualGold = usingEngine
            ? ((this.engineResult?.manual_gold || []).reduce((acc, e) => acc + (lower(e.name||'')===nameKey ? (Number(e.gold)||0) : 0), 0))
            : ((this.datasets.manualRewardsData||[]).reduce((acc,e)=>{ if (lower(e.player_name||'')!==nameKey) return acc; const isGold = !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||'')))); return isGold ? acc + (Number(e.points)||0) : acc; }, 0));
        const manualPts = usingEngine
            ? 0 // manual points already included via engine panels mapping
            : ((this.datasets.manualRewardsData||[]).reduce((acc,e)=>{ if (lower(e.player_name||'')!==nameKey) return acc; const isGold = !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||'')))); return isGold ? acc : acc + (Number(e.points)||0); }, 0));
        if (!usingEngine && manualPts) push('Manual', manualPts);
        if (manualGold) {
            items.push({ title: 'Manual', pts: 0, gold: manualGold, isGoldRow: true });
        }

        // Ensure per-row gold sums to total (distribute rounding remainder to Base)
        const computedTotalGold = Number(this.playerTotals?.get(nameKey)?.gold || 0);
        const sumRowGold = items.reduce((acc, it) => acc + (Number(it.gold)||0), 0);
        const remainder = computedTotalGold - sumRowGold;
        if (remainder) {
            items.push({ title: 'Rounding', pts: 0, gold: remainder });
        }

        const header = `
            <div style="display:grid; grid-template-columns: 1.6fr 60px 85px; gap:8px; font-size:14px; line-height:1.3; color:#111; font-weight:700; border-bottom:1px solid rgba(0,0,0,.15); padding-bottom:6px; margin-bottom:8px;">
                <div>Name</div>
                <div style="text-align:right;">Points</div>
                <div style="text-align:right;">Gold</div>
            </div>
        `;
        const totalGold = computedTotalGold;
        const totalPoints = Math.round(Number(this.playerTotals?.get(nameKey)?.points || 0));
        const footer = `
            <div class="player-footer-overlay" style="position:absolute; left:0; right:0; bottom:0; height:50px; background:rgba(0,0,0,0.5); border-bottom-left-radius:12px; border-bottom-right-radius:12px; display:flex; align-items:center; justify-content:center;">
                <div class="gold-total-display" style=\"font-weight:900; font-size:20px; color:#f5c542; transition: opacity .25s ease;\">${totalGold.toLocaleString()} gold</div>
                <div class="points-total-display" style=\"position:absolute; font-weight:900; font-size:20px; color:#e5e7eb; opacity:0; transition: opacity .25s ease;\">${totalPoints.toLocaleString()} points</div>
            </div>
        `;
        const body = items.length ? items
                .filter(it => it.title !== 'Rounding')
                .map(it => `
                <div class="player-breakdown-row" style="display:grid; grid-template-columns: 1.6fr 60px 85px; gap:8px; font-size:16px; line-height:1.45;">
                    <div>${fmtTitle(it.title)}</div>
                    <div style="text-align:right;">${it.pts>0?`+${it.pts}`:it.pts}</div>
                    <div style="text-align:right;">${it.isGoldRow?`<i class=\"fas fa-coins\" style=\"margin-right:6px; color:#f59e0b;\"></i>`:''}${it.gold>0?`+${it.gold}`:it.gold}</div>
                </div>`).join('') : '<div style="font-size:16px; opacity:.8; color:#fff;">No breakdown</div>';
        return header + body + footer;
    }
    reconcilePlayersWithLogData(playersData) {
        // Build strictly from WoW log data; ignore non-players; dedupe by name
        const dedup = new Map();
        (this.logData || [])
            .filter(p => !this.shouldIgnorePlayer(p.character_name))
            .forEach(p => {
                const raw = String(p.character_name || '').trim();
                const key = raw.toLowerCase();
                if (!dedup.has(key)) {
                    const klass = p.character_class || 'Unknown';
                    dedup.set(key, { character_name: raw, character_class: klass });
                }
            });
        this.allPlayers = Array.from(dedup.values());
    }

    updateTopStats() { /* deprecated in rebuild */ }

    // --- Debug helpers ---
    getPerPlayerBreakdown() {
        const breakdown = {};
        const lower = s => String(s||'').toLowerCase();
        // seed base
        this.allPlayers.forEach(p => {
            const key = lower(p.character_name);
            breakdown[key] = breakdown[key] || { name: p.character_name, class: p.character_class, components: [], total: 0 };
            breakdown[key].components.push({ panel: 'Base', points: 100 });
            breakdown[key].total += 100;
        });
        const add = (panel, rows) => {
            (rows||[]).forEach(r => {
                const key = lower(r.character_name || r.player_name);
                if (!breakdown[key]) return;
                const pts = Number(r.points)||0; if (!pts) return;
                breakdown[key].components.push({ panel, points: pts });
                breakdown[key].total += pts;
            });
        };
        // From rankings arrays
        add('Sappers', this.datasets.abilitiesData);
        add('Mana pots', this.datasets.manaPotionsData);
        add('Runes', this.datasets.runesData);
        add('Interrupts', this.datasets.interruptsData);
        add('Disarms', this.datasets.disarmsData);
        add('Sunder', this.datasets.sunderData);
        add('Curse of Recklessness', this.datasets.curseData);
        add('Curse of Shadow', this.datasets.curseShadowData);
        add('Curse of Elements', this.datasets.curseElementsData);
        add('Faerie Fire', this.datasets.faerieFireData);
        add('Scorch', this.datasets.scorchData);
        add('Demo Shout', this.datasets.demoShoutData);
        add('Polymorph', this.datasets.polymorphData);
        add('Power Infusion', this.datasets.powerInfusionData);
        add('Decurses', this.datasets.decursesData);
        add('Frost Resistance', this.datasets.frostResistanceData);
        add('World Buffs', this.datasets.worldBuffsData);
        add('Void Damage', this.datasets.voidDamageData);
        add('Big Buyer', this.datasets.bigBuyerData);
        (this.datasets.playerStreaks||[]).forEach(r => {
            const key = lower(r.character_name); if (!breakdown[key]) return;
            const s = Number(r.player_streak)||0; let pts=0; if(s>=8)pts=15; else if(s===7)pts=12; else if(s===6)pts=9; else if(s===5)pts=6; else if(s===4)pts=3;
            if (pts) { breakdown[key].components.push({ panel:'Attendance Streak', points: pts }); breakdown[key].total += pts; }
        });
        (this.datasets.guildMembers||[]).forEach(r => {
            const key = lower(r.character_name); if (!breakdown[key]) return;
            breakdown[key].components.push({ panel:'Guild Members', points: 10 }); breakdown[key].total += 10;
        });
        // Manual
        (this.datasets.manualRewardsData||[]).forEach(e => {
            const key = lower(e.player_name); if (!breakdown[key]) return;
            const pts = Number(e.points)||0; if (!pts) return;
            breakdown[key].components.push({ panel:'Manual', points: pts, desc: e.description||'' }); breakdown[key].total += pts;
        });
        return breakdown;
    }

    renderDebugPanel() {
        const panel = document.getElementById('debugPanel');
        if (!panel) return;
        const breakdown = this.getPerPlayerBreakdown();
        // Compare against computed totals used for display
        let html = '';
        html += `<div style="margin-bottom:10px; font-weight:700;">Players included (${this.allPlayers.length}): ${this.allPlayers.map(p=>p.character_name).join(', ')}</div>`;
        Object.values(breakdown).forEach(p => {
            const key = String(p.name||'');
            const computed = this.playerTotals.get(key.toLowerCase());
            const compTotal = Math.round(computed?.points || 0);
            const status = compTotal === Math.round(p.total) ? '✅' : '⚠️';
            html += `<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #1f2937;">
                <div style="font-weight:700; color:#f59e0b;">${status} ${p.name} <span style="color:#6b7280; font-weight:600;">(${p.class})</span> — calc: ${compTotal} vs breakdown: ${Math.round(p.total)}</div>
                <ul style="margin:6px 0 0 14px;">
                    ${p.components.map(c=>`<li>${c.panel}: ${c.points} ${c.desc?`- <em>${c.desc}</em>`:''}</li>`).join('')}
                </ul>
            </div>`;
        });
        panel.innerHTML = html || '<em>No data</em>';
    }

    exportDebugJson() {
        const data = {
            players: this.allPlayers,
            totals: Array.from(this.playerTotals.entries()),
            breakdown: this.getPerPlayerBreakdown(),
            settings: this.rewardSettings,
            gold: { total: this.totalGoldPot, shared: this.sharedGoldPot },
            datasetsIncluded: Object.keys(this.datasets)
        };
        const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `gold-debug-${this.currentEventId}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    shouldIgnorePlayer(name) {
        if (!name) return false;
        const n = String(name).toLowerCase();
        // Do not exclude names containing 'ward' (e.g., 'Warduro'); only filter clear non-player entities
        return /(zzold|totem|trap|dummy|battle\s*chicken)/i.test(n);
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

    renderPlayers() { /* deprecated in rebuild */ }

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
    const mgr = new GoldPotManager();
    try { window.goldManager = mgr; } catch {}
}); 