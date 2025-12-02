# Option A Migration Guide: Add Class to Players PRIMARY KEY

## What This Changes

The `players` table PRIMARY KEY has been changed from:
```sql
PRIMARY KEY (discord_id, character_name)
```

To:
```sql
PRIMARY KEY (discord_id, character_name, class)
```

## What This Enables

✅ **Before (Blocked):**
- Player A has "Bob" (Warrior)
- Player A tries to add "Bob" (Mage) → ❌ BLOCKED

✅ **After (Allowed):**
- Player A has "Bob" (Warrior) ✅
- Player A has "Bob" (Mage) ✅
- Player A has "Bob" (Druid) ✅
- Player A tries to add another "Bob" (Warrior) → ❌ Still blocked (duplicate)

## Use Cases

This is useful for:
- **Bank alts:** Having multiple characters with the same name (e.g., "Bank") as different classes
- **Multi-realm guilds:** Same player with same character name on different servers playing different classes
- **Alt characters:** Players who like to use similar names across multiple characters

## Migration Steps

### Step 1: Backup Your Database (CRITICAL!)

```bash
# For Heroku
heroku pg:backups:capture --app classic-wow-manager

# For local PostgreSQL
pg_dump -U postgres -d your_database > backup_before_migration.sql
```

### Step 2: Run the Migration Script

**For Heroku:**
```bash
# Option 1: Using Heroku CLI
heroku pg:psql --app classic-wow-manager < migrate-players-pk.sql

# Option 2: Using Heroku Dashboard
# Go to Heroku Dashboard → Your App → Resources → Heroku Postgres → Settings → View Credentials
# Copy the migration SQL and run it in the Dataclips or psql session
```

**For Local Development:**
```bash
psql -U postgres -d your_database -f migrate-players-pk.sql
```

### Step 3: Verify Migration Success

Run this query to verify no duplicates exist:
```sql
SELECT discord_id, character_name, class, COUNT(*) 
FROM players 
GROUP BY discord_id, character_name, class 
HAVING COUNT(*) > 1;
```

**Expected result:** 0 rows (no duplicates)

### Step 4: Deploy Updated Code

The code changes in `index.cjs` need to be deployed:

```bash
git add .
git commit -m "Implement Option A: Add class to players PRIMARY KEY"
git push heroku master
```

## What Changed in the Code

### 1. Table Schema (`index.cjs` line ~7664)
```javascript
// OLD
PRIMARY KEY (discord_id, character_name)

// NEW
PRIMARY KEY (discord_id, character_name, class)
```

### 2. Duplicate Check Error Messages
All duplicate check error messages now clarify:
> "You already have a character named 'X' with class 'Y'. You can have multiple characters with the same name but different classes."

### 3. ON CONFLICT Clauses (Already Compatible!)
The code already had `ON CONFLICT (discord_id, character_name, class)` in several places, which will now work correctly with the new PRIMARY KEY.

## Testing Checklist

After migration, test these scenarios:

### ✅ Test 1: Add character with same name, different class
1. Go to roster page: `http://localhost:3000/event/{eventId}/roster`
2. Add a character: "TestChar" (Warrior) with discord_id `123`
3. Add another character: "TestChar" (Mage) with same discord_id `123`
4. **Expected:** Both should be added successfully ✅

### ✅ Test 2: Block duplicate name + class
1. Try to add another "TestChar" (Warrior) with discord_id `123`
2. **Expected:** Error message about duplicate ❌

### ✅ Test 3: Allow same name + class for different players
1. Add character: "TestChar" (Warrior) with discord_id `456`
2. **Expected:** Should be added successfully (different player) ✅

### ✅ Test 4: Logs Import Still Works
1. Go to logs page: `http://localhost:3000/event/{eventId}/logs`
2. Import a WoW log
3. Verify character matching works correctly
4. **Expected:** Characters match to correct discord users ✅

### ✅ Test 5: Gold Pot Still Works
1. Go to gold page: `http://localhost:3000/event/{eventId}/gold`
2. Verify gold distribution shows correct players
3. **Expected:** All players tracked correctly ✅

### ✅ Test 6: Loot Tracking Still Works
1. Go to loot page: `http://localhost:3000/event/{eventId}/loot`
2. Import loot data
3. **Expected:** Loot assigned to correct players ✅

## Rollback Plan

If something goes wrong, you can rollback:

### Step 1: Restore Database Backup
```bash
# For Heroku
heroku pg:backups:restore BACKUP_NAME --app classic-wow-manager

# For local
psql -U postgres -d your_database < backup_before_migration.sql
```

### Step 2: Revert Code Changes
```bash
git revert HEAD
git push heroku master
```

## Impact on Other Systems

### ✅ Safe (No Breaking Changes)
- **Roster management** - Works correctly
- **Assignments** - Not affected (uses event-specific roster_overrides)
- **Logs import** - Still matches by (name, class) correctly
- **Gold pot** - Still tracks by character name correctly
- **Loot system** - Still matches by character name correctly
- **Attendance** - Not affected (uses event participation data)

### ⚠️ Minor Considerations
- **Player search** - May return multiple results for same name (different classes) - this is expected behavior
- **Alt detection** - Now correctly groups characters with same name but different classes as alts for the same player

## Questions?

If you encounter any issues:
1. Check the Heroku logs: `heroku logs --tail --app classic-wow-manager`
2. Verify the migration ran successfully with the verification query above
3. Test each page systematically using the checklist
4. If all else fails, use the rollback plan

## Summary

✅ This is a **safe migration** that:
- Enables a common use case (same name, different class)
- Maintains all existing functionality
- Provides better error messages
- No breaking changes to other systems

