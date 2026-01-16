# Placeholder Player Feature Implementation

## Overview
This feature allows adding players to the roster **without a Discord ID**, which is useful when finding players in-game right before a raid starts who haven't joined the Discord server yet.

## Database Changes

### Schema Migration
Run `migrate-placeholder.sql` to update the database:

```sql
-- Adds is_placeholder column
-- Changes primary key structure to allow NULL discord_user_id
-- Adds unique constraints for position-based and discord-based uniqueness
```

### New Columns in `roster_overrides`
- `is_placeholder` (BOOLEAN) - Marks if this is a placeholder player
- `id` (SERIAL PRIMARY KEY) - New primary key to replace composite key
- Unique indexes ensure:
  - Only one player per position (event_id, party_id, slot_id)
  - Each real Discord user appears once per event

## Backend Endpoints

### 1. Add Placeholder
**POST** `/api/roster/:eventId/add-placeholder`

**Body:**
```json
{
  "characterName": "PlayerName",
  "characterClass": "warrior",
  "targetPartyId": 1,
  "targetSlotId": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Placeholder added successfully"
}
```

### 2. Remove Placeholder
**POST** `/api/roster/:eventId/remove-placeholder`

**Body:**
```json
{
  "partyId": 1,
  "slotId": 1
}
```

### 3. Convert Placeholder to Real Player
**POST** `/api/roster/:eventId/convert-placeholder`

**Body:**
```json
{
  "partyId": 1,
  "slotId": 1,
  "discordId": "123456789012345678",
  "characterName": "PlayerName",
  "characterClass": "warrior"
}
```

## Frontend Changes

### HTML Modals Added (`roster.html`)
1. **Add Placeholder Overlay** - Modal for creating placeholder
   - Character name input
   - Class dropdown (Warrior, Shaman, Paladin, etc.)
   
2. **Add Discord ID Overlay** - Modal for converting placeholder
   - Shows current placeholder info
   - Player search functionality
   - Converts placeholder to real player

### JavaScript Updates Needed (`roster.js`)

#### 1. Empty Slot Dropdown Menu
Add "Add Placeholder" option to `buildEmptySlotDropdownContent()`:

```javascript
function buildEmptySlotDropdownContent(partyId, slotId) {
    return `
        <div class="dropdown-header">Actions</div>
        <div class="dropdown-item" data-action="add-placeholder" data-target-party="${partyId}" data-target-slot="${slotId}">
            <i class="fas fa-user-plus menu-icon"></i>Add Placeholder
        </div>
        <div class="dropdown-item" data-action="add-new-character" data-target-party="${partyId}" data-target-slot="${slotId}">
            <i class="fas fa-plus menu-icon"></i>Add New Character
        </div>
        <div class="dropdown-item" data-action="add-existing-player" data-target-party="${partyId}" data-target-slot="${slotId}">
            <i class="fas fa-search menu-icon"></i>Add Existing Player
        </div>
    `;
}
```

#### 2. Placeholder Player Dropdown Menu
Modify `buildDropdownContent()` to handle placeholders:

```javascript
async function buildDropdownContent(player, isBenched) {
    if (!currentUserCanManage) {
        return '<div class="dropdown-header">Only management can edit</div>';
    }
    
    // Check if this is a placeholder
    if (player.isPlaceholder) {
        return `
            <div class="dropdown-header">Placeholder Actions</div>
            <div class="dropdown-item" data-action="add-discord-id" data-party-id="${player.partyId}" data-slot-id="${player.slotId}">
                <i class="fas fa-user-plus menu-icon"></i>Add Discord ID
            </div>
            <div class="dropdown-item" data-action="remove-placeholder" data-party-id="${player.partyId}" data-slot-id="${player.slotId}">
                <i class="fas fa-trash menu-icon"></i>Remove Placeholder
            </div>
        `;
    }
    
    // ... existing dropdown content for real players ...
}
```

#### 3. Red Skull Icon for Placeholders
Update `createPlayerCell()` to add skull icon:

```javascript
async function createPlayerCell(player, isBenched, isAbsent = false) {
    // ... existing code ...
    
    // Add skull icon for placeholders
    let placeholderIconHTML = '';
    if (player.isPlaceholder) {
        placeholderIconHTML = '<i class="fas fa-skull placeholder-icon" title="Placeholder - Add Discord ID" style="color: #ef4444; margin-left: 6px;"></i>';
    }
    
    cellDiv.innerHTML = `
        <div class="${nameClass}" data-character-name="${displayName}" data-discord-name="${player.name}">
            ${specIconHTML}${confirmationIconHTML}${placeholderIconHTML}<span>${displayName}</span>
        </div>
        <div class="player-details-dropdown">${dropdownContentHTML}</div>
    `;
    
    // ... rest of code ...
}
```

#### 4. Modal Handlers

**Add Placeholder Modal:**
```javascript
function openAddPlaceholderModal(partyId, slotId) {
    currentPlaceholderTarget = { partyId, slotId };
    const overlay = document.getElementById('add-placeholder-overlay');
    const nameInput = document.getElementById('placeholder-name-input');
    const classSelect = document.getElementById('placeholder-class-select');
    
    nameInput.value = '';
    classSelect.value = '';
    overlay.style.display = 'flex';
    nameInput.focus();
}

async function handleAddPlaceholder() {
    const nameInput = document.getElementById('placeholder-name-input');
    const classSelect = document.getElementById('placeholder-class-select');
    
    const characterName = nameInput.value.trim();
    const characterClass = classSelect.value;
    
    if (!characterName || !characterClass) {
        showAlert('Invalid Input', 'Please enter both name and class');
        return;
    }
    
    try {
        const response = await fetch(`/api/roster/${eventId}/add-placeholder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                characterName,
                characterClass,
                targetPartyId: currentPlaceholderTarget.partyId,
                targetSlotId: currentPlaceholderTarget.slotId
            })
        });
        
        if (!response.ok) throw new Error('Failed to add placeholder');
        
        closeAddPlaceholderModal();
        await renderRoster(); // Reload roster
        showAlert('Success', 'Placeholder added successfully');
    } catch (error) {
        showAlert('Error', error.message);
    }
}
```

**Add Discord ID Modal:**
```javascript
function openAddDiscordIdModal(player) {
    currentPlaceholderPlayer = player;
    const overlay = document.getElementById('add-discord-id-overlay');
    const nameDiv = document.getElementById('placeholder-current-name');
    const classDiv = document.getElementById('placeholder-current-class');
    const searchInput = document.getElementById('discord-id-search-input');
    
    nameDiv.textContent = player.mainCharacterName || player.name;
    classDiv.textContent = player.class;
    searchInput.value = '';
    
    overlay.style.display = 'flex';
    searchInput.focus();
}

async function searchPlayersForDiscordId(query) {
    if (query.length < 2) {
        // Show "type at least 2 characters" message
        return;
    }
    
    const response = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
    const players = await response.json();
    
    // Render search results
    const resultsDiv = document.getElementById('discord-id-search-results');
    // ... render player list with click handlers to convert placeholder ...
}

async function convertPlaceholderToPlayer(discordId, characterName, characterClass) {
    try {
        const response = await fetch(`/api/roster/${eventId}/convert-placeholder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partyId: currentPlaceholderPlayer.partyId,
                slotId: currentPlaceholderPlayer.slotId,
                discordId,
                characterName,
                characterClass
            })
        });
        
        if (!response.ok) throw new Error('Failed to convert placeholder');
        
        closeAddDiscordIdModal();
        await renderRoster();
        showAlert('Success', 'Placeholder converted to real player');
    } catch (error) {
        showAlert('Error', error.message);
    }
}
```

## Visual Indicators

### Red Skull Icon
- Displayed next to placeholder player names
- Color: `#ef4444` (red)
- Icon: `fas fa-skull`
- Tooltip: "Placeholder - Add Discord ID"

### CSS Styling
```css
.placeholder-icon {
    color: #ef4444;
    margin-left: 6px;
    font-size: 14px;
}

.roster-cell.placeholder-player {
    border: 2px dashed #ef4444 !important;
}
```

## Integration Points

### Assignments System
- Assignments will show placeholders in roster dropdown
- Placeholders can be assigned to roles
- Red skull icon will appear in assignments view
- When placeholder is converted, assignments are preserved

### Attendance System
- Placeholders are **excluded** from attendance tracking (no Discord ID)
- After conversion, player becomes eligible for attendance

### Points/Rewards System
- Placeholders receive **0 points** (no Discord ID to attribute)
- After conversion, player starts earning points from that raid forward
- Historical data remains unaffected

## Testing Checklist

- [ ] Add placeholder to empty slot
- [ ] Placeholder appears with red skull icon
- [ ] Click placeholder → shows "Add Discord ID" and "Remove Placeholder" options
- [ ] Remove placeholder works
- [ ] Add Discord ID → search finds players
- [ ] Convert placeholder → player becomes real with Discord ID
- [ ] Assignments work with placeholders
- [ ] Roster reload preserves placeholders
- [ ] Database constraints prevent duplicate positions
- [ ] Cannot add same Discord user twice to same event

## Deployment Steps

1. **Run Database Migration:**
   ```bash
   # On Heroku
   heroku pg:psql HEROKU_POSTGRESQL_ONYX_URL -f migrate-placeholder.sql
   ```

2. **Deploy Code:**
   ```bash
   git add .
   git commit -m "Add placeholder player feature"
   git push heroku HEAD:main
   ```

3. **Verify:**
   - Test adding placeholder
   - Test converting placeholder
   - Check assignments integration

## Known Limitations

1. **No Attendance Tracking**: Placeholders don't count toward attendance until converted
2. **No Points**: Placeholders receive 0 points in rewards system
3. **No Discord Notifications**: Cannot send DMs to placeholders
4. **Manual Conversion Required**: Must manually search and link Discord ID

## Future Enhancements

1. Auto-suggest Discord users based on character name similarity
2. Bulk convert multiple placeholders at once
3. Placeholder expiration (auto-remove after X days)
4. Placeholder history/audit log
5. Import placeholders from in-game roster addons
