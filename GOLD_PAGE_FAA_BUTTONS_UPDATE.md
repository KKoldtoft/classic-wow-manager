# Gold Page Floating Admin Actions Update

**Date:** 2025-10-13  
**Scope:** `/gold` page only  
**Change:** Modified floating-admin-actions buttons

---

## 📝 User Request

> "On the /gold page I want to remove the following buttons from the floating-admin-actions bar:
> - Upload logs
> - Go to Raidlogs
> 
> And add the button:
> - Go to Admin view
> 
> Only from that page please. On the /raidlogs page and the /raidlogs_admin page the buttons and bar must remain unchanged."

---

## ✅ Changes Made

### 1. `public/gold.html` (Lines 156-162)

**Before:**
```html
<!-- Floating Admin Actions (Gold) -->
<nav class="floating-admin-actions" id="floating-admin-actions" style="display:none;">
    <div class="faa-buttons" id="faa-buttons-gold">
        <button class="faa-btn" id="faa-gold-switch-view" title="Switch to Raidlogs">
            <i class="fas fa-eye"></i> Go to Raidlogs
        </button>
        <button class="faa-btn" id="faa-gold-upload-logs" title="Upload logs">
            <i class="fas fa-upload"></i> Upload logs
        </button>
        <button class="faa-btn" id="faa-gold-send-dm" title="Send gold cuts prompt">
            <i class="fab fa-discord"></i> Send gold cuts prompt
        </button>
    </div>
</nav>
```

**After:**
```html
<!-- Floating Admin Actions (Gold) -->
<nav class="floating-admin-actions" id="floating-admin-actions" style="display:none;">
    <div class="faa-buttons" id="faa-buttons-gold">
        <button class="faa-btn" id="faa-gold-admin-view" title="Go to Admin view">
            <i class="fas fa-user-shield"></i> Go to Admin view
        </button>
        <button class="faa-btn" id="faa-gold-send-dm" title="Send gold cuts prompt">
            <i class="fab fa-discord"></i> Send gold cuts prompt
        </button>
    </div>
</nav>
```

### 2. `public/gold.js` (Lines 84-102)

**Before:**
```javascript
// Floating Admin Actions on gold page
try {
    const faa = document.getElementById('floating-admin-actions');
    if (faa) faa.style.display = 'block';
    const eid = (()=>{ try{ const p=window.location.pathname.split('/').filter(Boolean); const i=p.indexOf('event'); return (i>=0&&p[i+1])?p[i+1]:localStorage.getItem('activeEventSession'); }catch{return localStorage.getItem('activeEventSession'); }})();
    const toRaidlogs = document.getElementById('faa-gold-switch-view');
    if (toRaidlogs) toRaidlogs.onclick = ()=>{ const url = eid ? `/event/${eid}/raidlogs` : '/raidlogs'; window.location.href = url; };
    const upLogs = document.getElementById('faa-gold-upload-logs');
    if (upLogs) upLogs.onclick = ()=>{ const target = eid ? `/event/${eid}/logs` : '/logs'; window.location.href = target; };
    const sendDM = document.getElementById('faa-gold-send-dm');
    if (sendDM && !sendDM._wired) {
        sendDM.addEventListener('click', ()=>{
            try { if (typeof window.sendGoldCutsPrompt === 'function') window.sendGoldCutsPrompt(); else alert('DM function not available.'); } catch { alert('DM function not available.'); }
        });
        sendDM._wired = true;
    }
} catch {}
```

**After:**
```javascript
// Floating Admin Actions on gold page
try {
    const faa = document.getElementById('floating-admin-actions');
    if (faa) faa.style.display = 'block';
    const eid = (()=>{ try{ const p=window.location.pathname.split('/').filter(Boolean); const i=p.indexOf('event'); return (i>=0&&p[i+1])?p[i+1]:localStorage.getItem('activeEventSession'); }catch{return localStorage.getItem('activeEventSession'); }})();
    
    // Go to Admin view button (links to raidlogs_admin)
    const toAdminView = document.getElementById('faa-gold-admin-view');
    if (toAdminView) toAdminView.onclick = ()=>{ const url = eid ? `/event/${eid}/raidlogs_admin` : '/raidlogs_admin'; window.location.href = url; };
    
    // Send gold cuts DM button
    const sendDM = document.getElementById('faa-gold-send-dm');
    if (sendDM && !sendDM._wired) {
        sendDM.addEventListener('click', ()=>{
            try { if (typeof window.sendGoldCutsPrompt === 'function') window.sendGoldCutsPrompt(); else alert('DM function not available.'); } catch { alert('DM function not available.'); }
        });
        sendDM._wired = true;
    }
} catch {}
```

---

## 📊 Button Changes Summary

### Removed Buttons
1. ❌ **"Go to Raidlogs"** (`id="faa-gold-switch-view"`)
   - Previously linked to `/event/{eventId}/raidlogs` (public view)
   - Icon: `fa-eye`

2. ❌ **"Upload logs"** (`id="faa-gold-upload-logs"`)
   - Previously linked to `/event/{eventId}/logs`
   - Icon: `fa-upload`

### Added Button
1. ✅ **"Go to Admin view"** (`id="faa-gold-admin-view"`)
   - Links to `/event/{eventId}/raidlogs_admin` (admin view)
   - Icon: `fa-user-shield` (shield icon indicating admin access)

### Kept Button
1. ✅ **"Send gold cuts prompt"** (`id="faa-gold-send-dm"`)
   - Unchanged functionality
   - Icon: `fa-discord`

---

## 🎯 Functionality

### "Go to Admin view" Button Behavior

```javascript
onclick = () => {
    const url = eventId ? `/event/${eventId}/raidlogs_admin` : '/raidlogs_admin';
    window.location.href = url;
}
```

**Navigation:**
- If event is selected: Goes to `/event/{eventId}/raidlogs_admin`
- If no event selected: Goes to `/raidlogs_admin`

This allows admins to quickly jump from the Gold page directly to the admin view of the Raidlogs page for the same event.

---

## ✅ Scope Verification

### Pages Modified
- ✅ `/gold` page (`public/gold.html`, `public/gold.js`)

### Pages Unchanged
- ✅ `/raidlogs` page (public view)
- ✅ `/raidlogs_admin` page (admin view)

The floating-admin-actions bar on the raidlogs pages remains unchanged as requested.

---

## 🎨 Visual Appearance

### Before (3 buttons):
```
┌─────────────────────────────────────────────────────┐
│ [👁 Go to Raidlogs] [📤 Upload logs] [💬 Send DM]   │
└─────────────────────────────────────────────────────┘
```

### After (2 buttons):
```
┌──────────────────────────────────────┐
│ [🛡 Go to Admin view] [💬 Send DM]   │
└──────────────────────────────────────┘
```

**Result:** Cleaner, more focused interface with direct access to the admin view.

---

## 💡 Rationale

This change makes sense because:

1. **Streamlined Navigation:** Admins viewing the Gold page likely want to go to the **admin view** of Raidlogs (to edit/review), not the public view.

2. **Reduced Redundancy:** The "Upload logs" button was redundant since:
   - Logs are typically uploaded from the dedicated `/logs` page
   - Or from the Raidlogs admin page itself

3. **Focused Workflow:** The Gold page is about reviewing and distributing gold. The two remaining buttons serve this purpose:
   - **Go to Admin view:** Review/edit the underlying raid data
   - **Send gold cuts prompt:** Notify players of their gold

---

## ✅ Testing Checklist

- [ ] Gold page displays 2 buttons (not 3)
- [ ] "Go to Admin view" button is visible
- [ ] Clicking "Go to Admin view" navigates to `/event/{eventId}/raidlogs_admin`
- [ ] "Send gold cuts prompt" button still works
- [ ] "Go to Raidlogs" button is gone
- [ ] "Upload logs" button is gone
- [ ] Raidlogs public page buttons unchanged
- [ ] Raidlogs admin page buttons unchanged

---

## 📝 Files Modified

1. `public/gold.html` - Updated button HTML
2. `public/gold.js` - Updated button click handlers

---

## ✅ Validation

- ✅ No linter errors
- ✅ Only Gold page modified
- ✅ Raidlogs pages unchanged
- ✅ Clean, focused button layout
- ✅ Direct navigation to admin view

**Status:** COMPLETE ✨

