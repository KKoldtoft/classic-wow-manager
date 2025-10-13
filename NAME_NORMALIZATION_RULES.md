# Name Normalization Rules

**Last Updated:** 2025-10-13  
**Critical for:** Ensuring computed and manual mode show identical data

---

## 🎯 Core Principle

**ALL player name handling MUST be identical across frontend and backend to ensure data consistency between computed mode and manual mode.**

---

## ✅ The Rules

### Rule 1: Preserve Special Characters
**DO:** `"Plâyer" → "plâyer"` (trim + lowercase)  
**DON'T:** `"Plâyer" → "player"` (stripping special chars breaks matching)

**Why:** Players with accents, umlauts, etc. (â, ô, ü, ñ) must be consistently identified. Stripping special characters will cause names to not match between data sources.

### Rule 2: Case-Insensitive Matching
All name comparisons must use **lowercase** for consistency:
```javascript
const nameKey = (s) => String(s || '').trim().toLowerCase();
```

### Rule 3: Exact Character Preservation
- **Preserve:** Special characters (â, ô, ü, ñ, etc.)
- **Preserve:** Case (until lowercased for comparison)
- **Remove:** Only leading/trailing whitespace via `.trim()`

---

## 🔧 Implementation

### Backend: `rewardsEngine.cjs`

```javascript
// Name key for matching (lines 6-7)
const nameKey = (s) => String(s || '').trim().toLowerCase();

// Filter out non-players (lines 11-19)
const shouldIgnorePlayer = (name) => {
  const n = String(name || '').trim();
  // Filter out names with spaces (e.g., "Windfury Totem", "Battle Chicken")
  if (n.includes(' ')) return true;
  // Exact match filter (case-insensitive)
  const lower = n.toLowerCase();
  const exactMatches = ['zzold', 'totem', 'trap', 'dummy', 'battlechicken'];
  return exactMatches.includes(lower);
};
```

**Important:** There are TWO copies of this function in `rewardsEngine.cjs`:
1. Top-level scope (used by snapshot/manual mode)
2. Inside auto mode function (lines ~314-322)

**Both MUST be identical!**

### Frontend: `public/raidlogs.js`

```javascript
// Filter out non-players (lines 7478-7487)
shouldIgnorePlayer(name) {
    if (!name) return false;
    const n = String(name).trim();
    // Filter out names with spaces (e.g., "Windfury Totem", "Battle Chicken")
    if (n.includes(' ')) return true;
    // Exact match filter (case-insensitive)
    const lower = n.toLowerCase();
    const exactMatches = ['zzold', 'totem', 'trap', 'dummy', 'battlechicken'];
    return exactMatches.includes(lower);
}
```

### Frontend: `public/gold.js`

```javascript
// Filter out non-players (lines 1512-1522)
shouldIgnorePlayer(name) {
    if (!name) return false;
    const n = String(name).trim();
    // Filter out names with spaces (e.g., "Windfury Totem", "Battle Chicken")
    if (n.includes(' ')) return true;
    // Exact match filter (case-insensitive)
    const lower = n.toLowerCase();
    const exactMatches = ['zzold', 'totem', 'trap', 'dummy', 'battlechicken'];
    return exactMatches.includes(lower);
}
```

### Frontend: `public/raidlogs_view.html`

```javascript
// Filter out non-players (lines 549-559)
function shouldIgnoreViewerName(name){
  try {
    const n = String(name || '').trim();
    // Filter out names with spaces (e.g., "Windfury Totem", "Battle Chicken")
    if (n.includes(' ')) return true;
    // Exact match filter (case-insensitive)
    const lower = n.toLowerCase();
    const exactMatches = ['zzold', 'totem', 'trap', 'dummy', 'battlechicken'];
    return exactMatches.includes(lower);
  } catch { return false; }
}
```

---

## 🚫 What NOT To Do

### ❌ Don't Use Regex Word Boundaries
**BAD:**
```javascript
return /\b(zzold|totem|trap)\b/i.test(n);  // ❌ Word boundaries behave differently
```

**Why:** Word boundaries (`\b`) can match partial words and behave inconsistently with special characters.

### ❌ Don't Strip Special Characters
**BAD:**
```javascript
name.replace(/[^\w\s]/g, '')  // ❌ Strips â, ô, ü, etc.
name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // ❌ Removes accents
```

**Why:** This breaks name matching. "Plâyer" would become "Player" and not match "plâyer" in the database.

### ❌ Don't Use Different Filtering Logic
All four implementations MUST be identical:
- `rewardsEngine.cjs` (top-level)
- `rewardsEngine.cjs` (auto mode)
- `public/raidlogs.js`
- `public/gold.js`
- `public/raidlogs_view.html`

---

## 🧪 How to Test

### Test Case 1: Special Characters
```javascript
const name = "Plâyér";
const key = nameKey(name);
console.log(key);  // Should output: "plâyér" (NOT "player")
```

### Test Case 2: Ignore Non-Players
```javascript
shouldIgnorePlayer("Windfury Totem");     // true (has space)
shouldIgnorePlayer("Battle Chicken");     // true (has space)
shouldIgnorePlayer("totem");              // true (exact match)
shouldIgnorePlayer("Totembob");           // false (not exact match)
shouldIgnorePlayer("Warduro");            // false (not in list)
```

### Test Case 3: Case Insensitivity
```javascript
nameKey("PLÂYER") === nameKey("plâyer")   // true
nameKey("Plâyer") === nameKey("PLÂYER")   // true
```

---

## 📊 Data Flow

### Computed Mode
```
1. API returns player names from database (preserves special chars)
   ↓
2. rewardsEngine.cjs processes names using nameKey()
   ↓
3. Engine returns data to frontend
   ↓
4. Frontend displays using same nameKey() logic
```

### Manual Mode (Snapshot)
```
1. Frontend scrapes displayed data
   ↓
2. Saves to database with character_name as-is
   ↓
3. Later, loads from database
   ↓
4. Displays using same nameKey() logic
```

**Critical:** If normalization differs at ANY step, names won't match and players will appear/disappear between modes.

---

## ✅ Verification Checklist

When making any changes to name handling:

- [ ] All 5 `shouldIgnorePlayer` / `shouldIgnoreViewerName` functions are identical
- [ ] All `nameKey` functions use `.trim().toLowerCase()` only
- [ ] No special character stripping anywhere
- [ ] No regex word boundaries (`\b`)
- [ ] Test with special characters (â, ô, ü, ñ, etc.)
- [ ] Verify computed and manual mode show identical players
- [ ] Check that "Totembob" is NOT filtered (only exact "totem" is filtered)
- [ ] Check that "Warduro" is NOT filtered (not in exact match list)

---

## 🎓 Why This Matters

**User Request:** "To be clear, computed and manual mode must show the same data in all panels, no exceptions"

If name normalization differs between:
- Backend engine and frontend display
- Computed mode and manual mode
- Different files/functions

Then players will mysteriously appear/disappear when switching modes, which is unacceptable.

---

## 📝 Change History

### 2025-10-13
- **Fixed:** Unified all `shouldIgnorePlayer` implementations across all files
- **Fixed:** Changed from regex word boundaries to exact matches
- **Fixed:** Ensured special characters are preserved (Plâyer → plâyer, not player)
- **Files Updated:**
  - `rewardsEngine.cjs` (both copies)
  - `public/raidlogs.js`
  - `public/gold.js`
  - `public/raidlogs_view.html`

---

## 🔗 Related Files

- `rewardsEngine.cjs` - Backend engine (lines 6-19, ~314-322)
- `public/raidlogs.js` - Admin logs page (lines ~7478-7487)
- `public/gold.js` - Gold pot page (lines ~1512-1522)
- `public/raidlogs_view.html` - Public logs page (lines ~549-559)

