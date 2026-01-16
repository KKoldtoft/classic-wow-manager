# 🔧 Polling Fix Verification Guide

## What Was Fixed

**Bug**: Polling cursor got stuck at the same timestamp when no events were found, preventing it from catching up to real-time.

**Fix**: Cursor now **always advances** (via API's `nextPageTimestamp` or by window size), even when no events are found.

---

## 🧪 Immediate Testing (No Raid Needed!)

### Test Right Now:

1. **Navigate to**: `http://localhost:3000/test-polling.html` (or your deployment URL)
2. **Click "Start Test"**
3. **Watch the cursor advance** from 1,000,000 to ~1,200,000+ over 20 polls

### What You Should See:

✅ **Good (Fixed):**
```
Poll 1: No events | Cursor: 1,012,340 (advancing via API)
Poll 2: 5 events | Cursor: 1,025,678 (via API)
Poll 3: No events | Cursor: 1,035,678 (advancing via window)
Poll 4: 2 events | Cursor: 1,048,923 (via API)
...
Final: Cursor advanced 200,000ms over 20 polls ✅
```

❌ **Bad (Old Bug):**
```
Poll 1: No events | Cursor: 1,000,000
Poll 2: No events | Cursor: 1,000,000 ⚠️ STUCK
Poll 3: No events | Cursor: 1,000,000 ⚠️ STUCK
...
```

---

## 🛡️ Multiple Safety Layers Added

### 1. **Backend Logging** (Heroku logs)
Every poll now logs:
```
[LIVE POLL 5] ✅ Cursor advanced via API: 5000000 -> 5010500 (+10500ms, 3 events)
[LIVE POLL 6] ✅ Cursor advanced by window: 5010500 -> 5020500 (+10000ms, 0 events)
```

### 2. **Stuck Cursor Detection**
If cursor fails to advance for 5 consecutive polls:
```
[LIVE POLL 8] ⚠️ WARNING: Cursor did not advance! Stuck count: 1/5
[LIVE POLL 9] ⚠️ WARNING: Cursor did not advance! Stuck count: 2/5
...
[LIVE POLL 12] CRITICAL: Cursor stuck for 5 consecutive polls - polling may not work correctly
```
- User gets **alert popup** on frontend
- Warning event sent to all viewers

### 3. **Frontend Visual Feedback**
Status bar now shows:
```
Polling... #24 | Cursor: 5,234,567 | 2s ago
```
- Poll count increases every 3 seconds
- Cursor value increases with each poll
- Timestamp updates in real-time

### 4. **Enhanced Heartbeats**
Every heartbeat (when no events found) includes:
- Current cursor position
- Window start/end
- Poll count
- Timestamp

---

## 🚀 Deployment & Testing Checklist

### Pre-Raid Deployment:

```powershell
# 1. Deploy the fix
git add .
git commit -m "Fix polling cursor + add safeguards + test endpoint"
git push heroku HEAD:main

# 2. Test immediately (no raid needed!)
# Navigate to: https://your-app.herokuapp.com/test-polling.html
# Click "Start Test" and verify cursor advances
```

### During Tonight's Raid:

#### **Phase 1: Pre-Raid Setup (5 min before raid)**
1. Open Heroku logs in separate window:
   ```powershell
   heroku logs --tail --source app
   ```

2. Open `/livehost` page
3. Have `/test-polling.html` open in another tab (already verified)

#### **Phase 2: Import Start (Raid begins)**
1. Paste WCL live URL into `/livehost`
2. Click "GO"
3. Watch initial import complete (~30 seconds)

#### **Phase 3: Verify Polling (Critical Test)**

**Watch Heroku Logs:**
```
[LIVE] ====== STARTING PHASE 3: REAL-TIME POLLING ======
[LIVE] Initial cursor: 5043210, windowMs: 10000
[LIVE POLL 0] ✅ Cursor advanced via API: 5043210 -> 5053890 (+10680ms, 0 events)
[LIVE POLL 1] ✅ Cursor advanced via API: 5053890 -> 5065234 (+11344ms, 5 events)
[LIVE POLL 2] ✅ Cursor advanced by window: 5065234 -> 5075234 (+10000ms, 0 events)
```

**Watch Frontend Status Bar:**
```
Polling... #2 | Cursor: 5,065,234 | 1s ago
Polling... #3 | Cursor: 5,075,234 | 2s ago
✅ New events: +5 | Cursor: 5,085,789 | Total: 15,245
Polling... #4 | Cursor: 5,085,789 | 1s ago
```

#### **Success Indicators:**

✅ **Cursor constantly increasing** (never stuck at same value)
✅ **Poll count increasing** every 3 seconds  
✅ **Mix of "0 events" and "X events"** (both are normal)
✅ **No warning popups**
✅ **New events appear** as raid progresses
✅ **Leaderboards update** throughout raid

#### **Failure Indicators (Should NOT Happen):**

❌ Cursor stuck at same value for multiple polls
❌ Status bar frozen (same poll # for 30+ seconds)
❌ Warning popup: "Cursor stuck for 5 consecutive polls"
❌ Logs show: `⚠️ WARNING: Cursor did not advance!`
❌ No new events for 5+ minutes despite active raid

---

## 📊 Real-Time Monitoring Commands

### During the raid, keep these running:

**Terminal 1: Watch Logs**
```powershell
heroku logs --tail --source app | Select-String "POLL|LIVE"
```

**Terminal 2: Check Active Session**
```powershell
# Every few minutes
heroku run psql $DATABASE_URL -c "SELECT session_id, total_events, last_cursor, status, updated_at FROM wcl_live_sessions ORDER BY updated_at DESC LIMIT 1;"
```

---

## 🐛 Troubleshooting

### If cursor gets stuck (despite fix):

1. **Check Heroku logs** for error messages
2. **Screenshot the warning** (if popup appears)
3. **Note the exact timestamp** when it got stuck
4. **Check WCL API status**: https://www.warcraftlogs.com/
5. **Try refreshing** the page and re-importing

### If no events appear for 5+ minutes:

1. **Verify raid is actively generating logs** on WCL
2. **Check if WCL API is down**
3. **Verify import completed** (Phase 1 finished)
4. **Check last cursor value** vs current raid timestamp

---

## 📈 Expected Behavior Timeline

**T+0s**: Click GO
**T+30s**: Phase 1 complete (initial import)
**T+45s**: Phase 2 complete (analysis)
**T+48s**: Phase 3 starts (polling begins)
**T+51s**: Poll #0 (cursor advances)
**T+54s**: Poll #1 (cursor advances)
**T+57s**: Poll #2 (cursor advances)
**...continues every 3 seconds...**
**T+5min**: Poll #100 (still advancing)
**T+50min**: Poll #1000 (max polls reached, session ends)

---

## ✅ Success Criteria

After tonight's raid, the fix is confirmed working if:

1. ✅ Cursor advanced throughout entire raid
2. ✅ No "stuck cursor" warnings appeared
3. ✅ New events streamed in real-time
4. ✅ Leaderboards updated during raid
5. ✅ Did NOT need to refresh page
6. ✅ Logs show continuous cursor advancement

---

## 📞 Post-Raid Verification

After the raid ends:

1. **Check final stats** in `/livehost`
2. **Verify total events** matches WCL report
3. **Confirm highlights** captured all mistakes
4. **Test viewer page** (`/live`) shows all data

---

## 🎯 Key Improvement

**Before Fix:**
- Cursor stuck → Missed all events after initial import
- Required page refresh every few minutes
- No real-time updates

**After Fix:**
- Cursor always advances → Catches up to real-time
- No refresh needed for entire raid
- Continuous real-time updates
- Visual feedback confirms it's working
- Automatic warnings if something goes wrong

---

## 🔬 Technical Details

### Cursor Advancement Logic:

```javascript
// OLD (Bug)
if (newEvents.length > 0 && pollNextCursor > lastCursor) {
  lastCursor = pollNextCursor; // Only advances if events found
}

// NEW (Fixed)
if (pollNextCursor != null && pollNextCursor > lastCursor) {
  lastCursor = pollNextCursor; // Advances via API
} else {
  lastCursor = pollEnd; // Advances by window size
}
// ALWAYS advances, regardless of events found
```

### Why This Fixes It:

- WCL API returns `nextPageTimestamp` to indicate where to continue
- Empty windows still need cursor advancement
- Without advancement, you query same window forever
- With advancement, you eventually catch up to "now" and stay current

---

## 📝 Notes

- Test endpoint (`/test-polling.html`) available anytime
- Test simulates 20 polls in 20 seconds (faster than real 60 seconds)
- Real polling runs every 3 seconds for up to 50 minutes
- Cursor values are milliseconds since raid start
- Window size is 10 seconds (10,000ms)
