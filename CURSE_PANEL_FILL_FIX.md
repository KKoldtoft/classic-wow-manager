# Curse Panel Fill Percentage Fix

**Date:** 2025-10-13  
**Issue:** Admin raidlogs page showed incorrect background fill for curse panels  
**Symptom:** Players with 0% uptime showed 100% filled bars on admin page

---

## 🐛 The Bug

### User Report

> "On the /raidlogs_admin page, in the Curse of Shadow panel, there is a player (Cesari) with 0.0% uptime but the bar background is 100% filled."

The public `/raidlogs` page displayed correctly, but the admin `/raidlogs_admin` page had incorrect fill percentages for all three curse panels.

---

## 🔍 Root Cause

### The Buggy Code (Lines 6015, 6082, 6149)

All three curse display functions had this problematic logic:

```javascript
// Get max uptime for percentage calculation
const maxUptime = Math.max(...playersWithUptime.map(p => Number(p.uptime_percentage||p.uptime||0))) || 1;

container.innerHTML = playersWithUptime.map((player, index) => {
    const position = index + 1;
    const characterClass = this.normalizeClassName(player.character_class);
    let fillPercentage = (Number(player.uptime_percentage||player.uptime||0) / maxUptime) * 100;
    if (index === 0) fillPercentage = 100;  // ❌ BUG: Forces #1 to always have 100% fill!
    fillPercentage = Math.max(5, Math.min(100, Math.round(fillPercentage)));

    const up = Number(player.uptime_percentage||player.uptime||0);
    const uptimeText = `${up.toFixed(1)}% uptime`;
```

### Two Problems

1. **Force 100% Fill for Rank #1:**
   ```javascript
   if (index === 0) fillPercentage = 100;  // ❌ Always forces first player to 100%
   ```
   
   **Impact:** If the list was sorted by points (not uptime), and the first player had 0 points and 0% uptime, they'd still show a 100% filled bar.

2. **Relative Fill (vs. Highest Player):**
   ```javascript
   let fillPercentage = (uptime / maxUptime) * 100;  // ❌ Relative to highest player
   ```
   
   **Impact:** If the highest player had 50% uptime, their bar would show 100% filled (misleading).

---

## ✅ The Fix

### New Code (Matches Faerie Fire Logic)

Changed all three curse functions to use **absolute uptime percentage**:

```javascript
// Use 100% as the max for uptime-based fill (not relative to highest player)
const maxUptime = 100;

container.innerHTML = playersWithUptime.map((player, index) => {
    const position = index + 1;
    const characterClass = this.normalizeClassName(player.character_class);
    const up = Number(player.uptime_percentage||player.uptime||0);
    const fillPercentage = Math.max(5, Math.min(100, Math.round(up))); // Use actual uptime % (5-100%)

    const uptimeText = `${up.toFixed(1)}% uptime`;
```

### Key Changes

1. ✅ **Removed** `if (index === 0) fillPercentage = 100;` line
2. ✅ **Changed** from relative fill (vs. highest player) to absolute fill (vs. 100% uptime)
3. ✅ **Simplified** calculation to directly use the player's uptime percentage
4. ✅ **Consistent** with Faerie Fire panel logic

---

## 📊 Behavior Comparison

### Before Fix (Admin Page)

| Player | Uptime | Rank | Fill % Shown | Expected Fill % | Status |
|--------|--------|------|--------------|-----------------|--------|
| Cesari | 0.0% | #1 | **100%** ❌ | 5% (minimum) | BUG |
| Dalila | 0.0% | #2 | 5% | 5% | OK |

### After Fix (Admin Page)

| Player | Uptime | Rank | Fill % Shown | Expected Fill % | Status |
|--------|--------|------|--------------|-----------------|--------|
| Cesari | 0.0% | #1 | **5%** ✅ | 5% (minimum) | FIXED |
| Dalila | 0.0% | #2 | 5% | 5% | OK |

### Public Page (Already Correct)

The public page (`/raidlogs`) was already calculating fill correctly based on uptime, not forcing rank #1 to 100%.

---

## 📝 Files Modified

### `public/raidlogs.js`

#### 1. `displayCurseRankings()` (Lines 6008-6015)
**Panel:** Curse of Recklessness

**Before:**
```javascript
const maxUptime = Math.max(...playersWithUptime.map(p => Number(p.uptime_percentage||p.uptime||0))) || 1;
// ...
let fillPercentage = (Number(player.uptime_percentage||player.uptime||0) / maxUptime) * 100;
if (index === 0) fillPercentage = 100;
fillPercentage = Math.max(5, Math.min(100, Math.round(fillPercentage)));

const up = Number(player.uptime_percentage||player.uptime||0);
```

**After:**
```javascript
const maxUptime = 100;
// ...
const up = Number(player.uptime_percentage||player.uptime||0);
const fillPercentage = Math.max(5, Math.min(100, Math.round(up)));
```

#### 2. `displayCurseShadowRankings()` (Lines 6073-6080)
**Panel:** Curse of Shadow

Same fix as above.

#### 3. `displayCurseElementsRankings()` (Lines 6138-6145)
**Panel:** Curse of the Elements

Same fix as above.

---

## 🎯 Expected Behavior

### Fill Percentage Now Represents Actual Uptime

| Uptime | Fill % | Visual Appearance |
|--------|--------|-------------------|
| 0% | 5% | Minimal fill (for visibility) |
| 25% | 25% | Quarter filled |
| 50% | 50% | Half filled |
| 75% | 75% | Three-quarters filled |
| 100% | 100% | Fully filled |
| 149% | 100% | Fully filled (capped at 100%) |

### Consistency Across Pages

- ✅ Admin page (`/raidlogs_admin`) now matches public page (`/raidlogs`)
- ✅ All curse panels use the same logic
- ✅ Consistent with Faerie Fire panel behavior
- ✅ Fill percentage accurately represents uptime percentage

---

## 🧪 Testing

### Test Cases

1. **Player with 0% uptime**
   - Expected: 5% fill (minimum for visibility)
   - Result: ✅ Correct

2. **Player with 50% uptime**
   - Expected: 50% fill
   - Result: ✅ Correct

3. **Player with 102% uptime (over 100%)**
   - Expected: 100% fill (capped)
   - Result: ✅ Correct

4. **Multiple players with 0% uptime**
   - Expected: All show 5% fill
   - Result: ✅ Correct (no more forced 100% for rank #1)

5. **Admin page vs. Public page**
   - Expected: Identical fill percentages
   - Result: ✅ Correct

---

## 🔗 Related Issues

This fix is part of ensuring **100% consistency between computed and manual modes**, and between admin and public pages.

### Related Fixes
- Name normalization (ensures same players appear on both pages)
- Fill percentage calculation (this fix - ensures same visual appearance)
- Data filtering (ensures same filtering logic everywhere)

---

## ✅ Validation

- ✅ All three curse display functions updated
- ✅ No linter errors
- ✅ Consistent with Faerie Fire panel logic
- ✅ Matches public page behavior
- ✅ Minimum 5% fill maintained for visibility
- ✅ Maximum 100% fill cap maintained

**Status:** COMPLETE ✨

---

## 📚 Notes for Future Development

### DO:
- ✅ Use absolute uptime percentage for fill (vs. 100%)
- ✅ Apply minimum 5% fill for visibility
- ✅ Cap maximum at 100% fill
- ✅ Keep admin and public page logic identical

### DON'T:
- ❌ Force rank #1 to have 100% fill
- ❌ Calculate fill relative to highest player
- ❌ Use different logic on admin vs. public pages
- ❌ Use `if (index === 0)` to override fill percentages

---

## 🎓 Why This Matters

**Visual accuracy is critical** for raid leaders to:
- Quickly identify who maintained debuffs effectively
- Understand actual performance (not misleading relative percentages)
- Make fair decisions about points and rewards
- Trust the data displayed on both admin and public pages

A 0% uptime should look like 0% (empty bar), not 100% (full bar)! 🎯

