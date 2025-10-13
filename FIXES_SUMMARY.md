# Comprehensive Fixes for Totems & Faerie Fire Issues

## What Was Fixed

### Fix #1: Totem API Filtering (Backend - `index.cjs`)

**Problem**: The `/api/windfury-data/:eventId` endpoint was filtering out Grace of Air, Strength of Earth, and Tranquil Air totems that didn't meet BOTH `totems_used >= 10` AND `points > 0` criteria.

**Root Cause**: Lines 11642-11643 were too restrictive:
```javascript
// OLD (too strict):
return Number(entry.totems_used || 0) >= 10 && Number(entry.points || 0) > 0;
```

**Solution**: Removed the `points > 0` requirement to allow all totem types that meet minimum usage threshold to be visible:
```javascript
// NEW (relaxed):
return Number(entry.totems_used || 0) >= 10;
```

**Why This Matters**: Even if a shaman placed 15 Grace of Air totems but earned 0 points (because they didn't meet the Windfury baseline requirement), they should still be visible for admin review and publishing.

---

### Fix #2: Faerie Fire & Curses Fallback Logic (Frontend - `public/raidlogs.js`)

**Problem**: When the engine panel was empty (no confirmed players), the frontend would display nothing. The catch-block fallback never triggered because no error was thrown.

**Root Cause**: Engine enrichment logic (lines 3080, 3060, 3074, 3088) would create empty arrays without error:
```javascript
const rows=(p&&p.rows)||[]; // Empty array if panel doesn't exist
const enriched=rows.map(...); // Empty enriched array
this.displayFaerieFireRankings(enriched); // Shows "Nothing to see" but no error
```

**Solution**: Added explicit fallback checks for all 4 panels (Faerie Fire, Curse Recklessness, Curse Shadow, Curse Elements):
```javascript
const rows=(p&&p.rows)||[];
// NEW: If engine has no data but API does, use API data directly
if (rows.length === 0 && (this.faerieFireData||[]).length > 0) {
    console.log('[FAERIE FIRE] Engine panel empty, using API fallback data:', this.faerieFireData);
    this.displayFaerieFireRankings(this.faerieFireData);
} else if (rows.length > 0) {
    // Otherwise enrich from engine as before
    // ... enrichment logic ...
}
```

**CRITICAL BUG FIX (v2)**: Changed from using `return;` to `if-else` structure to prevent early exit from `displayRaidLogs()` function which was causing page to freeze.

**Why This Matters**: If the rewards engine doesn't include a panel (due to name matching issues or empty confirmed set), the frontend will now fallback to using the raw API data instead of showing nothing.

---

### Fix #3: Debug Logging (Backend & Frontend)

**Added Comprehensive Logging**:

**Backend (`rewardsEngine.cjs`)**:
- Line 425: Logs count of curse/faerie fire data being processed
- Line 399: Logs total windfury entries and totem types
- Line 407: Logs when a player is skipped due to not being confirmed
- Line 600: Logs final panel counts for faerie_fire and windfury_totems

**Frontend (`public/raidlogs.js`)**:
- Lines 3064, 3078, 3092, 3106: Logs when fallback to API data is used
- Line 3116: Logs errors in enrichment

**Why This Matters**: When testing on localhost, you'll now see clear console logs explaining what's happening and why certain panels are empty or showing data.

---

## What You Should Test on Localhost

### Test 1: Totems Displaying All 4 Types
1. Go to admin page: `http://localhost:3000/event/1424486319723253800/raidlogs_admin`
2. Revert to computed if published
3. Check "Totems" panel - should now show all 4 totem types (Windfury, Grace of Air, Strength of Earth, Tranquil Air) if shamans placed at least 10 of each
4. Open browser console and look for `[ENGINE] Processing windfury data` log showing all totem types

### Test 2: Faerie Fire in Computed Mode
1. On admin page in computed mode
2. Check "Faerie Fire" panel - should now show players with Faerie Fire data
3. If panel is empty, check console for:
   - `[ENGINE] Processing curse/faerie fire data` - see if faerie data count is > 0
   - `[FAERIE FIRE] Engine panel empty, using API fallback data` - indicates fallback worked
   - If you see "Skipping X (not confirmed)" - indicates name matching issue

### Test 3: Publishing Snapshot
1. With all panels visible on admin page, click "Publish"
2. Wait for snapshot creation
3. Check public page: `http://localhost:3000/event/1424486319723253800/raidlogs`
4. Verify all totem types and Faerie Fire data are visible

### Test 4: Curse Panels
1. Check that Curse of Recklessness, Curse of Shadow, and Curse of Elements all show data in computed mode
2. Look for fallback logs if any are empty

---

## Console Logs to Watch For

### Successful Engine Processing:
```
[ENGINE] Processing curse/faerie fire data - curse:2, shadow:3, elements:4, faerie:2
[ENGINE] Processing windfury data - total entries:8, types: ["Windfury Totem", "Grace of Air Totem", "Strength of Earth Totem"]
[ENGINE] Built panels output - total panels:25, faerie_fire rows:2, windfury_totems rows:8
```

### Fallback Activation:
```
[FAERIE FIRE] Engine panel empty, using API fallback data: [{character_name: "Bujak", uptime_percentage: 64, ...}]
```

### Name Matching Issues:
```
[ENGINE] Windfury: Skipping Shamanname (not confirmed)
```

---

## Possible Remaining Issues

### If Faerie Fire Still Doesn't Show in Computed Mode:
1. **API Returns Empty Data**: Check if `/api/faerie-fire-data/:eventId` returns data
   - Open Network tab, refresh page, find the API call
   - Check response body for `data` array
   - If empty, check database: `SELECT * FROM sheet_player_abilities WHERE event_id = 'X' AND ability_name LIKE 'Faerie Fire%'`

2. **Name Matching Failure**: Check console for "Skipping X (not confirmed)" logs
   - This means the player's name in `sheet_player_abilities` doesn't match any name in the log data
   - Compare exact spelling/capitalization between tables

3. **Confirmed Players Empty**: Check if `byKey.logData` is populated
   - The engine only includes players who appear in log data

### If Totems Still Only Show Windfury:
1. **Shamans Didn't Meet Threshold**: Check if shamans placed at least 10 of each totem type
   - Query database: `SELECT * FROM sheet_player_abilities WHERE event_id = 'X' AND ability_name LIKE '%Totem%'`
2. **API Still Filtering**: Verify the code change was applied correctly (lines 11642-11645 in `index.cjs`)

---

## Next Steps

1. **Test on Localhost**: Verify all fixes work as expected
2. **Check Console Logs**: Understand what's happening behind the scenes
3. **If Issues Persist**: Share console logs with me for further diagnosis
4. **Deploy When Ready**: Use your separate deployment workflow


