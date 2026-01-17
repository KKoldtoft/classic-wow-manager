# My Character Highlight Feature

## Overview
This feature automatically highlights and animates the logged-in user's character names across all panels on the `/raidlogs` page, making it easy to spot your own characters in rankings and statistics.

## Implementation Details

### 1. Backend Changes (`index.cjs`)
- **Modified `/user` endpoint** (line 3125-3167) to include user's character data
- Fetches all characters linked to the user's Discord ID from the `players` table
- Returns array of character objects with `name` and `class` properties

**Response Format:**
```json
{
  "loggedIn": true,
  "id": "user_discord_id",
  "username": "username",
  "characters": [
    { "name": "CharacterName", "class": "warrior" },
    { "name": "AltName", "class": "priest" }
  ],
  ...
}
```

### 2. CSS Animations (`public/raidlogs.css`)
Added comprehensive animation styles (lines 3270-3387):

#### Animation Keyframes
- **`myCharacterPulse`**: 2-second animation with multiple pulses
- Scales text from 1x to 1.15x with golden glow
- Creates a pulsing effect with smooth easing
- Responsive variant for mobile devices (smaller scale)

#### CSS Classes
- **`.my-character`**: Applied to character names belonging to logged-in user
  - Triggers the pulse animation on page load/scroll
  - Golden text-shadow glow effect
  - Transform origin set to center
  
- **`.my-character.animation-triggered`**: Prevents re-animation
  
- **`.my-character.animation-complete`**: Permanent subtle glow after animation
  - Maintains `text-shadow: 0 0 3px rgba(255, 215, 0, 0.4)`
  - Increases font-weight to 700

#### Visual Effects
- Golden glow (`rgba(255, 215, 0, ...)`) for premium feel
- Multiple text-shadow layers for depth
- Scale transform for zoom effect
- Works across all panel contexts (rankings, stats, manual rewards)

### 3. JavaScript Functionality

#### Implementation in `public/raidlogs.js` (Admin View)
**New Method: `highlightMyCharacters()`** (lines 9204-9301)

#### Implementation in `public/raidlogs_view.html` (Public View)
**New Function: `highlightMyCharacters()`** (added at end of file)

Both implementations work identically:

**Purpose**: Identifies and animates user's character names across the page

**Process:**
1. **Fetch User Data**
   - Calls `/user` endpoint
   - Retrieves `characters` array from response

2. **Character Name Collection**
   - Extracts character names from `currentUser.characters`
   - Normalizes to lowercase for case-insensitive matching

3. **DOM Element Detection**
   - Searches for `.character-name` elements (main panels)
   - Searches for `.stat-value` elements (dashboard cards)
   - Checks if element text contains any of user's character names

4. **Animation Setup with IntersectionObserver**
   - Creates observer to trigger animation when elements scroll into view
   - Threshold: 10% visibility
   - Root margin: 50px (starts animation slightly before visible)

5. **Immediate Animation for Visible Elements**
   - Triggers animation for elements already in viewport on page load
   - 300ms delay ensures DOM is fully rendered

#### Integration Points
**Admin View (`/raidlogs_admin` using `raidlogs.html` + `raidlogs.js`):**
- Line 958 in `raidlogs.js`: Called after main data display
- Line 5583 in `raidlogs.js`: Called after manual rewards are rendered

**Public View (`/raidlogs` using `raidlogs_view.html`):**
- Line 2297 in `raidlogs_view.html`: Called after all panels are rendered
- Function defined inline at end of main script block

### 4. User Experience

#### On Page Load
1. Page loads raid logs data
2. All panels render
3. System fetches user's linked characters
4. Character names are detected across all panels
5. **Visible names animate immediately** (2s pulse/zoom)
6. **Hidden names animate when scrolled into view**
7. After animation completes, names retain subtle golden glow

#### Animation Behavior
- **Duration**: 2 seconds
- **Effect**: Pulsing zoom (1.0x → 1.15x → 1.0x) with golden glow
- **Frequency**: Multiple pulses during 2-second window
- **Trigger**: 
  - On page load (for visible elements)
  - **Every time the name scrolls into view** (repeatable animation)
  - After manual rewards update

#### Smart Viewport Detection
- Uses IntersectionObserver to detect when names enter/exit viewport
- **When name scrolls into view**: Animation triggers
- **When name scrolls out of view**: Glow is removed
- **When name scrolls back into view**: Animation triggers again
- This creates a "beacon" effect that helps you spot your characters as you scroll

#### Permanent Indicator
While in viewport after animation completes:
- Subtle golden glow remains
- Increased font weight (700)
- Easier to spot your characters

When out of viewport:
- Glow is removed to allow fresh animation on next scroll-in

## Browser Compatibility
- Uses IntersectionObserver API (supported in all modern browsers)
- CSS animations with vendor prefixes handled by modern browsers
- Graceful degradation: characters still visible without animation

## Performance Considerations
- Lightweight: Only animates detected character names
- IntersectionObserver is efficient (no scroll event listeners)
- One-time animation per element (marked with `.animation-triggered`)
- Small DOM manipulation footprint

## Testing Checklist
- [ ] User with linked characters sees names highlighted
- [ ] User without linked characters sees no errors
- [ ] Animation triggers on page load for visible characters
- [ ] Animation triggers on scroll for hidden characters
- [ ] Manual rewards section highlights correctly
- [ ] Multiple character names all get highlighted
- [ ] Animation completes after 2 seconds
- [ ] Permanent glow remains after animation
- [ ] Works on mobile devices (responsive animation)
- [ ] No console errors in browser

## Future Enhancements (Optional)
1. Add user preference to disable animation
2. Allow customization of animation color/duration
3. Add tooltip showing "This is your character"
4. Highlight in other pages (attendance, roster, etc.)
5. Sound effect on detection (optional, user toggle)
