# Panel Filtering Analysis - All Filters by Panel

## Overview
This document lists all panels that have filtering logic to remove/exclude certain players from being displayed or awarded points.

---

## Panels WITH Filtering

### 1. **Damage Dealers** 🗡️
**Location:** `rewardsEngine.cjs` lines 365-369

**Filters:**
1. ❌ Exclude ignored players: `shouldIgnorePlayer(p.character_name)`
   - Pattern: `/(zzold|totem|trap|dummy|battle\s*chicken)/i`
2. ❌ Exclude non-DPS/Tank roles: Must have `role_detected` = 'dps' OR 'tank'
3. ❌ Exclude zero damage: `damage_amount > 0`

**Logic:**
```javascript
.filter(p => !shouldIgnorePlayer(p.character_name))
.filter(p => (['dps','tank'].includes(String(p.role_detected||'').toLowerCase())) 
         && (parseInt(p.damage_amount)||0) > 0)
```

---

### 2. **Healers** 💚
**Location:** `rewardsEngine.cjs` lines 372-382

**Filters:**
1. ❌ Exclude ignored players: `shouldIgnorePlayer(p.character_name)`
2. ❌ Exclude non-healers: Must have `role_detected` = 'healer'
3. ❌ Exclude zero healing: `healing_amount > 0`

**Logic:**
```javascript
.filter(p => !shouldIgnorePlayer(p.character_name))
.filter(p => {
    const detected = String(p.role_detected||'').toLowerCase();
    const isHealer = (detected === 'healer');
    return isHealer && (parseInt(p.healing_amount)||0) > 0;
})
```

---

### 3. **God Gamer DPS** ⚡
**Location:** `rewardsEngine.cjs` line 385

**Filters:**
- Uses pre-filtered `damageSorted` array (inherits Damage Dealers filters)
- ✅ Only awarded if rank 1-2 exist and difference is >= 150k or 250k

---

### 4. **God Gamer Healer** ⚡
**Location:** `rewardsEngine.cjs` line 386

**Filters:**
- Uses pre-filtered `healers` array (inherits Healers filters)
- ✅ Only awarded if rank 1-2 exist and difference is >= 150k or 250k

---

### 5. **Top Shaman Healers** 🌊
**Location:** `rewardsEngine.cjs` lines 389-393

**Filters:**
1. Inherits all Healers filters
2. ❌ Exclude non-Shamans: `character_class` must include 'shaman'
3. ✅ Only top 3 shamans

**Logic:**
```javascript
byClass(healers, 'shaman').slice(0, 3)
```

---

### 6. **Top Priest Healers** 🕊️
**Location:** `rewardsEngine.cjs` lines 389-393

**Filters:**
1. Inherits all Healers filters
2. ❌ Exclude non-Priests: `character_class` must include 'priest'
3. ✅ Only top 2 priests

**Logic:**
```javascript
byClass(healers, 'priest').slice(0, 2)
```

---

### 7. **Top Druid Healer** 🐻
**Location:** `rewardsEngine.cjs` lines 389-393

**Filters:**
1. Inherits all Healers filters
2. ❌ Exclude non-Druids: `character_class` must include 'druid'
3. ✅ Only top 1 druid

**Logic:**
```javascript
byClass(healers, 'druid').slice(0, 1)
```

---

### 8. **Windfury Totems** 🌀
**Location:** `rewardsEngine.cjs` lines 407-417, `index.cjs` lines 11675-11686

**Filters (Engine):**
1. ~~Must be in confirmed player set~~ ✅ **REMOVED** - Accepts all data from API

**Filters (API):**
1. **Windfury Totem:**
   - ❌ Must have `group_attacks_avg > 0` (valid party data)
   - ❌ Must have `Number.isFinite(group_attacks_avg)`
2. **Grace of Air / Strength of Earth / Tranquil Air:**
   - ❌ Must have `totems_used >= 10`

**Logic:**
```javascript
// Engine - No confirmed check
(byKey.windfuryData||[]).forEach(row => {
    let nm = row.character_name || row.player_name; if (!nm) return;
    const nmCanon = nm.replace(/\s*\([^)]*\)\s*$/, '').trim();
    addRow('windfury_totems', nmCanon, Number(row.points)||0);
});

// API
if (typeLower.includes('windfury')) {
    return Number.isFinite(entry.group_attacks_avg) && Number(entry.group_attacks_avg) > 0;
}
if (typeLower.includes('grace of air') || typeLower.includes('strength of earth') 
    || typeLower.includes('tranquil air')) {
    return Number(entry.totems_used || 0) >= 10;
}
```

---

### 9. **Sunder Armor** ⚔️
**Location:** `rewardsEngine.cjs` lines 499-536, `index.cjs` lines 13547-13548

**Filters (Engine):**
1. ✅ Must be in `confirmed` player set
2. ❌ Exclude **ONLY Skull and Cross tanks** (first 2 main tanks) - Other warriors included

**Filters (API):**
1. ~~Exclude zero sunder count~~ ✅ **REMOVED** - Includes all sunder counts (even 0)

**Logic:**
```javascript
// Engine - Only first 2 tanks (Skull + Cross) excluded
const mainTanks = new Set();
['skull','cross'].forEach(m => { const k = pick(m); if (k) mainTanks.add(k); });

const eligible = rows.filter(r => {
    const nm = nameKey(r.character_name || r.player_name || '');
    if (!nm) return false;
    if (!confirmed.has(nm)) return false;
    if (mainTanks.has(nm)) return false; // Only exclude Skull and Cross
    return true;
});

rows.forEach(r => {
    const nm = r.character_name || r.player_name || '';
    const key = nameKey(nm);
    if (!confirmed.has(key)) return;
    if (mainTanks.has(key)) return;
    const pts = computePts(r.sunder_count);
    addRow('sunder', nm, pts); // Award even if pts is 0
});

// API - No filter for sunder_count
// All characters included, even with 0 sunders
```

---

### 10. **Curse of Recklessness** 🔮
**Location:** `index.cjs` line 13662

**Filters:**
1. ❌ Include all with valid uptime: `uptime_percentage >= 0`

**Logic:**
```javascript
.filter(char => char.uptime_percentage >= 0)
```

---

### 11. **Curse of Shadow** 🌑
**Location:** `index.cjs` line 13779

**Filters:**
1. ❌ Include all with valid uptime: `uptime_percentage >= 0`

**Logic:**
```javascript
.filter(char => char.uptime_percentage >= 0)
```

---

### 12. **Curse of the Elements** ❄️
**Location:** `index.cjs` line 13896

**Filters:**
1. ❌ Include all with valid uptime: `uptime_percentage >= 0`

**Logic:**
```javascript
.filter(char => char.uptime_percentage >= 0)
```

---

### 13. **Faerie Fire** 🌟
**Location:** `index.cjs` line 14032

**Filters:**
1. ❌ Include all with valid uptime: `uptime_percentage >= 0`

**Logic:**
```javascript
.filter(char => char.uptime_percentage >= 0)
```

---

### 14. **Rocket Helmet** 🚀
**Location:** `rewardsEngine.cjs` lines 472-494

**Filters:**
1. ~~Must be in confirmed player set~~ ✅ **REMOVED** - Accepts all players from WCL data
2. ✅ Must have equipped Goblin Rocket Helmet in WCL combatantInfo

**Logic:**
```javascript
// No confirmed check - accept all players with rocket helmet
Array.from(users).forEach(nm => addRow('rocket_helmet', nm, 5));
```

---

### 15. **Frost Resistance** ❄️
**Location:** `rewardsEngine.cjs` lines 528-535

**Filters:**
1. ✅ Must be in `confirmed` player set

**Logic:**
```javascript
const k = nameKey(nm); 
if (!confirmed.has(k)) return;
```

---

### 16. **Attendance Streaks** 📅
**Location:** `rewardsEngine.cjs` lines 538-548

**Filters:**
1. ✅ Must be in `confirmed` player set OR in `allPlayers` engine list
2. ✅ Only award if streak >= 4

**Logic:**
```javascript
if (!confirmed.has(k) && !playersSet.has(k)) return;
const s = Number(r.player_streak)||0; 
let pts = 0; 
if (s >= 8) pts = 15; 
else if (s === 7) pts = 12; 
else if (s === 6) pts = 9; 
else if (s === 5) pts = 6; 
else if (s === 4) pts = 3; 
if (pts) addRow('attendance_streaks', nm, pts);
```

---

### 17. **Guild Members** 🏰
**Location:** `rewardsEngine.cjs` lines 538-548

**Filters:**
1. ✅ Must be in `confirmed` player set OR in `allPlayers` engine list

**Logic:**
```javascript
if (!confirmed.has(k) && !playersSet.has(k)) return;
addRow('guild_members', nm, 10);
```

---

### 18. **Too Low Damage** 📉
**Location:** `rewardsEngine.cjs` lines 550-560

**Filters:**
1. ❌ Exclude ignored players: `shouldIgnorePlayer(p.character_name)`
2. ❌ Only DPS role: `role === 'dps'`
3. ✅ Only penalize if DPS < 150, 200, or 250

**Logic:**
```javascript
if (shouldIgnorePlayer(p.character_name)) return;
const role = String(byKey.primaryRoles?.[key]||'').toLowerCase();
if (role === 'dps') {
    const dps = (parseFloat(p.damage_amount)||0) / sec;
    let pts = 0;
    if (dps < 150) pts = -100;
    else if (dps < 200) pts = -50;
    else if (dps < 250) pts = -25;
    if (pts) addRow('too_low_damage', p.character_name, pts);
}
```

---

### 19. **Too Low Healing** 📉
**Location:** `rewardsEngine.cjs` lines 550-560

**Filters:**
1. ❌ Exclude ignored players: `shouldIgnorePlayer(p.character_name)`
2. ❌ Only Healer role: `role === 'healer'`
3. ✅ Only penalize if HPS < 85, 100, or 125

**Logic:**
```javascript
if (shouldIgnorePlayer(p.character_name)) return;
const role = String(byKey.primaryRoles?.[key]||'').toLowerCase();
if (role === 'healer') {
    const hps = (parseFloat(p.healing_amount)||0) / sec;
    let pts = 0;
    if (hps < 85) pts = -100;
    else if (hps < 100) pts = -50;
    else if (hps < 125) pts = -25;
    if (pts) addRow('too_low_healing', p.character_name, pts);
}
```

---

### 20. **Manual Points** ✏️
**Location:** `rewardsEngine.cjs` lines 569-583

**Filters:**
1. ~~Must be in confirmed player set~~ ✅ **REMOVED** - Accepts all manual entries
2. ❌ Exclude manual gold entries (only add points, not gold)

**Logic:**
```javascript
const isGold = !!(e && (e.is_gold || /\[GOLD\]/i.test(String(e.description||''))));
const nm = e.player_name; 
if (!nm) return;
if (isGold) {
    // Handle gold separately
} else {
    // No confirmed check - accept all manual points entries
    addRow('manual_points', nm, val);
}
```

---

### 21. **Big Buyer** 💰
**Location:** `rewardsEngine.cjs` lines 452-470

**Filters:**
1. ~~Must be in confirmed player set~~ ✅ **REMOVED** - Accepts all data from API
2. ✅ Must have points/value/score > 0

**Logic:**
```javascript
// No confirmed check - accept all big buyer data from API
const val = Number(row.points != null ? row.points : (row.value != null ? row.value : row.score)) || 0;
if (!val) return;
addRow('big_buyer', nm, val);
```

---

## Panels WITHOUT Filtering (Accept All Data)

These panels take all data from their respective APIs without additional filtering:

- **Engineering & Holywater** (abilities) - ✅ Fixed: Removed confirmed check
- **Major Mana Potions** - ✅ Fixed: Removed confirmed check
- **Dark or Demonic Runes** - ✅ Fixed: Removed confirmed check
- **Interrupted Spells** - ✅ Fixed: Removed confirmed check
- **Disarmed Enemies** - ✅ Fixed: Removed confirmed check
- **Scorch** (intentionally no confirmed check from the start)
- **Demoralizing Shout** - ✅ Fixed: Removed confirmed check
- **Polymorph** - ✅ Fixed: Removed confirmed check
- **Power Infusion** - ✅ Fixed: Removed confirmed check
- **Decurses** - ✅ Fixed: Removed confirmed check
- **World Buffs** - ✅ Fixed: Removed confirmed check
- **Avoidable Void Damage** - ✅ Fixed: Removed confirmed check
- **Curse of Recklessness** - ✅ Fixed: Removed confirmed check
- **Curse of Shadow** - ✅ Fixed: Removed confirmed check
- **Curse of the Elements** - ✅ Fixed: Removed confirmed check
- **Faerie Fire** - ✅ Fixed: Removed confirmed check

---

## Special "Confirmed" Player Set

**What is it?**
The `confirmed` set is built from players who appear in the main panels (damage, healing, base) as a way to ensure only actual raid participants get points.

**How it's built:** `rewardsEngine.cjs` lines 159-169
```javascript
const confirmedKeys = new Set();
if (basePanel && basePanel.size > 0) {
    basePanel.forEach((_, k) => confirmedKeys.add(k));
}
if (confirmedKeys.size === 0) {
    // Fallback: use any non-manual panel as confirmation source
    panels.forEach((m, panelKey) => {
        if (panelKey !== 'manual_points') {
            m.forEach((_, k) => confirmedKeys.add(k));
        }
    });
}
```

**Used by these panels:**
- Windfury Totems
- Sunder Armor
- Rocket Helmet
- Frost Resistance
- Attendance Streaks (with fallback)
- Guild Members (with fallback)
- Manual Points
- Big Buyer

---

## "Ignored Players" Pattern

**What is it?**
A filter to exclude non-player entities from rewards.

**Updated Logic:** `rewardsEngine.cjs` lines 314-322
```javascript
const shouldIgnorePlayer = (name) => {
    const n = String(name || '').trim();
    // Filter out names with spaces (usually non-player entities like "Windfury Totem")
    if (n.includes(' ')) return true;
    // Exact match filter for specific non-player entities
    const lower = n.toLowerCase();
    const exactMatches = ['zzold', 'totem', 'trap', 'dummy', 'battlechicken'];
    return exactMatches.includes(lower);
};
```

**Key Changes:**
- ✅ **Filters out any name with spaces** (e.g., "Windfury Totem", "Battle Chicken")
- ✅ **Exact name matches only** (e.g., "Totembob" is NOT filtered, only "totem" exact)
- ✅ No partial matches - protects player names that contain these words

**Used by:**
- Damage Dealers
- Healers
- Too Low Damage
- Too Low Healing

---

## Summary Statistics

### Panels with Filtering: **21 / 33**

### Common Filter Types:
1. **Confirmed player check:** 10 panels
2. **Role-based filtering:** 4 panels (Damage, Healing, Too Low DPS, Too Low HPS)
3. **Threshold filtering:** 8 panels (Windfury, Sunder, Curses, Faerie Fire, Attendance, Too Low)
4. **Ignore non-players:** 4 panels (Damage, Healing, Too Low DPS/HPS)
5. **Top N filtering:** 4 panels (Shaman/Priest/Druid healers, God Gamer)
6. **Exclude tanks:** 1 panel (Sunder Armor)

### Most Restrictive Panels:
1. **Sunder Armor:** Must be confirmed + not a tank + have sunder count > 0
2. **Damage Dealers:** Must not be ignored + be DPS/Tank role + have damage > 0
3. **Windfury Totems:** Must be confirmed + have valid party data + meet usage thresholds

### Least Restrictive Panels:
1. **Scorch:** No filtering at all (intentionally to avoid name mismatches)
2. **Curse panels:** Only filter `uptime >= 0` (includes 0% uptime)
3. **Standard consumables:** Accept all data from API

---

## Recommendations for Review

### Potential Issues:
1. **Curse panels accept 0% uptime** - Should players with 0% uptime be shown?
2. **Scorch has no confirmed check** - Could award points to non-raid participants
3. **Attendance/Guild Members use fallback** - Could include non-participants if confirmed set is empty
4. **Windfury baseline calculation** - Tank group contribution at half weight might need review

### Questions to Consider:
- Should all panels require the "confirmed" check?
- Should curse/faerie fire panels have a minimum uptime threshold (e.g., > 10%)?
- Should "ignored players" pattern be applied more broadly?
- Should consumable panels (mana pots, runes) have usage thresholds?

