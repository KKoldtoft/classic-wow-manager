# Placeholder Player Feature - Testing Guide

## Prerequisites

Before testing, you need to run the database migration:

### Local Testing
```bash
# Connect to your local database and run:
psql -d your_database -f migrate-placeholder.sql
```

### Heroku Deployment
```bash
# Run migration on Heroku
heroku pg:psql HEROKU_POSTGRESQL_ONYX_URL -f migrate-placeholder.sql

# Deploy the code
git add .
git commit -m "Add placeholder player feature for roster management"
git push heroku HEAD:main
```

## Test Scenarios

### 1. Add Placeholder to Empty Slot ✅

**Steps:**
1. Navigate to roster page for any event
2. Find an empty slot in the roster grid
3. Left-click the empty slot
4. Dropdown menu should appear with options:
   - **Add Placeholder** (NEW)
   - Add New Character
   - Add Existing Player
5. Click "Add Placeholder"
6. Modal appears with:
   - Character Name input field
   - Class dropdown (Warrior, Shaman, Paladin, etc.)
7. Enter name: "TestPlayer"
8. Select class: "Warrior"
9. Click "Add Placeholder"

**Expected Result:**
- Modal closes
- Player appears in the slot with:
  - Red skull icon (💀) next to name
  - "PLACEHOLDER" label in top-right corner
  - Dashed red border around cell
  - Warrior class color background

### 2. View Placeholder Dropdown Menu ✅

**Steps:**
1. Left-click on the placeholder player you just added
2. Dropdown menu should appear

**Expected Result:**
Menu shows ONLY two options:
- **Add Discord ID** (with user-plus icon)
- **Remove Placeholder** (with trash icon)

No other options should appear (no move, no spec swap, etc.)

### 3. Remove Placeholder ✅

**Steps:**
1. Click on placeholder player
2. Click "Remove Placeholder"
3. Confirm the action

**Expected Result:**
- Placeholder is removed
- Slot becomes empty again
- Can add new player/placeholder to that slot

### 4. Add Discord ID to Placeholder ✅

**Steps:**
1. Click on placeholder player
2. Click "Add Discord ID"
3. Modal appears showing:
   - Current Name: "TestPlayer"
   - Current Class: "Warrior"
   - Search Player input field
4. Type at least 2 characters of a real player's name
5. Search results appear with matching players
6. Click on a player from the search results

**Expected Result:**
- Modal closes
- Placeholder converts to real player
- Red skull icon disappears
- Dashed border becomes solid
- Player now has full functionality (move, spec swap, etc.)
- Player's Discord ID is now linked

### 5. Placeholder in Assignments ✅

**Steps:**
1. Add a placeholder to roster
2. Navigate to Assignments page
3. Open any boss panel in edit mode
4. Try to assign the placeholder to a role

**Expected Result:**
- Placeholder appears in the character dropdown
- Can be assigned to roles
- Shows with red skull icon in assignments view
- After converting to real player, assignments are preserved

### 6. Multiple Placeholders ✅

**Steps:**
1. Add 3-4 placeholders with different names and classes
2. Verify each has unique visual indicators
3. Convert one to real player
4. Others remain as placeholders

**Expected Result:**
- All placeholders show correctly
- Each can be managed independently
- Converting one doesn't affect others

### 7. Database Constraints ✅

**Steps:**
1. Add placeholder to slot 1
2. Try to add another player to same slot

**Expected Result:**
- Error: "Slot is already occupied"

**Steps:**
1. Convert placeholder to Discord user X
2. Try to add Discord user X again to roster

**Expected Result:**
- Error: "This player is already in the roster"

### 8. Placeholder Edge Cases

#### Test A: No Discord ID in Systems
**Verify:**
- Placeholder doesn't appear in attendance tracking
- Placeholder gets 0 points in rewards system
- Cannot send Discord DMs to placeholder

#### Test B: After Conversion
**Verify:**
- Player appears in attendance (from that raid forward)
- Player earns points normally
- Can receive Discord DMs
- Player history/alts work correctly

#### Test C: Roster Reload
**Steps:**
1. Add placeholder
2. Refresh page (F5)

**Expected:**
- Placeholder persists
- Still shows red skull icon
- Still functional

## Visual Verification Checklist

### Placeholder Indicators
- [ ] Red skull icon appears next to name
- [ ] Skull icon has pulsing animation
- [ ] "PLACEHOLDER" label in top-right corner
- [ ] Dashed red border (2px)
- [ ] Background color matches class

### Modal Appearance
- [ ] Add Placeholder modal styled correctly
- [ ] Class dropdown shows all 9 classes
- [ ] Add Discord ID modal shows current info
- [ ] Player search works with debouncing
- [ ] Search results are class-colored

### Dropdown Menus
- [ ] Empty slot shows "Add Placeholder" as first option
- [ ] Placeholder player shows only 2 options
- [ ] Real player shows full menu (move, spec, etc.)

## Common Issues & Solutions

### Issue: Placeholder not appearing after add
**Solution:** Check browser console for errors. Verify database migration ran successfully.

### Issue: Red skull icon not showing
**Solution:** Check that `player.isPlaceholder` is true in the data. Verify CSS loaded.

### Issue: Cannot convert placeholder
**Solution:** Ensure player search returns results. Check Discord ID format (17-19 digits).

### Issue: Database error on add
**Solution:** Run migration script. Check that unique constraints are in place.

## Cleanup

After testing, you can remove test placeholders:
1. Click placeholder → Remove Placeholder
2. Or delete from database:
```sql
DELETE FROM roster_overrides WHERE is_placeholder = TRUE AND event_id = 'YOUR_EVENT_ID';
```

## Success Criteria

All tests pass when:
- ✅ Can add placeholder to empty slot
- ✅ Placeholder shows with red skull icon
- ✅ Placeholder dropdown menu works
- ✅ Can remove placeholder
- ✅ Can convert placeholder to real player
- ✅ Assignments work with placeholders
- ✅ Systems exclude placeholders appropriately
- ✅ Database constraints prevent duplicates
- ✅ Page reloads preserve placeholders
- ✅ No console errors during operations

## Performance Notes

- Placeholder operations are fast (single DB query)
- Player search is debounced (300ms)
- No impact on existing roster functionality
- Placeholders don't slow down attendance/points calculations

## Rollback Plan

If issues occur in production:

1. **Disable feature in UI:**
   - Comment out "Add Placeholder" option in `buildEmptySlotDropdownContent()`

2. **Remove existing placeholders:**
```sql
DELETE FROM roster_overrides WHERE is_placeholder = TRUE;
```

3. **Revert database changes:**
```sql
ALTER TABLE roster_overrides DROP COLUMN IF EXISTS is_placeholder;
-- Restore original primary key if needed
```
