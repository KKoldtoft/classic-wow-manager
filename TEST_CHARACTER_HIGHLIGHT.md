# Testing Character Highlight Feature

## Test Environment
- **URL**: http://localhost:3000/event/1456383996995834104/raidlogs
- **User Discord ID**: 492023474437619732
- **Character**: Zaappi

## Testing Steps

### 1. Verify Backend Endpoint
Open browser console and run:
```javascript
fetch('/user').then(r => r.json()).then(data => console.log(data))
```

**Expected Output:**
```json
{
  "loggedIn": true,
  "id": "492023474437619732",
  "username": "...",
  "characters": [
    { "name": "Zaappi", "class": "warrior" }
  ],
  ...
}
```

### 2. Check Console Logs
After page loads, look for these console messages:
- `👤 Highlighting user's characters: zaappi`
- `✨ Found X instances of user's characters`

### 3. Verify Character Detection
In console, run:
```javascript
document.querySelectorAll('.character-name')
```
Find elements containing "Zaappi" and check if they have class `my-character`

### 4. Check Animation Class
```javascript
document.querySelectorAll('.my-character')
```
Should return all instances of your character names

### 5. Visual Verification
- Look for "Zaappi" on the page
- Should see golden glow and zoom effect for 2 seconds
- After animation, should have subtle permanent glow

## Troubleshooting

### If characters array is empty:
Check database:
```sql
SELECT * FROM players WHERE discord_id = '492023474437619732';
```

### If no animation:
1. Check browser console for errors
2. Verify CSS is loaded: Look for `raidlogs.css` in Network tab
3. Check if `.my-character` class is applied to elements
4. Verify IntersectionObserver is supported (should be in all modern browsers)

### If character found but no animation:
1. Check if element is actually visible on page load
2. Try scrolling away and back - animation should trigger
3. Check CSS animation in DevTools → Elements → Computed styles

## Debug Commands

### Check if user has characters:
```javascript
fetch('/user').then(r => r.json()).then(u => console.log('Characters:', u.characters))
```

### Check if elements are detected:
```javascript
const names = ['zaappi'];
document.querySelectorAll('.character-name').forEach(el => {
  names.forEach(name => {
    if (el.textContent.toLowerCase().includes(name)) {
      console.log('Found:', el.textContent, 'Has class:', el.classList.contains('my-character'));
    }
  });
});
```

### Force animation:
```javascript
document.querySelectorAll('.my-character').forEach(el => {
  el.style.animation = 'none';
  setTimeout(() => {
    el.style.animation = '';
  }, 10);
});
```

### Check animation keyframes:
```javascript
// Check if animation is defined
const styleSheets = Array.from(document.styleSheets);
const hasAnimation = styleSheets.some(sheet => {
  try {
    return Array.from(sheet.cssRules).some(rule => 
      rule.name === 'myCharacterPulse'
    );
  } catch(e) { return false; }
});
console.log('Animation defined:', hasAnimation);
```
