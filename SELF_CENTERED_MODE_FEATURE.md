# "I Only Care About Myself" Feature

## 🎯 Overview
A toggle that allows users to focus exclusively on their own character rankings by making everyone else's entries transparent (25% opacity).

## ✨ Features

### Visual Toggle
- **Location**: Top center of the page, just below the top bar
- **Style**: Sleek dark card with golden accent border
- **Text**: "I only care about myself" with checkbox
- **Visibility**: Only appears if user has linked characters on the page

### Behavior
**When UNCHECKED (Default):**
- All ranking items visible at 100% opacity
- Normal viewing experience

**When CHECKED:**
- **Your character entries**: 100% opacity (fully visible, stand out)
- **Everyone else's entries**: 25% opacity (transparent, fade into background)
- **Smooth transition**: 0.3s fade effect
- **Preference saved**: LocalStorage remembers your choice

## 🎨 Design Details

### Positioning
```css
position: fixed;
top: 75px; /* Below top bar */
left: 50%; 
transform: translateX(-50%); /* Perfectly centered */
```

### Styling
- **Background**: Dark translucent (`rgba(17, 24, 39, 0.95)`)
- **Backdrop blur**: Modern frosted glass effect
- **Border**: Golden accent (`rgba(255, 215, 0, 0.3)`)
- **Shadow**: Subtle depth with golden glow
- **Z-index**: 999 (above content, below top bar)

### Interactive States
- **Hover**: Text color changes to gold
- **Checked**: Text becomes gold and bold (weight 600)
- **Checkbox**: Custom accent color (gold `#FFD700`)

## 💻 Technical Implementation

### CSS Classes

**Toggle Container:**
```css
.self-centered-toggle
```

**Body Class (when active):**
```css
body.self-centered-mode
```

**Effect Application:**
```css
body.self-centered-mode .ranking-item {
    opacity: 0.25; /* Make transparent */
}

body.self-centered-mode .ranking-item:has(.my-character) {
    opacity: 1; /* Keep your characters visible */
}
```

### JavaScript Functionality

**Auto-Display:**
- Toggle only appears if user has characters on the page
- Checked in `highlightMyCharacters()` function
- Displays after character detection complete

**LocalStorage:**
```javascript
localStorage.setItem('selfCenteredMode', 'true/false');
```
- Remembers preference across page loads
- Automatically restores on page load

**Event Handling:**
```javascript
checkbox.addEventListener('change', function() {
    if (this.checked) {
        document.body.classList.add('self-centered-mode');
    } else {
        document.body.classList.remove('self-centered-mode');
    }
});
```

## 📱 Responsive Design

### Mobile Adjustments
```css
@media (max-width: 768px) {
    .self-centered-toggle {
        top: 65px;
        padding: 6px 12px; /* Smaller padding */
    }
    
    .self-centered-text {
        font-size: 13px; /* Smaller text */
    }
    
    .self-centered-label input[type="checkbox"] {
        width: 16px; /* Smaller checkbox */
        height: 16px;
    }
}
```

### Raid Bar Adjustment
When the raid bar is present (active event):
```css
body.has-raid-bar .self-centered-toggle {
    top: 135px; /* Below raid bar */
}
```

## 🎮 User Experience

### Use Cases
1. **Quick Personal Review**: Check only your own performance
2. **Focus Mode**: Reduce distraction when analyzing your stats
3. **Screenshot**: Capture only your rankings
4. **Comparison**: Quickly see where you appear without scrolling

### Visual Hierarchy
**Unchecked:**
```
All items: ████████████ 100%
```

**Checked:**
```
Your items:  ████████████ 100%  ← Stands out
Others:      ░░░          25%   ← Fades into background
```

### Smooth Transitions
- **0.3s ease transition** on opacity change
- No jarring switches
- Professional polish

## 🔧 Implementation Files

### Frontend (HTML)
- `public/raidlogs_view.html` - Public view
- `public/raidlogs.html` - Admin view

### Styling (CSS)
- `public/raidlogs.css` - All toggle styles and effects

### Logic (JavaScript)
- `public/raidlogs_view.html` - Inline `setupSelfCenteredToggle()` function
- `public/raidlogs.js` - Class method `setupSelfCenteredToggle()`

## 📊 Performance Impact

### Minimal Overhead
- **CSS-only transitions**: Hardware accelerated
- **Single event listener**: On checkbox change
- **LocalStorage**: < 1KB storage usage
- **No continuous JS**: Set once, CSS handles the rest

### Efficient Selectors
```css
body.self-centered-mode .ranking-item:has(.my-character)
```
- Modern `:has()` selector
- Supported in all modern browsers
- Efficient DOM traversal

## 🎨 Visual Integration

### Matches Existing Design
- **Dark theme**: Consistent with page aesthetics
- **Golden accents**: Matches character highlight color
- **Frosted glass**: Modern design trend
- **Typography**: Same font family and weights

### Doesn't Interfere
- **Fixed positioning**: Doesn't push content
- **High z-index**: Always visible when scrolling
- **Centered**: Doesn't block important UI elements
- **Conditional display**: Only when relevant

## ✅ Features Checklist

✅ Toggle appears only when user has characters  
✅ Checkbox at top center of page  
✅ "I only care about myself" label text  
✅ 25% opacity on other players' items  
✅ 100% opacity on user's items  
✅ Smooth 0.3s transitions  
✅ LocalStorage persistence  
✅ Responsive design (mobile + desktop)  
✅ Works with raid bar present  
✅ Golden accent styling  
✅ No performance impact  
✅ Clean console logging  

## 🎯 Console Messages

**When enabled:**
```
🎯 Self-centered mode: ENABLED - Focusing on your characters only
```

**When disabled:**
```
👥 Self-centered mode: DISABLED - Showing everyone
```

## 🚀 Usage

1. **Load page** with your characters present
2. **See toggle** appear at top center
3. **Check the box** to enable self-centered mode
4. **All other players fade** to 25% opacity
5. **Your characters stand out** at 100% opacity
6. **Preference saved** - stays enabled on refresh!

Perfect for those moments when you truly only care about yourself! 😎
