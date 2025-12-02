-- Migration: Add class to players table PRIMARY KEY
-- This allows a player to have multiple characters with the same name but different classes
-- For example: "Bob" (Warrior) and "Bob" (Mage) for the same discord_id

-- Step 1: Drop the existing PRIMARY KEY constraint
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey;

-- Step 2: Add the new PRIMARY KEY with class included
ALTER TABLE players ADD PRIMARY KEY (discord_id, character_name, class);

-- Verification query (run after migration to verify):
-- SELECT discord_id, character_name, class, COUNT(*) 
-- FROM players 
-- GROUP BY discord_id, character_name, class 
-- HAVING COUNT(*) > 1;
-- (Should return no rows if migration successful)

