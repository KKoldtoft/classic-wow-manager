# Zero Points Filter Bug - CRITICAL FIX

## 🐛 The REAL Problem

After removing the confirmed check, panels **STILL showed no data** because of a second, hidden filter:

**Line 353 in `rewardsEngine.cjs`:**
```javascript
const addRow = (panelKey, nm, pts)=>{ if(!pts) return; ...
```

**The bug:** `if(!pts)` treats **0 as falsy** and filters it out!

---

## 🔍 How This Affected Faerie Fire & Demo Shout

### Faerie Fire Panel:
**API Logic (index.cjs line 14020):**
```javascript
const earnedPoints = char.uptime_percentage >= uptimeThreshold ? points : 0;
// If uptime < 85% → 0 points
```

**Result:**
- Druid with 84% uptime → **0 points** → filtered out by `if(!pts)`
- Druid with 85% uptime → **10 points** → shown
- **Panel appeared empty** if all druids had < 85% uptime!

### Demoralizing Shout Panel:
**API Logic (index.cjs lines 14272-14277):**
```javascript
let earnedPoints = tier1Points; // default 0 for 0-99 range
if (demoShoutCount > tier2Max) earnedPoints = tier3Points; // 200+
else if (demoShoutCount > tier1Max) earnedPoints = tier2Points; // 100-199
// If count < 100 → 0 points
```

**Result:**
- Warrior with 99 demo shouts → **0 points** → filtered out by `if(!pts)`
- Warrior with 100 demo shouts → **5 points** → shown
- **Panel appeared empty** if all warriors had < 100 shouts!

---

## ✅ The Fix

### Changed Line 353-354:
**Before:**
```javascript
const addRow = (panelKey, nm, pts)=>{ 
    if(!pts) return; // ❌ Filters out 0, false, null, undefined, empty string
    const key=nameKey(nm); 
    const m=ensurePanel(panelKey); 
    m.set(key,(m.get(key)||0)+pts); 
};
```

**After:**
```javascript
const addRow = (panelKey, nm, pts)=>{ 
    if(pts == null) return; // ✅ Only filters out null and undefined, allows 0
    const key=nameKey(nm); 
    const m=ensurePanel(panelKey); 
    m.set(key,(m.get(key)||0)+pts); 
};
```

### What Changed:
- **`if(!pts)`** → Filters out: `0`, `false`, `null`, `undefined`, `""`, `NaN`
- **`if(pts == null)`** → Only filters out: `null`, `undefined`

**Now 0 points is a valid value!**

---

## 📊 Impact on ALL Panels

This fix affects **EVERY panel** because they all use `addRow`. Now panels can show:

### Players with 0 Points (Underperformers):
- ✅ **Faerie Fire:** Druids with < 85% uptime
- ✅ **Demo Shout:** Warriors with < 100 shouts  
- ✅ **Curse panels:** Warlocks with < threshold uptime
- ✅ **Sunder Armor:** Players with average performance (90-109% of avg)
- ✅ **Any panel:** Players who participated but didn't meet reward thresholds

### Why This Is Important:
- **Visibility:** See who underperformed, not just who earned rewards
- **Accountability:** Players can see their stats even if they get 0 points
- **Completeness:** Panel shows all participants, not just top performers
- **Fairness:** Negative points still work (they're not 0)

---

## 🎯 Before vs After

### Before This Fix:
```
Faerie Fire Panel:
[Empty - "No one qualified"]

Why: All druids had < 85% uptime → 0 points → filtered out
```

### After This Fix:
```
Faerie Fire Panel:
1. Druidtank    - 84% uptime - 0 pts
2. Druidhealer  - 78% uptime - 0 pts  
3. Feral        - 62% uptime - 0 pts

Data visible! Even though no one earned points.
```

---

## 🧪 Test Cases

### Test 1: Faerie Fire with All Low Uptime
- **Setup:** All druids have < 85% uptime
- **Before:** Empty panel
- **After:** All druids shown with 0 pts

### Test 2: Demo Shout with Low Usage
- **Setup:** All warriors have < 100 shouts
- **Before:** Empty panel
- **After:** All warriors shown with 0 pts

### Test 3: Mixed Performance
- **Setup:** Some players above threshold, some below
- **Before:** Only above-threshold shown
- **After:** All players shown (some with 0 pts, some with points)

### Test 4: Negative Points
- **Setup:** Player has negative points (e.g., Sunder -10)
- **Before:** Should work (negative is truthy)
- **After:** Still works ✅

### Test 5: Damage/Healing Panels
- **Setup:** Players ranked in damage
- **Before:** Only those awarded points shown
- **After:** Same behavior (works correctly) ✅

---

## 💡 Why We Needed Both Fixes

### Fix 1: Removed Confirmed Check
- **Problem:** Tank druids/warriors filtered out because not in `confirmed` set
- **Solution:** Trust the API data, don't filter by confirmed

### Fix 2: Allow 0 Points (THIS FIX)
- **Problem:** Players with 0 points filtered out by `if(!pts)`
- **Solution:** Change to `if(pts == null)` to allow 0

**Both fixes were necessary!** Without both:
1. Remove confirmed check alone → Still filtered by 0 points
2. Allow 0 points alone → Still filtered by confirmed check

---

## 🎓 Technical Details

### JavaScript Falsy Values:
```javascript
if (!value) // Filters out:
- false
- 0           ← This was the problem!
- "" (empty string)
- null
- undefined
- NaN
```

### Loose Equality (==) with null:
```javascript
if (value == null) // Only filters out:
- null
- undefined
```

**Note:** `==` (loose equality) treats `null` and `undefined` as equal, which is exactly what we want here.

---

## 🚀 Summary

**Root Cause:** `if(!pts)` filtered out 0 points, making panels appear empty when all players had 0 points.

**Fix:** Changed to `if(pts == null)` to only filter out missing data, not 0 points.

**Result:** ALL panels now show complete data, including players with 0 points (underperformers).

**Benefit:** Full transparency - players can see their stats even if they didn't earn rewards.

This was the **missing piece** that prevented the confirmed check fix from working!

