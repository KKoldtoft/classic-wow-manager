// Frontend utility for sending gold cut confirmation DM embeds
// For testing: always send to Kim's Discord user ID, but compose content
// from a randomly selected player currently listed on the Gold page.

(function(){
    const TEST_DISCORD_USER_ID = '492023474437619732';

    function pickRandomPlayer(allPlayers){
        if (!Array.isArray(allPlayers) || allPlayers.length === 0) return null;
        const idx = Math.floor(Math.random() * allPlayers.length);
        return allPlayers[idx] || null;
    }

    function getTotalsFor(nameKey){
        try {
            if (!window.goldManager || !window.goldManager.playerTotals) return { points: 0, gold: 0 };
            const t = window.goldManager.playerTotals.get(String(nameKey||'').toLowerCase()) || { points: 0, gold: 0 };
            return { points: Math.round(Number(t.points)||0), gold: Number(t.gold)||0 };
        } catch { return { points: 0, gold: 0 }; }
    }

    function buildPlusMinusLists(nameKey){
        const items = [];
        try {
            if (!window.goldManager) return { rewards: [], deductions: [] };
            const gpp = window.goldManager.goldPerPoint || 0;
            // Reuse the same computation as buildPlayerBreakdownRows but capture structured rows
            const lower = s=>String(s||'').toLowerCase();
            const usingEngine = !!window.goldManager.engineResult;

            const push = (label, pts, gold, isGoldRow) => {
                const entry = { label: label, points: Math.trunc(pts||0), gold: Math.trunc(gold||0), isGoldRow: !!isGoldRow };
                items.push(entry);
            };

            // Base and panel contributions: reuse a light-weight pass through engine panels or datasets
            if (usingEngine) {
                const panels = (window.goldManager.engineResult?.panels||[]);
                // Base
                const basePanel = panels.find(p => p.panel_key === 'base');
                if (basePanel && Array.isArray(basePanel.rows)) {
                    const row = basePanel.rows.find(r => lower(r.name) === nameKey);
                    const pts = row && row.points ? Number(row.points) : 0;
                    if (pts) push('Base', pts, Math.floor(pts * gpp));
                }
                // Others
                panels.forEach(p => {
                    if (p.panel_key === 'base') return;
                    const row = (p.rows||[]).find(r => lower(r.name) === nameKey);
                    const pts = row && row.points ? Number(row.points) : 0;
                    if (!pts) return;
                    const labelMap = {
                        damage:'Dmg Rank', healing:'Heal Rank', god_gamer_dps:'God Gamer DPS', god_gamer_healer:'God Gamer Heal',
                        abilities:'Sappers', mana_potions:'Mana pots', runes:'Runes', windfury_totems:'Totems', interrupts:'Interrupts', disarms:'Disarms',
                        curse_recklessness:'Curse Reck', curse_shadow:'Curse Shad', curse_elements:'Curse Elem', faerie_fire:'Faerie Fir', scorch:'Scorch', demo_shout:'Demo Shout',
                        polymorph:'Polymorph', power_infusion:'Power Inf', decurses:'Decurses', frost_resistance:'Frost Res', world_buffs_copy:'WorldBuffs',
                        void_damage:'Void Dmg', shaman_healers:'Shaman Healer', priest_healers:'Priest Healer', druid_healers:'Druid Healer',
                        too_low_damage:'Too Low Dmg', too_low_healing:'Too Low Heal', attendance_streaks:'Streak', guild_members:'Guild Mem', big_buyer:'Big Buyer', manual_points:'Manual'
                    };
                    const label = labelMap[p.panel_key] || p.panel_key;
                    push(label, pts, Math.floor(pts * gpp));
                });
                // Manual gold (engine result includes this separately)
                try {
                    const mg = (window.goldManager.engineResult?.manual_gold||[])
                        .filter(e => lower(e.name||'') === nameKey)
                        .reduce((acc,e)=> acc + (Number(e.gold)||0), 0);
                    if (mg) push('Manual', 0, Math.trunc(mg), true);
                } catch {}
            } else {
                // Legacy: Base 100
                push('Base', 100, Math.floor(100 * gpp));
                // Collect from datasets with same labels used on the page where possible
                const sumFrom = (arr)=> (arr||[]).reduce((acc,row)=> acc + (lower(row.character_name||row.player_name||'')===nameKey ? (Number(row.points)||0) : 0), 0);
                const add = (label, pts)=>{ if (pts) push(label, pts, Math.floor(pts * gpp)); };
                add('Sappers', sumFrom(window.goldManager.datasets.abilitiesData));
                add('Totems', sumFrom(window.goldManager.datasets.windfuryData));
                add('RocketHelm', sumFrom(window.goldManager.datasets.rocketHelmetData));
                add('Mana pots', sumFrom(window.goldManager.datasets.manaPotionsData));
                add('Runes', sumFrom(window.goldManager.datasets.runesData));
                add('Interrupts', sumFrom(window.goldManager.datasets.interruptsData));
                add('Disarms', sumFrom(window.goldManager.datasets.disarmsData));
                add('Curse Reck', sumFrom(window.goldManager.datasets.curseData));
                add('Curse Shad', sumFrom(window.goldManager.datasets.curseShadowData));
                add('Curse Elem', sumFrom(window.goldManager.datasets.curseElementsData));
                add('Faerie Fir', sumFrom(window.goldManager.datasets.faerieFireData));
                add('Scorch', sumFrom(window.goldManager.datasets.scorchData));
                add('Demo Shout', sumFrom(window.goldManager.datasets.demoShoutData));
                add('Polymorph', sumFrom(window.goldManager.datasets.polymorphData));
                add('Power Inf', sumFrom(window.goldManager.datasets.powerInfusionData));
                add('Decurses', sumFrom(window.goldManager.datasets.decursesData));
                add('WorldBuffs', sumFrom(window.goldManager.datasets.worldBuffsData));
                add('Frost Res', sumFrom(window.goldManager.datasets.frostResistanceData));
                add('Void Dmg', sumFrom(window.goldManager.datasets.voidDamageData));
                add('Big Buyer', sumFrom(window.goldManager.datasets.bigBuyerData));
                // Sunder
                if (!window.goldManager.isTankForEvent(nameKey)) {
                    if (window.goldManager.snapshotLocked && Array.isArray(window.goldManager.snapshotEntries) && window.goldManager.snapshotEntries.length>0) {
                        const pts = (window.goldManager.snapshotEntries||[]).reduce((acc, r) => {
                            if (String(r.panel_key) === 'sunder' && lower(r.character_name) === nameKey) {
                                const v = Number(r.point_value_edited != null ? r.point_value_edited : r.point_value_original) || 0;
                                return acc + v;
                            }
                            return acc;
                        }, 0);
                        if (pts) push('Sunder', pts, Math.floor(pts * gpp));
                    } else {
                        const rows = Array.isArray(window.goldManager.datasets.sunderData) ? window.goldManager.datasets.sunderData : [];
                        const elig = rows.filter(r => !window.goldManager.isTankForEvent(lower(r.character_name||r.player_name||'')));
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
                        if (pts) push('Sunder', pts, Math.floor(pts * gpp));
                    }
                }
                // Rankings and awards
                if (window.goldManager.snapshotLocked && Array.isArray(window.goldManager.snapshotEntries) && window.goldManager.snapshotEntries.length>0) {
                    const sumSnap = (panelKey) => (window.goldManager.snapshotEntries||[]).reduce((acc, r) => {
                        if (String(r.panel_key) === panelKey && lower(r.character_name) === nameKey) {
                            const v = Number(r.point_value_edited != null ? r.point_value_edited : r.point_value_original) || 0;
                            return acc + v;
                        }
                        return acc;
                    }, 0);
                    const addSnap = (label, key) => { const pts = sumSnap(key); if (pts) push(label, pts, Math.floor(pts * gpp)); };
                    addSnap('Dmg Rank', 'damage');
                    addSnap('Heal Rank', 'healing');
                    addSnap('God Gamer DPS', 'god_gamer_dps');
                    addSnap('God Gamer Heal', 'god_gamer_healer');
                    addSnap('Shaman Healer', 'shaman_healers');
                    addSnap('Priest Healer', 'priest_healers');
                    addSnap('Druid Healer', 'druid_healers');
                    addSnap('Too Low Dmg', 'too_low_damage');
                    addSnap('Too Low Heal', 'too_low_healing');
                } else {
                    // Dmg/Heal Rank
                    const damagePoints = (window.goldManager.rewardSettings?.damage?.points_array) || [];
                    const damageSorted = (window.goldManager.logData || [])
                        .filter(p => !window.goldManager.shouldIgnorePlayer(p.character_name))
                        .filter(p => ((String(p.role_detected||'').toLowerCase()==='dps') || (String(p.role_detected||'').toLowerCase()==='tank')) && (parseInt(p.damage_amount)||0)>0)
                        .sort((a,b)=>(parseInt(b.damage_amount)||0)-(parseInt(a.damage_amount)||0));
                    const idxDamage = damageSorted.findIndex(p => lower(p.character_name) === nameKey);
                    if (idxDamage >= 0 && idxDamage < damagePoints.length) {
                        const pts = damagePoints[idxDamage] || 0; if (pts) push('Dmg Rank', pts, Math.floor(pts * gpp));
                    }
                    const healingPoints = (window.goldManager.rewardSettings?.healing?.points_array) || [];
                    const healers = (window.goldManager.logData || [])
                        .filter(p => !window.goldManager.shouldIgnorePlayer(p.character_name))
                        .filter(p => (String(p.role_detected||'').toLowerCase()==='healer') && (parseInt(p.healing_amount)||0)>0)
                        .sort((a,b)=>(parseInt(b.healing_amount)||0)-(parseInt(a.healing_amount)||0));
                    const idxHeal = healers.findIndex(p => lower(p.character_name) === nameKey);
                    if (idxHeal >= 0 && idxHeal < healingPoints.length) {
                        const pts = healingPoints[idxHeal] || 0; if (pts) push('Heal Rank', pts, Math.floor(pts * gpp));
                    }
                    // God Gamer awards
                    if (damageSorted.length >= 2) {
                        const first = parseInt(damageSorted[0].damage_amount)||0;
                        const second = parseInt(damageSorted[1].damage_amount)||0;
                        const diff = first - second; let pts = 0;
                        if (diff >= 250000) pts = 30; else if (diff >= 150000) pts = 20;
                        if (pts && lower(damageSorted[0].character_name) === nameKey) push('God Gamer DPS', pts, Math.floor(pts * gpp));
                    }
                    if (healers.length >= 2) {
                        const first = parseInt(healers[0].healing_amount)||0;
                        const second = parseInt(healers[1].healing_amount)||0;
                        const diff = first - second; let pts = 0;
                        if (diff >= 250000) pts = 20; else if (diff >= 150000) pts = 15;
                        if (pts && lower(healers[0].character_name) === nameKey) push('God Gamer Heal', pts, Math.floor(pts * gpp));
                    }
                    // Class-specific healer awards
                    const byClass = (arr, cls) => arr.filter(p => String(p.character_class||'').toLowerCase().includes(cls));
                    const shamans = byClass(healers,'shaman').slice(0,3);
                    const priests = byClass(healers, 'priest').slice(0,2);
                    const druids  = byClass(healers, 'druid').slice(0,1);
                    const addAward = (label, arr, ptsArr) => {
                        const i = arr.findIndex(p => lower(p.character_name) === nameKey);
                        if (i >= 0 && i < ptsArr.length) { const pts = ptsArr[i] || 0; if (pts) push(label, pts, Math.floor(pts * gpp)); }
                    };
                    addAward('Shaman Healer', shamans, [25,20,15]);
                    addAward('Priest Healer', priests, [20,15]);
                    addAward('Druid Healer', druids, [15]);
                    // Too Low DPS/HPS
                    const aftMin = window.goldManager.datasets?.raidStats?.stats?.activeFightTime;
                    if (aftMin && window.goldManager.primaryRoles) {
                        const sec = aftMin * 60;
                        const row = (window.goldManager.logData||[]).find(p => lower(p.character_name)===nameKey);
                        if (row) {
                            const role = String(window.goldManager.primaryRoles[nameKey]||'').toLowerCase();
                            if (role==='dps') {
                                const dps = (parseFloat(row.damage_amount)||0) / sec;
                                let pts = 0; if (dps < 150) pts = -100; else if (dps < 200) pts = -50; else if (dps < 250) pts = -25;
                                if (pts) push('Too Low Dmg', pts, Math.floor(pts * gpp));
                            } else if (role==='healer') {
                                const hps = (parseFloat(row.healing_amount)||0) / sec;
                                let pts = 0; if (hps < 85) pts = -100; else if (hps < 100) pts = -50; else if (hps < 125) pts = -25;
                                if (pts) push('Too Low Heal', pts, Math.floor(pts * gpp));
                            }
                        }
                    }
                }
                // Streak and Guild Member
                const streakRow = (window.goldManager.datasets.playerStreaks||[]).find(r=> lower(r.character_name)===nameKey);
                if (streakRow) {
                    const s = Number(streakRow.player_streak)||0; let pts=0; if(s>=8)pts=15; else if(s===7)pts=12; else if(s===6)pts=9; else if(s===5)pts=6; else if(s===4)pts=3;
                    if (pts) push('Streak', pts, Math.floor(pts * gpp));
                }
                const guildHit = (window.goldManager.datasets.guildMembers||[]).some(r=> lower(r.character_name)===nameKey);
                if (guildHit) push('Guild Mem', 10, Math.floor(10 * gpp));
                // Manual split
                const manualGold = (window.goldManager.datasets.manualRewardsData||[])
                    .filter(e => lower(e.player_name||'')===nameKey && !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||'')))))
                    .reduce((acc,e)=> acc + (Number(e.points)||0), 0);
                const manualPts = (window.goldManager.datasets.manualRewardsData||[])
                    .filter(e => lower(e.player_name||'')===nameKey && !(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||'')))))
                    .reduce((acc,e)=> acc + (Number(e.points)||0), 0);
                if (manualPts) add('Manual', manualPts);
                if (manualGold) push('Manual', 0, Math.trunc(manualGold), true);
            }
        } catch {}

        const rewards = items.filter(it => (it.points||0) > 0 || (it.gold||0) > 0);
        const deductions = items.filter(it => (it.points||0) < 0 || (it.gold||0) < 0);
        return { rewards, deductions };
    }

    async function sendGoldCutsPromptEmbed(){
        if (!window.goldManager) { alert('Gold manager not ready'); return; }
        const players = window.goldManager.allPlayers || [];
        if (!players.length) { alert('No players loaded'); return; }
        const picked = pickRandomPlayer(players);
        if (!picked) { alert('Failed to pick a player'); return; }
        const name = String(picked.character_name||'');
        const nameKey = name.toLowerCase();
        const { points, gold } = getTotalsFor(nameKey);
        const { rewards, deductions } = buildPlusMinusLists(nameKey);
        const eventId = String(window.goldManager.currentEventId || '');

        const map = (window.goldManager && window.goldManager.nameToDiscordId) ? window.goldManager.nameToDiscordId : new Map();
        const discordId = map.get(nameKey) || TEST_DISCORD_USER_ID;
        const payload = {
            userId: discordId,
            playerName: name,
            eventId,
            rewards,
            deductions,
            totalPoints: points,
            totalGold: gold
        };

        const btn = document.getElementById('sendGoldCutsPromptBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
        try {
            const res = await fetch('/api/discord/prompt-goldcuts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const ok = res && res.ok;
            if (!ok) {
                const t = await res.text();
                console.error('Gold cuts DM failed:', t);
                alert('Failed to send test DM');
            } else {
                alert(`Sent a test gold-cut DM for ${name} to your Discord DM`);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to send test DM');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Send gold cuts prompt'; }
        }
    }

    // --- Overlay batch sending UI ---
    function createOverlay(){
        let wrap = document.getElementById('dmOverlay');
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.id = 'dmOverlay';
        wrap.style.position = 'fixed';
        wrap.style.inset = '0';
        wrap.style.background = 'rgba(0,0,0,0.6)';
        wrap.style.zIndex = '1000';
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';
        const panel = document.createElement('div');
        panel.style.background = '#111827';
        panel.style.border = '1px solid #374151';
        panel.style.borderRadius = '10px';
        panel.style.width = 'min(720px, 92vw)';
        panel.style.maxHeight = '80vh';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.padding = '14px';
        panel.style.color = '#e5e7eb';
        panel.id = 'dmOverlayPanel';
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '8px';
        const title = document.createElement('div');
        title.textContent = 'Send gold cuts prompt';
        title.style.fontWeight = '800';
        title.style.fontSize = '18px';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = '1px solid #4b5563';
        closeBtn.style.color = '#e5e7eb';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.padding = '4px 8px';
        closeBtn.onclick = () => { document.body.removeChild(wrap); };
        header.appendChild(title);
        header.appendChild(closeBtn);
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '10px';
        controls.style.margin = '6px 0 10px 0';
        const selectAll = document.createElement('label');
        const cbAll = document.createElement('input'); cbAll.type = 'checkbox'; cbAll.checked = true; cbAll.style.marginRight = '6px';
        selectAll.appendChild(cbAll);
        selectAll.appendChild(document.createTextNode('Select all'));
        controls.appendChild(selectAll);
        const listWrap = document.createElement('div');
        listWrap.id = 'dmOverlayList';
        listWrap.style.overflow = 'auto';
        listWrap.style.border = '1px solid #374151';
        listWrap.style.borderRadius = '8px';
        listWrap.style.padding = '8px';
        listWrap.style.flex = '1 1 auto';
        listWrap.style.maxHeight = '58vh';
        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.alignItems = 'center';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '10px';
        footer.style.marginTop = '10px';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.background = '#1f2937';
        cancelBtn.style.border = '1px solid #4b5563';
        cancelBtn.style.color = '#e5e7eb';
        cancelBtn.style.borderRadius = '8px';
        cancelBtn.style.padding = '8px 12px';
        cancelBtn.onclick = () => { document.body.removeChild(wrap); };
        const sendBtn = document.createElement('button');
        sendBtn.id = 'dmOverlaySendBtn';
        sendBtn.textContent = 'Send to selected';
        sendBtn.style.background = '#2563eb';
        sendBtn.style.border = '1px solid #1d4ed8';
        sendBtn.style.color = '#e5e7eb';
        sendBtn.style.borderRadius = '8px';
        sendBtn.style.padding = '8px 12px';
        footer.appendChild(cancelBtn);
        footer.appendChild(sendBtn);
        panel.appendChild(header);
        panel.appendChild(controls);
        panel.appendChild(listWrap);
        panel.appendChild(footer);
        wrap.appendChild(panel);
        document.body.appendChild(wrap);
        return { wrap, listWrap, sendBtn, cbAll };
    }

    function populateOverlayList(listWrap){
        const mgr = window.goldManager;
        const players = (mgr && Array.isArray(mgr.allPlayers)) ? mgr.allPlayers.slice() : [];
        players.sort((a,b)=> String(a.character_name||'').localeCompare(String(b.character_name||'')));
        listWrap.innerHTML = '';
        players.forEach(p => {
            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '24px 1fr 140px';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.padding = '6px 4px';
            row.style.borderBottom = '1px solid #1f2937';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.className = 'dm-select';
            const name = document.createElement('div'); name.textContent = String(p.character_name||'');
            const status = document.createElement('div'); status.textContent = 'pending'; status.style.color = '#9ca3af'; status.style.textAlign = 'right'; status.className = 'dm-status';
            row.dataset.playerName = String(p.character_name||'');
            row.appendChild(cb); row.appendChild(name); row.appendChild(status);
            listWrap.appendChild(row);
        });
    }

    function wireSelectAll(cbAll, listWrap){
        cbAll.addEventListener('change', () => {
            listWrap.querySelectorAll('input.dm-select').forEach(cb => { cb.checked = cbAll.checked; });
        });
    }

    async function sendBatch(listWrap, sendBtn){
        const mgr = window.goldManager; if (!mgr) return;
        const eventId = String(mgr.currentEventId || '');
        const rows = Array.from(listWrap.children);
        const selected = rows.filter(r => r.querySelector('input.dm-select')?.checked);
        // spinner state
        const original = sendBtn.textContent; sendBtn.textContent = 'Sending…'; sendBtn.disabled = true;
        let delayMs = 250; // 4 msgs/sec
        for (let i = 0; i < selected.length; i++) {
            const row = selected[i];
            const name = String(row.dataset.playerName||'');
            const nameKey = name.toLowerCase();
            const { points, gold } = getTotalsFor(nameKey);
            const { rewards, deductions } = buildPlusMinusLists(nameKey);
            const map = (window.goldManager && window.goldManager.nameToDiscordId) ? window.goldManager.nameToDiscordId : new Map();
            const discordId = map.get(nameKey) || TEST_DISCORD_USER_ID;
            const payload = {
                userId: discordId,
                playerName: name,
                eventId,
                rewards,
                deductions,
                totalPoints: points,
                totalGold: gold
            };
            const statusEl = row.querySelector('.dm-status');
            try {
                const res = await fetch('/api/discord/prompt-goldcuts', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                if (res.status === 429) {
                    // Respect server suggested backoff if provided
                    try {
                        const txt = await res.text();
                        const data = JSON.parse(txt);
                        const ra = Number(data && data.retry_after);
                        if (!isNaN(ra) && ra > 0) {
                            delayMs = Math.max(delayMs * 2, Math.ceil(ra * 1000));
                        } else {
                            delayMs = Math.min(2000, delayMs * 2);
                        }
                    } catch { delayMs = Math.min(2000, delayMs * 2); }
                    // mark and continue; next iteration will wait longer
                    statusEl.textContent = 'rate limited - retrying next'; statusEl.style.color = '#f59e0b';
                } else if (res.ok) {
                    statusEl.textContent = 'sent'; statusEl.style.color = '#22c55e';
                    // cautiously relax delay a bit after success
                    delayMs = Math.max(200, Math.floor(delayMs * 0.9));
                } else {
                    statusEl.textContent = 'failed'; statusEl.style.color = '#ef4444';
                }
            } catch {
                statusEl.textContent = 'failed'; statusEl.style.color = '#ef4444';
            }
            await new Promise(r => setTimeout(r, delayMs));
        }
        sendBtn.textContent = original; sendBtn.disabled = false;
    }

    function openDmOverlay(){
        const { wrap, listWrap, sendBtn, cbAll } = createOverlay();
        populateOverlayList(listWrap);
        wireSelectAll(cbAll, listWrap);
        sendBtn.onclick = () => { sendBatch(listWrap, sendBtn); };
    }

    function wireGoldCutsButton(){
        const btn = document.getElementById('sendGoldCutsPromptBtn');
        if (!btn || btn._wired) return;
        btn.addEventListener('click', openDmOverlay);
        btn._wired = true;
    }

    window.addEventListener('load', wireGoldCutsButton);
    document.addEventListener('DOMContentLoaded', wireGoldCutsButton);
})();


