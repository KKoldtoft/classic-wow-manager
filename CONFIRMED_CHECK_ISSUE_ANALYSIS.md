# "Confirmed Player" Check Issue - Analysis & Solution

## 🐛 The Problem

**Symptom:** Panels like **Faerie Fire** and **Demoralizing Shout** show NO data in Computed Mode, but suddenly show data after switching to Manual Mode.

---

## 🔍 Root Cause

### How "Confirmed" Players Are Defined

**Location:** `rewardsEngine.cjs` line 349

```javascript
// Players from logData (damage/healing combat logs)
const allPlayers = [];
const seen = new Set();
(byKey.logData||[]).filter(p=>!shouldIgnorePlayer(p.character_name)).forEach(p=>{
  const key = nameKey(p.character_name); if (seen.has(key)) return; seen.add(key);
  allPlayers.push({ name: p.character_name, class: p.character_class || 'Unknown' });
});

const confirmed = new Set(allPlayers.map(p => nameKey(p.name)));
```

**Key Point:** `confirmed` ONLY includes players who appear in `logData` (damage/healing combat logs).

### The Filtering Functions

**Location:** `rewardsEngine.cjs` lines 363-369, 423-432

```javascript
// Standard dataset function
const sumDataset = (arr, panelKey) => {
  (arr||[]).forEach(row => {
    const nm = row.character_name || row.player_name; if (!nm) return;
    const k = nameKey(nm); 
    if (!confirmed.has(k)) return; // ← FILTERS OUT "UNCONFIRMED" PLAYERS
    addRow(panelKey, nm, Number(row.points)||0);
  });
};

// Dataset with details (for curses/faerie fire)
const sumDatasetWithDetails = (arr, panelKey, detailsField = 'uptime') => {
  (arr||[]).forEach(row => {
    const nm = row.character_name || row.player_name; if (!nm) return;
    const k = nameKey(nm); 
    if (!confirmed.has(k)) return; // ← SAME ISSUE
    addRow(panelKey, nm, Number(row.points)||0);
    // Store details...
  });
};
```

---

## 📊 Panels Affected

### ❌ Panels Using `sumDataset` (with confirmed check):

1. **Engineering & Holywater** (abilities)
2. **Major Mana Potions** (mana_potions)
3. **Dark or Demonic Runes** (runes)
4. **Interrupted Spells** (interrupts)
5. **Disarmed Enemies** (disarms)
6. **Demoralizing Shout** (demo_shout) ← **USER REPORTED**
7. **Polymorph** (polymorph)
8. **Power Infusion** (power_infusion)
9. **Decurses** (decurses)
10. **World Buffs** (world_buffs_copy)
11. **Avoidable Void Damage** (void_damage)

### ❌ Panels Using `sumDatasetWithDetails` (with confirmed check):

12. **Curse of Recklessness** (curse_recklessness)
13. **Curse of Shadow** (curse_shadow)
14. **Curse of the Elements** (curse_elements)
15. **Faerie Fire** (faerie_fire) ← **USER REPORTED**

### ✅ Exception - Scorch (intentionally NO confirmed check):

**Location:** `rewardsEngine.cjs` lines 439-445

```javascript
// Scorch: include even if player not strictly in confirmed, to avoid misses from name mismatches
try {
  (byKey.scorchData||[]).forEach(row => {
    const nm = row.character_name || row.player_name; if (!nm) return;
    addRow('scorch', nm, Number(row.points)||0); // No confirmed check!
  });
} catch {}
```

**Comment explicitly says:** "include even if player not strictly in confirmed"

---

## 💡 Why Data Appears After Switching to Manual Mode

### Computed Mode Flow:
1. Backend `rewardsEngine.cjs` processes data
2. Applies `confirmed` check via `sumDataset`
3. Players NOT in combat logs are filtered out
4. Empty panels sent to frontend

### Manual Mode Flow:
1. Frontend creates snapshot from **current UI display**
2. Frontend pulls data directly from **individual APIs**:
   - `/api/faerie-fire-data/{eventId}`
   - `/api/demo-shout-data/{eventId}`
   - etc.
3. Frontend **does NOT** apply confirmed checks
4. All players with data are shown
5. Frontend scrapes this data and saves to database
6. Now manual mode shows the full data

**The snapshot bypasses the rewards engine entirely!**

---

## 🎯 Real-World Examples

### Example 1: Faerie Fire (Druids)

**Scenario:**
- A druid uses Faerie Fire throughout the raid
- Druid is a tank or has low DPS
- Druid doesn't appear in damage/healing rankings
- Druid is NOT in `confirmed` set

**Result in Computed Mode:**
- API has Faerie Fire data for the druid
- `sumDatasetWithDetails` checks `if (!confirmed.has(druid)) return`
- Druid's Faerie Fire data is skipped
- **Panel is empty**

**Result in Manual Mode:**
- Frontend fetches `/api/faerie-fire-data/{eventId}`
- Druid's data is in the API response
- Frontend displays it (no confirmed check)
- Snapshot saves it to database
- **Panel shows data**

### Example 2: Demoralizing Shout (Warriors)

**Scenario:**
- A warrior uses Demoralizing Shout
- Warrior is a tank with low DPS
- Warrior doesn't rank in damage dealers
- Warrior is NOT in `confirmed` set (or barely in it)

**Result in Computed Mode:**
- API has Demo Shout data for the warrior
- `sumDataset` checks `if (!confirmed.has(warrior)) return`
- Warrior's data is skipped
- **Panel is empty or missing warriors**

**Result in Manual Mode:**
- Frontend fetches `/api/demo-shout-data/{eventId}`  
- All warriors with demo shout appear
- Frontend displays and snapshots it
- **Panel shows data**

### Example 3: Why Some Players Might Be Missing

**Who gets filtered out:**
- **Tanks with low DPS** - Not in damage rankings
- **Dedicated debuffers** - Warriors who focus on sunder/demo shout
- **Support players** - Those who focus on utility over damage
- **Players with parsing issues** - Name mismatches in combat logs
- **Players who died early** - Minimal damage/healing recorded

---

## 🔧 The Solution

### ✅ **IMPLEMENTED** - Removed Confirmed Check from These Panels

**Logic:** If the API has data for a player, they were in the raid. Trust the API.

**Panels fixed:**
- All 11 panels using `sumDataset`
- All 4 panels using `sumDatasetWithDetails`

**Code changes implemented:** `rewardsEngine.cjs` lines 362-369, 422-433

```javascript
// BEFORE
const sumDataset = (arr, panelKey) => {
  (arr||[]).forEach(row => {
    const nm = row.character_name || row.player_name; if (!nm) return;
    const k = nameKey(nm); 
    if (!confirmed.has(k)) return; // ← REMOVED THIS
    addRow(panelKey, nm, Number(row.points)||0);
  });
};

// AFTER
const sumDataset = (arr, panelKey) => {
  (arr||[]).forEach(row => {
    const nm = row.character_name || row.player_name; if (!nm) return;
    // Removed confirmed check - if API has data for a player, they were in the raid
    addRow(panelKey, nm, Number(row.points)||0);
  });
};
```

**Same fix applied to `sumDatasetWithDetails` for curse and faerie fire panels.**

---

## 📈 Expected Impact After Fix

### Computed Mode (Before Fix):
- Empty panels for utility players
- Missing tanks, support players
- Inconsistent with frontend display

### Computed Mode (After Fix):
- All players with API data shown
- Matches frontend display exactly
- Consistent between computed and manual modes

### Manual Mode:
- **No change** - already works correctly

---

## 🧪 Testing Checklist

After implementing the fix, verify:

1. **Faerie Fire Panel:**
   - [ ] Druids appear in computed mode
   - [ ] All druids with FF data shown (not just DPS druids)
   - [ ] Uptime percentages display correctly

2. **Demoralizing Shout Panel:**
   - [ ] All warriors with demo shout appear
   - [ ] Tank warriors included
   - [ ] Data matches API response

3. **Curse Panels:**
   - [ ] All warlocks appear (not just DPS ranks)
   - [ ] Data matches manual mode

4. **Consumable Panels:**
   - [ ] All players who used consumables appear
   - [ ] No missing players due to low DPS

5. **Consistency Check:**
   - [ ] Computed mode matches manual mode (before edit)
   - [ ] No data disappears when switching modes
   - [ ] All panels populated correctly

---

## 🎓 Lessons Learned

### Good Pattern (Scorch):
```javascript
// Scorch: include even if player not strictly in confirmed, to avoid misses from name mismatches
(byKey.scorchData||[]).forEach(row => {
    const nm = row.character_name || row.player_name; if (!nm) return;
    addRow('scorch', nm, Number(row.points)||0);
});
```
**Why it works:** Trust the API, no confirmed check

### Bad Pattern (Most other panels):
```javascript
const k = nameKey(nm); 
if (!confirmed.has(k)) return; // Filters out valid players
```
**Why it fails:** Assumes only combat log players are valid

### The Philosophy:
**If an API has data for a player, that player was in the raid.**

Don't second-guess the API with overly strict filtering.

---

## Summary

**Root Cause:** The `confirmed` set is built ONLY from combat logs (damage/healing), but many panels need data for players who don't rank in damage/healing.

**Why It's Hidden:** In computed mode, the rewards engine filters them out. In manual mode, the frontend bypasses the engine and uses raw API data.

**Solution:** Remove confirmed checks from utility/consumable/ability panels that don't need strict raider verification.

**Affected Panels:** 15 panels total (11 using sumDataset, 4 using sumDatasetWithDetails)

**Why Scorch Works:** It intentionally skips the confirmed check - we should follow that pattern!

