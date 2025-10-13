# Current vs Desired System - Detailed Analysis

## 🎯 Your Desired Simplified Workflow

### Mode A: Computed Mode (Default)
- Page always starts in Computed Mode
- Data calculated from logs in real-time via rewards engine
- No database reads from `rewards_and_deductions_points`
- Manual Rewards panel still shows data from `manual_rewards_deductions` table

### Mode B: Manual Mode (Triggered by Edits or Publishing)
- ANY edit to ANY panel → Save ALL panels to `rewards_and_deductions_points` 
- Publishing → Save ALL panels if not already saved
- ALL subsequent data loaded from `rewards_and_deductions_points`
- No more engine calculation

### Publish/Unpublish Button
- Simple toggle of `published` column (true/false) in `rewards_snapshot_events`
- Does NOT create new snapshots
- Does NOT delete data
- Just controls visibility on public page

### Revert Button
- Delete ALL rows from `rewards_and_deductions_points` for this event_id
- Delete row from `rewards_snapshot_events` for this event_id
- Set published = false (or delete entire row)
- Page reloads in Computed Mode

---

## 📊 Current Actual System

### Current Initialization Flow

**Page Load Sequence:**
1. ✅ Fetches snapshot status: `GET /api/rewards-snapshot/:eventId/status`
   - Checks if row exists in `rewards_snapshot_events`
   - Returns `locked: true/false`

2. ✅ Fetches engine result: `GET /api/rewards/:eventId/effective`
   - Backend checks if snapshot exists
   - If exists → returns `mode: 'manual'` with data from `rewards_and_deductions_points`
   - If not → returns `mode: 'auto'` with computed data from rewards engine

3. Frontend sets mode:
   ```javascript
   this.snapshotLocked = false; // Default
   if (status.locked) this.snapshotLocked = true; // From status endpoint
   if (engineResult.mode === 'manual') this.snapshotLocked = true; // From engine
   ```

### Current Rendering Logic

**Line 3057: The Mode Decision**
```javascript
if (!this.snapshotLocked && this.engineResult) {
    // Use computed engine panels
} else {
    // Use API data OR snapshot data
}
```

**Problem:** This creates THREE data paths:
1. **Computed + Engine**: `!snapshotLocked && engineResult` → Use engine panels
2. **Computed + Fallback**: `!snapshotLocked && !engineResult` → Use API data
3. **Manual**: `snapshotLocked` → Use snapshot data from database

### Current Publish Flow

**When you click "Publish" (line 222-231):**
1. Calls `await this.lockSnapshotFromCurrentView()`
   - **Harvests ALL DOM elements** from currently rendered page
   - Creates array of entries by scraping `.ranking-item` elements
   - Sends to `POST /api/rewards-snapshot/:eventId/lock`
   - **Saves to `rewards_and_deductions_points`**
   
2. Calls `POST /api/rewards-snapshot/:eventId/publish`
   - Creates/updates row in `rewards_snapshot_events`
   - Sets `published = TRUE`
   - **Merges manual rewards** from `manual_rewards_deductions` into snapshot
   - Increments version number

**Result**: Publishing DOES save all panels to database (GOOD), but then toggles published flag (ALSO GOOD).

### Current Unpublish Flow

**Does NOT exist as a separate function!**

Instead, "Publish" button acts as toggle (line 224-248):
- If `currentlyPublished = false` → Run publish flow above
- If `currentlyPublished = true` → Run "refresh and republish" flow:
  1. Unpublish via `POST /api/rewards-snapshot/:eventId/unpublish`
  2. Unlock (delete all data) via `POST /api/rewards-snapshot/:eventId/unlock`
  3. Relock (save all panels again) via `lockSnapshotFromCurrentView()`
  4. Publish again

**Problem:** The "Refresh" flow deletes and recreates data instead of just refreshing.

### Current Revert Flow (line 276-286)

**When you click "faa-revert":**
1. Confirm dialog
2. Calls `POST /api/rewards-snapshot/:eventId/unlock`
   - **Deletes from `rewards_and_deductions_points`** ✅ CORRECT
   - **Deletes from `rewards_snapshot_events`** ✅ CORRECT
3. Reloads page → Starts in Computed Mode ✅ CORRECT

**Result**: Revert works EXACTLY as you want!

---

## 🔍 Gap Analysis: What Needs to Change

### ✅ Already Works as Desired

1. **Revert Button** - Perfect! Already deletes all data and reverts to computed
2. **Publish Saves Data** - Publish already calls `lockSnapshotFromCurrentView()` which saves all panels
3. **Database Structure** - Tables are correct (`rewards_and_deductions_points`, `rewards_snapshot_events`)
4. **Mode Detection** - System already knows computed vs manual

### ❌ Needs Changes

#### 1. **Missing: Auto-save on ANY Edit**

**Current**: Edits are saved per-panel-entry via `PUT /api/rewards-snapshot/:eventId/panel/:panelKey/entry`

**Desired**: First edit triggers full snapshot save of ALL panels

**Gap**: Need to detect "first edit since computed mode" and trigger `lockSnapshotFromCurrentView()`.

**Implementation Needed**:
```javascript
// In edit handler (line 3400-3550)
if (!this.snapshotLocked) {
    // First edit in computed mode!
    await this.lockSnapshotFromCurrentView(); // Save ALL panels
    this.snapshotLocked = true; // Switch to manual mode
    // Then apply the specific edit
}
```

#### 2. **Publish Button Should Be Simpler**

**Current**: Publishing harvests DOM and saves data (good) but also has complex "refresh" logic

**Desired**: 
- If not saved → Save all panels first, then toggle published = true
- If already saved → Just toggle published = true
- No "refresh and republish" complexity

**Gap**: The button does too much. Should separate concerns:
- **Save** = lockSnapshotFromCurrentView()
- **Publish** = toggle flag only

**Implementation Needed**:
```javascript
// Simplified publish button
if (!this.snapshotLocked) {
    // Not saved yet, save first
    await this.lockSnapshotFromCurrentView();
}
// Then just toggle publish status
const isPublished = this.snapshotHeader?.published || false;
if (isPublished) {
    await fetch(`/api/rewards-snapshot/${this.activeEventId}/unpublish`, { method: 'POST' });
} else {
    await fetch(`/api/rewards-snapshot/${this.activeEventId}/publish`, { method: 'POST' });
}
```

#### 3. **Refresh Button Behavior**

**Current**: Deletes everything, reharvests DOM, republishes

**Desired**: Probably same behavior? Or should it:
- Option A: Recompute engine data and update snapshot (keeping edits)
- Option B: Wipe and reharvest (current behavior)

**Your Call**: Need clarification on refresh button purpose.

#### 4. **Fallback Logic Complexity**

**Current**: Complex three-tier fallback (engine → API → catch)

**Desired**: Eliminate need for fallbacks by ensuring manual mode always has complete data

**Gap**: Fallbacks exist because computed mode + engine might have incomplete panels

**Implementation Needed**:
- When saving snapshot, ensure ALL panels are harvested (even empty ones)
- Or: Always use engine when in computed mode (no API fallback needed)

#### 5. **Public Page Data Source**

**Current**: Public page (`raidlogs_view.html`) fetches from:
- `GET /api/rewards-snapshot/:eventId` (published data only)
- Only shows data if `published = true`

**Desired**: Same! ✅ Already correct

**Note**: Public page ONLY shows data when `published = true`, so unpublish correctly hides it.

---

## 📋 Summary Table

| Feature | Current Behavior | Desired Behavior | Status |
|---------|------------------|------------------|--------|
| **Initial Load** | Checks snapshot status, loads engine/snapshot | Always start computed | ⚠️ Minor tweak |
| **First Edit** | Saves single entry to DB | Save ALL panels to DB | ❌ **Needs implementation** |
| **Subsequent Edits** | Updates single entry | Updates single entry | ✅ OK (after first save) |
| **Publish (Unpublished)** | Harvest DOM + toggle flag | Same (maybe simplify) | ⚠️ Works but complex |
| **Publish (Published)** | Delete+reharvest+republish | Just toggle flag | ❌ **Needs change** |
| **Unpublish** | No dedicated button | Toggle published = false | ❌ **Needs UI button** |
| **Refresh** | Delete+reharvest | ? Unclear desired behavior | ❓ **Need clarification** |
| **Revert** | Delete all + reload | Delete all + reload | ✅ **Perfect!** |
| **Computed Rendering** | Engine + fallbacks | Engine only? | ⚠️ Can simplify |
| **Manual Rendering** | Snapshot data | Snapshot data | ✅ Works |
| **Public Page** | Published snapshot only | Published snapshot only | ✅ Works |

---

## 🛠️ Required Changes (Prioritized)

### Priority 1: Critical for Desired Workflow

**A. Implement "First Edit Triggers Full Save"**
- Location: `public/raidlogs.js` lines 3400-3550 (edit handlers)
- Add check: `if (!this.snapshotLocked)` → call `lockSnapshotFromCurrentView()`
- Estimated: 50 lines of code

**B. Simplify Publish Button Logic**
- Location: `public/raidlogs.js` lines 222-265
- Remove "refresh and republish" complexity
- Make it: save if needed → toggle flag
- Estimated: Remove 30 lines, add 20 lines

### Priority 2: Nice to Have

**C. Add Dedicated Unpublish Button**
- Alternative: Make publish button text change to "Unpublish" when published
- Current button already toggles, just UI clarity needed

**D. Remove Fallback Logic**
- Location: `public/raidlogs.js` lines 3059-3150
- Once manual mode always has complete data, fallbacks unnecessary
- Estimated: Remove ~100 lines

### Priority 3: Optimization

**E. Simplify Mode Detection**
- Currently checks two sources (status endpoint + engine mode)
- Could consolidate to single source of truth
- Estimated: Refactor 50 lines

---

## 🎬 Conclusion

**The system is ~70% there!**

**Major Pieces Already Working:**
- ✅ Database tables correct
- ✅ Revert button perfect
- ✅ Publishing saves data
- ✅ Public page respects published flag
- ✅ Manual mode renders from database

**Key Missing Pieces:**
1. ❌ Auto-save on first edit (most important!)
2. ❌ Simplify publish button (remove refresh complexity)
3. ⚠️ Fallback logic exists but shouldn't be needed

**Effort Estimate:**
- **Small changes**: Priority 1 items (~2-3 hours work)
- **Medium changes**: Priority 2-3 items (~3-4 hours work)
- **Total**: ~5-7 hours to fully match desired workflow

The good news: The foundation is solid. Most changes are simplifications (removing complexity) rather than adding new features.


