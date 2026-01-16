# Raidlogs Panels Analysis

## Overview

This document provides a comprehensive analysis of all panels on the Raidlogs page and Raidlogs Admin page, comparing them with the Rules page documentation.

**Total Panels Count:**
- **Raidlogs Page (Public)**: 33 automatic reward/deduction panels (excluding Manual Rewards panel and Dashboard stats)
- **Raidlogs Admin Page**: Same 33 panels
- **Rules Page Rule Cards**: 34 automatic rules documented

---

## Panel-by-Panel Breakdown

### 1. God Gamer DPS

**How values are assigned:**
- Compares #1 DPS vs #2 DPS by total damage amount
- Difference threshold determines the trophy tier

**How points are assigned:**
- If difference ≥ 250,000 damage: **+30 points** (gold trophy)
- If difference ≥ 150,000 damage: **+20 points** (silver trophy)
- Only the #1 DPS player receives points

**Difference between public/admin:**
- No difference in panel output - both show same rankings

**Rule card on Rules page:**
- ✅ Yes - "God Gamer (DPS)"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+30 pts if #1 DPS exceeds #2 by ≥250,000 damage; +20 pts if by ≥150,000"

---

### 2. God Gamer Healer

**How values are assigned:**
- Compares #1 healer vs #2 healer by total healing amount
- Difference threshold determines the trophy tier

**How points are assigned:**
- If difference ≥ 250,000 healing: **+20 points** (gold trophy)
- If difference ≥ 150,000 healing: **+15 points** (silver trophy)
- Only the #1 healer receives points

**Difference between public/admin:**
- No difference in panel output

**Rule card on Rules page:**
- ✅ Yes - "God Gamer (Healer)"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+20 pts if #1 healing exceeds #2 by ≥250,000; +15 pts if by ≥150,000"

---

### 3. Damage Dealers

**How values are assigned:**
- Total damage amount from WCL logs
- Only DPS and Tank roles with damage > 0 included
- Sorted by damage amount descending

**How points are assigned:**
- Points distributed by ranking position
- Default points array: [80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3]
- Rank 1 gets 80 pts, Rank 2 gets 70 pts, etc.
- Configurable via reward_settings table

**Difference between public/admin:**
- No difference in panel output

**Rule card on Rules page:**
- ✅ Yes - "Damage Rankings"

**Rule card accuracy:**
- ⚠️ **VAGUE** - Rule says "Top DPS and tanks receive points based on placement. Higher ranks earn more points, descending by position as configured." This is accurate but doesn't show specific point values.

---

### 4. Healers

**How values are assigned:**
- Total healing amount from WCL logs
- Only Healer role with healing > 0 included
- Sorted by healing amount descending

**How points are assigned:**
- Points distributed by ranking position
- Default points array: [80, 65, 60, 55, 40, 35, 30, 20, 15, 10]
- Rank 1 gets 80 pts, Rank 2 gets 65 pts, etc.
- Configurable via reward_settings table

**Difference between public/admin:**
- No difference in panel output

**Rule card on Rules page:**
- ✅ Yes - "Healer Rankings"

**Rule card accuracy:**
- ⚠️ **VAGUE** - Similar to damage, states general principle but not specific points.

---

### 5. Top Shaman Healers

**How values are assigned:**
- Total healing amount for Shaman class healers only
- Filtered from healer rankings

**How points are assigned:**
- Top 3 Shamans by healing receive:
  - **Rank 1:** 25 points
  - **Rank 2:** 20 points
  - **Rank 3:** 15 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Shaman Healers"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Top 3 Shaman healers earn: 25 / 20 / 15 pts"

---

### 6. Top Priest Healers

**How values are assigned:**
- Total healing amount for Priest class healers only

**How points are assigned:**
- Top 2 Priests by healing receive:
  - **Rank 1:** 20 points
  - **Rank 2:** 15 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Priest Healers"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Top 2 Priest healers earn: 20 / 15 pts"

---

### 7. Top Druid Healer

**How values are assigned:**
- Total healing amount for Druid class healers only

**How points are assigned:**
- Top 1 Druid by healing receives:
  - **Rank 1:** 15 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Druid Healers"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Top Druid healer earns: 15 pts"

---

### 8. Too Low Damage

**How values are assigned:**
- Damage Per Second (DPS) = Total Damage / Active Fight Time (in seconds)
- Only applies to players with "DPS" primary role
- Active fight time comes from raid stats

**How points are assigned (PENALTIES):**
- DPS < 150: **-100 points**
- DPS 150-199.9: **-50 points**
- DPS 200-249.9: **-25 points**
- DPS ≥ 250: No penalty

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Too Low Damage"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "DPS penalties vs active fight time: <150 DPS: -100; 150–199.9: -50; 200–249.9: -25"

---

### 9. Too Low Healing

**How values are assigned:**
- Healing Per Second (HPS) = Total Healing / Active Fight Time (in seconds)
- Only applies to players with "Healer" primary role
- Active fight time comes from raid stats

**How points are assigned (PENALTIES):**
- HPS < 85: **-100 points**
- HPS 85-99.9: **-50 points**
- HPS 100-124.9: **-25 points**
- HPS ≥ 125: No penalty

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Too Low Healing"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Healer penalties vs active fight time: <85 HPS: -100; 85–99.9: -50; 100–124.9: -25"

---

### 10. Frost Resistance

**How values are assigned:**
- Frost resistance value extracted from WCL gear data
- Checked against thresholds based on player role (physical DPS vs caster)

**How points are assigned (PENALTIES for DPS only):**
- **Physical DPS:**
  - FR < 80: **-10 points**
  - FR 80-129: **-5 points**
  - FR ≥ 130: **0 points**
- **Caster DPS:**
  - FR < 80: **-10 points**
  - FR 80-149: **-5 points**
  - FR ≥ 150: **0 points**
- Healers and tanks: Not penalized

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Frost Resistance"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "DPS-only: insufficient frost resistance yields penalties (physical: -5 <130, -10 <80; caster: -5 <150, -10 <80)"

---

### 11. World Buffs (Missing)

**How values are assigned:**
- Counts world buffs present at raid start from WCL data
- Buffs checked: Rallying Cry, Dragonslayer, Songflower, DMF, ZG, Ony/Nef
- DMF only counts if ≥10 players have it

**How points are assigned (PENALTIES):**
- Required buffs: 4 if not Naxx, 6 if Naxx
- **-10 points per missing buff** below the requirement

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "World Buffs (Missing)"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Required buffs: 4 if not Naxx; 6 if Naxx. -10 pts per missing buff. DMF counts only if ≥10 players have it"

---

### 12. Attendance Streak Champions

**How values are assigned:**
- Consecutive weeks of attendance from attendance tracking system
- Streak count stored in database

**How points are assigned:**
- 4 weeks: **+3 points**
- 5 weeks: **+6 points**
- 6 weeks: **+9 points**
- 7 weeks: **+12 points**
- 8+ weeks: **+15 points**

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Attendance Streaks"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Consecutive attendance awards: 4=+3, 5=+6, 6=+9, 7=+12, 8+=+15 pts"

---

### 13. Guild Members

**How values are assigned:**
- Guild membership status from database
- Confirmed guild members list

**How points are assigned:**
- All confirmed guild members present: **+10 points**

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Guild Members"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Confirmed guild members present earn a flat +10 pts"

---

### 14. Engineering & Holywater

**How values are assigned:**
- Count of abilities used from WCL:
  - Dense Dynamite: count and avg targets hit
  - Goblin Sapper Charge: count and avg targets hit
  - Stratholme Holy Water: count and avg targets hit
- Stored in `sheet_player_abilities` table

**How points are assigned:**
- Formula: `floor((total_abilities_used × avg_targets_hit) ÷ 10)`
- Maximum: **20 points**

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Engineering & Holywater"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Points = floor((abilities used × avg targets) ÷ 10), up to +20 pts"

---

### 15. Major Mana Potions

**How values are assigned:**
- Count of Major Mana Potions used from WCL
- Stored in `sheet_player_abilities` table

**How points are assigned:**
- Threshold: 10 potions (no points below)
- Above threshold: **+1 point per 3 potions**
- Maximum: **10 points**
- Formula: `min(10, floor((potions - 10) / 3))`

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Major Mana Potions"

**Rule card accuracy:**
- ⚠️ **SLIGHTLY INACCURATE** - Rule states "+1 pts per 3 potions used above 10 used, up to +10 pts" - This is close but the actual formula is `floor((potions - 10) / 3)` not `(potions / 3)` which the wording might suggest. The "above 10 used" clarifies this correctly.

---

### 16. Dark or Demonic Runes

**How values are assigned:**
- Count of Dark Runes and Demonic Runes used from WCL
- Combined total from both rune types

**How points are assigned:**
- **+1 point per 2 runes** used
- Maximum: **15 points**
- Formula: `min(15, floor(total_runes / 2))`

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Dark or Demonic Runes"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+1 pt per 2 runes used. Max 15 points"

---

### 17. Interrupted Spells

**How values are assigned:**
- Count of "# of interrupted spells" from WCL
- Stored in `sheet_player_abilities` table

**How points are assigned:**
- **+1 point per 2 interrupts**
- Maximum: **5 points**
- Formula: `min(5, floor(interrupts / 2))`

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Interrupted Spells"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+1 pt per 2 interrupts, up to +5 pts"

---

### 18. Disarmed Enemies

**How values are assigned:**
- Count of "# of disarmed enemies" from WCL
- Stored in `sheet_player_abilities` table

**How points are assigned:**
- **+1 point per 3 disarms**
- Maximum: **5 points**
- Formula: `min(5, floor(disarms / 3))`

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Disarmed Enemies"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+1 pt per 3 disarms, up to +5 pts"

---

### 19. Totems (Windfury)

**How values are assigned:**
- Windfury totem effectiveness measured by extra attacks generated
- Compared against group baseline
- Tank group has 75% requirement modifier

**How points are assigned:**
- **< 75% baseline:** 0 points
- **75-99% baseline:** +10 points
- **100-125% baseline:** +15 points
- **> 125% baseline:** +20 points
- Additional totems (Grace of Air, Strength, Tranquil Air) have separate calculations

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Totems (Shaman)"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Windfury: points vs group baseline of extra attacks (tank group has 75% requirement): <75% baseline: 0; 75–99%: +10; 100–125%: +15; >125%: +20. Grace/Strength: if group avg ≥75% baseline and ≥10 totems: +1 per 10 totems (Grace max +20; Strength max +10). Tranquil Air: +1 per 10 totems, max +5"

---

### 20. Sunder Armor

**How values are assigned:**
- Count of "Sunder Armor% on targets < 5 stacks" from WCL
- Stored in `sheet_player_abilities` table
- **IMPORTANT:** Main tanks (Skull and Cross markers only) are **excluded** from this panel

**How points are assigned (rewards engine auto mode):**
- Points calculated vs raid average (percentage of average):
  - **< 25% avg:** -20 points
  - **25-49% avg:** -15 points
  - **50-74% avg:** -10 points
  - **75-89% avg:** -5 points
  - **90-109% avg:** 0 points
  - **110-124% avg:** +5 points
  - **≥ 125% avg:** +10 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Sunder Armor"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Points vs raid average effective sunders: <25% avg: -20; 25–49%: -15; 50–74%: -10; 75–89%: -5; 90–109%: 0; 110–124%: +5; ≥125%: +10"

---

### 21. Goblin Rocket Helmet

**How values are assigned:**
- Checks WCL gear data for "Goblin Rocket Helmet" equipped
- Extracts from combatantInfo.gear array

**How points are assigned:**
- Equipped: **+5 points**
- Not equipped: 0 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Goblin Rocket Helmet"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+5 pts if wearing a Goblin Rocket Helmet during the raid"

---

### 22. Curse of Recklessness

**How values are assigned:**
- Uptime percentage from WCL debuff tracking
- Stored in database with uptime percentage

**How points are assigned:**
- **> 70% uptime:** +10 points
- **≤ 70% uptime:** 0 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Curse of Recklessness"

**Rule card accuracy:**
- ⚠️ **SLIGHTLY INACCURATE** - Rule states ">70% uptime grants +10 pts" but code uses threshold of 85% (`uptime_threshold: 85`). There's a **discrepancy** between rule card (70%) and actual implementation (85%).

---

### 23. Curse of Shadow

**How values are assigned:**
- Uptime percentage from WCL debuff tracking

**How points are assigned:**
- **> 70% uptime:** +10 points (code uses 85%)
- **≤ 70% uptime:** 0 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Curse of Shadow"

**Rule card accuracy:**
- ⚠️ **SLIGHTLY INACCURATE** - Same as Curse of Recklessness - rule says 70%, code uses 85%

---

### 24. Curse of the Elements

**How values are assigned:**
- Uptime percentage from WCL debuff tracking

**How points are assigned:**
- **> 70% uptime:** +10 points (code uses 85%)
- **≤ 70% uptime:** 0 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Curse of the Elements"

**Rule card accuracy:**
- ⚠️ **SLIGHTLY INACCURATE** - Same issue - rule says 70%, code uses 85%

---

### 25. Faerie Fire

**How values are assigned:**
- Uptime percentage from WCL debuff tracking

**How points are assigned:**
- **> 70% uptime:** +10 points (code uses 85%)
- **≤ 70% uptime:** 0 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Faerie Fire"

**Rule card accuracy:**
- ⚠️ **SLIGHTLY INACCURATE** - Same issue - rule says 70%, code uses 85%

---

### 26. Scorch

**How values are assigned:**
- Count of Scorch casts from WCL
- Stored in database

**How points are assigned:**
- **0-99 casts:** 0 points
- **100-199 casts:** +5 points
- **≥200 casts:** +10 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Scorch"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "0–99: 0 pts, 100–199: +5 pts, ≥200: +10 pts"

---

### 27. Demoralizing Shout

**How values are assigned:**
- Count of Demoralizing Shout casts from WCL

**How points are assigned:**
- **0-99 casts:** 0 points
- **100-199 casts:** +5 points
- **≥200 casts:** +10 points

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Demoralizing Shout"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "0–99: 0 pts, 100–199: +5 pts, ≥200: +10 pts"

---

### 28. Polymorph

**How values are assigned:**
- Count of Polymorph casts from WCL

**How points are assigned:**
- **+1 point per 2 polymorphs**
- Maximum: **5 points**
- Formula: `min(5, floor(polymorphs / 2))`

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Polymorph"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+1 pt per 2 polymorphs, up to +5 pts"

---

### 29. Power Infusion

**How values are assigned:**
- Count of Power Infusion casts from WCL
- **Self-casts are excluded** from the count

**How points are assigned:**
- **+1 point per 2 infusions** (excluding self-casts)
- Maximum: **10 points**
- Formula: `min(10, floor(infusions / 2))`

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Power Infusion"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "+1 pt per 2 infusions (excludes self-casts), up to +10 pts"

---

### 30. Decurses

**How values are assigned:**
- Count of decurse/dispel casts from WCL
- Calculated relative to raid average decurses

**How points are assigned:**
- Average-based system:
- **+1 point per 3 decurses above average**
- **-1 point per 3 decurses below average**
- Range: **-10 to +10 points**

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Decurses"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Average-based: +1 pt per 3 above average, penalties below average, from -10 up to +10 pts"

---

### 31. Avoidable Void Damage

**How values are assigned:**
- Damage taken from specific avoidable void abilities
- Tracked from WCL damage taken events

**How points are assigned (PENALTIES):**
- **Void Blast:** -10 points per instance
- **Void Zone:** -5 points per instance
- Other void damage sources have varying penalties

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Avoidable Void Damage"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Taking avoidable damage applies penalties (e.g., Void Blast: -10 pts, Void Zone: -5 pts)"

---

### 32. Big Buyer Bonus

**How values are assigned:**
- Total gold spent on loot items during the event
- Sum from loot_items table

**How points are assigned:**
- Must be in **Top 3 spenders**
- Must have spent **≥ 25,000 gold**
- Tiers:
  - **25,000g+:** +5 points
  - **50,000g+:** +10 points
  - **75,000g+:** +15 points
  - **100,000g+:** +20 points
- **One reward per player** (highest tier only)

**Difference between public/admin:**
- No difference

**Rule card on Rules page:**
- ✅ Yes - "Big Buyer Bonus"

**Rule card accuracy:**
- ✅ **ACCURATE** - Rule states "Top 3 spenders (≥25,000 gold) can earn: 25k:+5, 50k:+10, 75k:+15, 100k:+20 pts (when configured). One reward per player"

---

### 33. Base Points (Not displayed as a panel, but counted in totals)

**How values are assigned:**
- All players in the raid automatically receive base points

**How points are assigned:**
- **+100 points** for participating in the raid

**Difference between public/admin:**
- No difference (not a visible panel, but included in total)

**Rule card on Rules page:**
- ❌ No - Base points are not documented on the Rules page

**Rule card accuracy:**
- ❌ **MISSING** - There should be a rule card explaining that all participants receive +100 base points

---

## Summary

### Panel Count Summary
- **Total automatic panels:** 33 visible panels + 1 hidden base panel = 34 total
- **Panels displayed on both public and admin pages:** All 33 visible panels
- **Difference between admin and public view:** None for the automatic panels (admin has additional controls for publishing/reverting but the panel data is identical)

### Rules Page Accuracy Summary

**Accurate (23):**
1. ✅ God Gamer DPS
2. ✅ God Gamer Healer
3. ✅ Shaman Healers
4. ✅ Priest Healers
5. ✅ Druid Healers
6. ✅ Too Low Damage
7. ✅ Too Low Healing
8. ✅ Frost Resistance
9. ✅ World Buffs
10. ✅ Attendance Streaks
11. ✅ Guild Members
12. ✅ Engineering & Holywater
13. ✅ Dark or Demonic Runes
14. ✅ Interrupted Spells
15. ✅ Disarmed Enemies
16. ✅ Totems
17. ✅ Sunder Armor
18. ✅ Goblin Rocket Helmet
19. ✅ Scorch
20. ✅ Demoralizing Shout
21. ✅ Polymorph
22. ✅ Power Infusion
23. ✅ Decurses
24. ✅ Avoidable Void Damage
25. ✅ Big Buyer Bonus

**Vague but Correct (2):**
1. ⚠️ Damage Rankings - Doesn't specify exact point values
2. ⚠️ Healer Rankings - Doesn't specify exact point values

**Inaccurate/Discrepancies (5):**
1. ⚠️ Major Mana Potions - Wording could be clearer (but technically correct with "above 10")
2. ⚠️ Curse of Recklessness - **Rule says 70%, code uses 85%**
3. ⚠️ Curse of Shadow - **Rule says 70%, code uses 85%**
4. ⚠️ Curse of the Elements - **Rule says 70%, code uses 85%**
5. ⚠️ Faerie Fire - **Rule says 70%, code uses 85%**

**Missing (1):**
1. ❌ Base +100 points - Not documented on Rules page

---

## Key Findings

### 1. Curse/Debuff Uptime Threshold Discrepancy

The **most significant inaccuracy** is that all curse and debuff uptimes (Curse of Recklessness, Curse of Shadow, Curse of Elements, Faerie Fire) have a **15% discrepancy**:
- **Rules page states:** >70% uptime
- **Actual code uses:** 85% uptime threshold

**Recommendation:** Update the Rules page to reflect the correct 85% threshold, or update the code to use 70% if that was the intended design.

### 2. Base Points Not Documented

All raid participants receive +100 base points, but this is not mentioned on the Rules page. This should be added as a rule card.

### 3. Public vs Admin View

There is **no difference** in the panel outputs between the public Raidlogs page and the Raidlogs Admin page. The admin page has additional floating action buttons for:
- Publishing data
- Reverting to computed
- Uploading logs
- Viewing player mismatch warnings

But the actual panel rankings and points are identical.

### 4. Manual Rewards Panel

As requested, the "Manual Rewards and Deductions" panel was excluded from this analysis as it's a different type of panel (not automatic calculation from logs).

---

## Recommendations

1. **Fix curse/debuff threshold discrepancy** - Either update Rules page to say ">85%" or update code to use 70%
2. **Add Base Points rule card** - Document that all participants receive +100 base points
3. **Clarify Damage/Healing rankings** - Consider showing the actual point distribution in the Rules page
4. **Verify Mana Potions wording** - While technically correct, could be clarified as "floor((potions - 10) / 3)" for precision
