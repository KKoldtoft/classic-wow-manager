# Status Banner & Debug Table - Implementation Summary

## Overview
Enhanced visibility of the raid logs system state and added a comprehensive debug tool for troubleshooting the `rewards_and_deductions_points` table.

---

## ✅ Changes Implemented

### 1. Enhanced Status Banner (engineBannerTop)
**Location:** `public/raidlogs.js` lines 1115-1201

**Visual Improvements:**
- **Clear Status Indicators:** Three color-coded badges showing TRUE/FALSE states
  - 🟢 **Computed Mode:** Green when TRUE, Red when FALSE
  - 🟢 **Manual Mode:** Green when TRUE, Red when FALSE  
  - 🟢 **Published:** Green when TRUE, Red when FALSE
- **Professional Design:** Purple gradient background, rounded corners, clean spacing
- **Clear Labels:** No technical jargon - just "Status:" with clear mode indicators
- **Quick Access:** Direct link to "📊 View Database Table" debug page

**How It Looks:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Status:  [Computed Mode: TRUE]  [Manual Mode: FALSE]  [Published: FALSE]  │  📊 View Database Table  │
└─────────────────────────────────────────────────────────────────────┘
```

**Color Coding:**
- Green (#22c55e): TRUE / Active state
- Red (#ef4444): FALSE / Inactive state
- Blue (#3b82f6): Action button

---

### 2. Database Debug Page
**Location:** `public/debug-table.html` (new file)

**Features:**
- **Full Table View:** Shows ALL columns from `rewards_and_deductions_points` table
- **Event-Scoped:** Only shows rows matching the current event_id
- **Auto-Status Detection:**
  - 🟢 **EMPTY (Computed Mode)** - Green badge when rowCount = 0
  - 🔴 **POPULATED (Manual Mode)** - Red badge when rowCount > 0
- **Refresh Button:** Reload data without page refresh
- **Export to CSV:** Download full table data for external analysis
- **Sortable Display:** Ordered by panel_key, rank, character_name
- **Rich Formatting:**
  - Panel keys shown as blue badges
  - Rank numbers in gold circles
  - NULL values clearly indicated in gray
  - JSON data preview with hover tooltip
  - Responsive table with horizontal scroll

**URL:** `/event/{eventId}/debug-table`

**Example:** `https://www.1principles.net/event/1423761549411225793/debug-table`

---

### 3. Backend API Endpoint
**Location:** `index.cjs` lines 2075-2102

**Endpoint:** `GET /api/rewards-snapshot-table/:eventId`

**Security:**
- ✅ Authentication required
- ✅ Management role required
- ✅ Returns 401 if not logged in
- ✅ Returns 403 if not management

**Response Format:**
```json
{
  "success": true,
  "eventId": "1423761549411225793",
  "rowCount": 150,
  "data": [
    {
      "id": 1,
      "event_id": "1423761549411225793",
      "panel_key": "damage",
      "panel_name": "Damage Dealers",
      "discord_user_id": "492023474437619732",
      "character_name": "PlayerName",
      "character_class": "Warrior",
      "ranking_number_original": 1,
      "point_value_original": 50,
      "character_details_original": "500 DPS",
      "primary_numeric_original": 500,
      "aux_json": {"some": "data"},
      "point_value_edited": 55,
      "character_details_edited": null,
      "primary_numeric_edited": null,
      "edited_by_id": "492023474437619732",
      "edited_by_name": "TheZapper",
      "updated_at": "2025-01-15T11:45:00Z",
      "panel_id": null
    }
    // ... more rows
  ]
}
```

**SQL Query:**
```sql
SELECT * FROM rewards_and_deductions_points 
WHERE event_id = $1 
ORDER BY panel_key, ranking_number_original NULLS LAST, character_name
```

---

## 📊 Table Columns Displayed

The debug page shows ALL columns from the database table:

| Column Name | Description | Display Format |
|-------------|-------------|----------------|
| `id` | Primary key | Plain number |
| `event_id` | Event identifier | Plain text |
| `panel_key` | Panel identifier (e.g., "damage", "healing") | Blue badge |
| `panel_name` | Human-readable panel name | Plain text |
| `discord_user_id` | Discord user ID (if linked) | Plain text or NULL |
| `character_name` | Player character name | Plain text |
| `character_class` | Character class | Plain text |
| `ranking_number_original` | Original rank number | Gold circle badge |
| `point_value_original` | Original computed points | Number |
| `character_details_original` | Original details text | Plain text or NULL |
| `primary_numeric_original` | Original numeric stat | Number or NULL |
| `aux_json` | Additional metadata (JSON) | JSON preview with tooltip |
| `point_value_edited` | Manually edited points | Number or NULL |
| `character_details_edited` | Edited details text | Text or NULL |
| `primary_numeric_edited` | Edited numeric stat | Number or NULL |
| `edited_by_id` | Discord ID of user who edited | Plain text or NULL |
| `edited_by_name` | Name of user who edited | Plain text or NULL |
| `updated_at` | Last update timestamp | ISO datetime |
| `panel_id` | Additional panel identifier | Plain text or NULL |

---

## 🎯 Use Cases

### Troubleshooting Manual Mode
**Problem:** "My edits aren't showing on the public page!"

**Debug Steps:**
1. Open `/event/{eventId}/raidlogs_admin`
2. Check status banner:
   - ✅ Manual Mode: TRUE
   - ✅ Published: TRUE
3. Click "📊 View Database Table"
4. Verify:
   - Row count > 0 (table is populated)
   - Your edited values are in `point_value_edited` column
   - `points` column shows final values
5. If missing → Re-save panels
6. If wrong values → Check `point_value_edited` vs `point_value_original`

### Confirming Computed Mode
**Problem:** "I want to make sure I'm in Computed Mode before editing"

**Debug Steps:**
1. Check status banner:
   - ✅ Computed Mode: TRUE
   - ✅ Manual Mode: FALSE
2. Click "📊 View Database Table"
3. Verify: "EMPTY (Computed Mode)" status
4. Row count should be 0
5. Safe to make first edit (will trigger auto-save)

### Verifying Published State
**Problem:** "Is my data actually published?"

**Debug Steps:**
1. Check status banner:
   - Published: TRUE/FALSE
2. Click "📊 View Database Table"
3. If Published: TRUE → Public pages can read this data
4. If Published: FALSE → Public pages show "not published" message
5. Data exists in table regardless of published flag

### Debugging Missing Players
**Problem:** "Player X isn't showing on a panel"

**Debug Steps:**
1. Open debug table
2. Search page (Ctrl+F) for player name
3. Check `panel_key` column - is player in correct panel?
4. Check `rank` column - what's their rank?
5. Check `points` column - do they have points?
6. If missing entirely → Not in database (import issue)
7. If wrong panel → Panel key mismatch (engine issue)
8. If rank 0 or NULL → Filtering issue (frontend display)

### Analyzing Edit History
**Problem:** "What changed in this panel?"

**Debug Steps:**
1. Open debug table
2. Filter by `panel_key` (use browser search)
3. Compare columns:
   - `point_value_original` vs `point_value_edited`
   - `character_details_original` vs `character_details_edited`
4. Check `updated_at` timestamps
5. If edited values are NULL → No manual edits made
6. If edited values differ → Manual changes applied

---

## 🔄 Workflow Integration

### New User Flow
```
1. Upload Logs
   └─> Status: Computed TRUE, Manual FALSE, Published FALSE
   └─> Table: EMPTY (0 rows)

2. Make First Edit
   └─> Auto-save triggered
   └─> Status: Computed FALSE, Manual TRUE, Published FALSE
   └─> Table: POPULATED (150+ rows)

3. Click Publish
   └─> Status: Computed FALSE, Manual TRUE, Published TRUE
   └─> Table: POPULATED (same rows, just marked published)

4. Make More Edits
   └─> Edits save instantly to database
   └─> Status: Unchanged (still Manual + Published)
   └─> Table: Updated rows (updated_at timestamps change)
   └─> Public pages see changes immediately!

5. Click Unpublish
   └─> Status: Computed FALSE, Manual TRUE, Published FALSE
   └─> Table: POPULATED (rows still exist, just hidden from public)

6. Revert to Computed
   └─> Status: Computed TRUE, Manual FALSE, Published FALSE
   └─> Table: EMPTY (all rows deleted)
```

---

## 🎨 Visual Design

### Status Banner Styling
```css
Background: Purple gradient (linear-gradient(135deg, #667eea 0%, #764ba2 100%))
Padding: 12px 20px
Border Radius: 8px
Margin Bottom: 20px

TRUE Badge:
  - Background: #22c55e (green)
  - Color: white
  - Padding: 4px 12px
  - Border Radius: 4px
  - Font Weight: 600

FALSE Badge:
  - Background: #ef4444 (red)
  - Color: white
  - Padding: 4px 12px
  - Border Radius: 4px
  - Font Weight: 600

Debug Button:
  - Background: #3b82f6 (blue)
  - Color: white
  - Padding: 4px 12px
  - Border Radius: 4px
  - Font Weight: 600
  - Hover: Subtle lift effect
```

### Debug Page Styling
```css
Page Background: Purple gradient
Container: White card with shadow
Table Header: Purple gradient, sticky on scroll
Row Hover: Light gray highlight
Panel Keys: Blue badges
Rank Numbers: Gold circle badges
NULL Values: Gray italic text
JSON Data: Truncated with hover tooltip
```

---

## 📝 Technical Notes

### Database Table Structure
```sql
CREATE TABLE rewards_and_deductions_points (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    panel_key VARCHAR(100) NOT NULL,
    panel_name VARCHAR(255) NOT NULL,
    discord_user_id VARCHAR(255),
    character_name VARCHAR(255) NOT NULL,
    character_class VARCHAR(50),
    ranking_number_original INTEGER,
    point_value_original INTEGER,
    character_details_original TEXT,
    primary_numeric_original INTEGER,
    aux_json JSONB,
    point_value_edited INTEGER,
    character_details_edited TEXT,
    primary_numeric_edited INTEGER,
    edited_by_id VARCHAR(255),
    edited_by_name VARCHAR(255),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    panel_id TEXT
);
```

### Key Relationships
- **One Event** → Many Rows (one per player per panel)
- **One Panel** → Many Players
- **One Player** → Multiple Panels

### Data Flow
```
COMPUTED MODE:
  Frontend ← Engine ← APIs (live data)
  Database: EMPTY

MANUAL MODE (First Edit):
  1. Frontend collects ALL panel data
  2. POST to /api/rewards-snapshot/:eventId
  3. Backend scrapes UI and writes to database
  4. Database: POPULATED

MANUAL MODE (Subsequent Edits):
  1. Frontend updates single value
  2. PUT to /api/rewards-snapshot/:eventId
  3. Backend updates specific row
  4. Database: UPDATED (updated_at changes)

PUBLISHED MODE:
  1. Same as Manual Mode
  2. Just sets header.published = true
  3. Public pages filter: WHERE published = true
  4. Database: Same rows, different filter
```

---

## ✨ Benefits

### For Debugging
- ✅ Instant visibility into table state (empty vs populated)
- ✅ See exact values stored in database
- ✅ Compare original vs edited values
- ✅ Verify published state matches expectation
- ✅ Export data for offline analysis

### For Users
- ✅ Clear visual feedback on current mode
- ✅ No confusion about Computed vs Manual vs Published
- ✅ One-click access to raw data
- ✅ Confidence that changes are saving correctly

### For Developers
- ✅ Easy troubleshooting without SQL queries
- ✅ Quick verification after code changes
- ✅ Clear understanding of data flow
- ✅ CSV export for bug reports

---

## 🚀 Testing Checklist

### Status Banner
- [ ] Banner shows on admin page load
- [ ] Computed Mode badge is green when in computed mode
- [ ] Manual Mode badge is green when in manual mode
- [ ] Published badge is green when published
- [ ] Colors change appropriately when toggling modes
- [ ] Debug button link works correctly

### Debug Page
- [ ] Page loads for authenticated management users
- [ ] 403 error for non-management users
- [ ] Event ID displays correctly
- [ ] Row count matches table length
- [ ] Status badge shows "EMPTY" when 0 rows
- [ ] Status badge shows "POPULATED" when rows exist
- [ ] All columns display correctly
- [ ] NULL values show as gray italic
- [ ] Panel keys show as blue badges
- [ ] Rank numbers show as gold circles
- [ ] JSON data shows preview with tooltip
- [ ] Refresh button reloads data
- [ ] Export CSV downloads correctly
- [ ] Back link returns to admin page

### Backend API
- [ ] Endpoint requires authentication
- [ ] Endpoint requires management role
- [ ] Returns correct data for event_id
- [ ] Sorts by panel_key, rank, character_name
- [ ] Includes all table columns
- [ ] Returns empty array for computed mode events
- [ ] Returns full data for manual mode events

---

## 📚 Summary

**Before:**
- No clear visibility of current mode
- Technical "Engine auto" / "Engine manual" terms
- No way to verify database state without SQL

**After:**
- Clear TRUE/FALSE indicators with color coding
- Plain language: "Computed Mode", "Manual Mode", "Published"
- One-click access to complete database table view
- Easy troubleshooting and verification
- Professional, user-friendly interface

**Key Features:**
1. **Status Banner:** Real-time visibility of all three states
2. **Debug Page:** Complete table view with all columns
3. **Export Function:** Download data for external analysis
4. **Auto-Detection:** Instantly shows if table is empty or populated
5. **Secure Access:** Management-only to protect sensitive data

The system now provides crystal-clear visibility into what's happening behind the scenes!

