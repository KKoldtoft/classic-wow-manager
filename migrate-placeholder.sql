-- Migration to add placeholder support to roster_overrides table
-- This allows adding players to roster without a Discord ID

-- Step 1: Add is_placeholder column
ALTER TABLE roster_overrides ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT FALSE;

-- Step 2: Allow NULL values in discord_user_id for placeholders
ALTER TABLE roster_overrides ALTER COLUMN discord_user_id DROP NOT NULL;

-- Step 2: Drop the old PRIMARY KEY constraint (if it exists)
-- Note: This will work even if the constraint doesn't exist (IF EXISTS equivalent)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'roster_overrides_pkey' 
        AND conrelid = 'roster_overrides'::regclass
    ) THEN
        ALTER TABLE roster_overrides DROP CONSTRAINT roster_overrides_pkey;
    END IF;
END $$;

-- Step 3: Add a new UNIQUE constraint on (event_id, party_id, slot_id)
-- This ensures only one player per position
CREATE UNIQUE INDEX IF NOT EXISTS roster_overrides_position_unique 
ON roster_overrides (event_id, party_id, slot_id) 
WHERE party_id IS NOT NULL AND slot_id IS NOT NULL;

-- Step 4: Add a UNIQUE constraint for non-placeholder players
-- This ensures each real Discord user can only appear once per event
CREATE UNIQUE INDEX IF NOT EXISTS roster_overrides_discord_unique 
ON roster_overrides (event_id, discord_user_id) 
WHERE discord_user_id IS NOT NULL AND is_placeholder = FALSE;

-- Step 5: Add a primary key on a generated ID column
ALTER TABLE roster_overrides ADD COLUMN IF NOT EXISTS id SERIAL;
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'roster_overrides_pkey_new' 
        AND conrelid = 'roster_overrides'::regclass
    ) THEN
        ALTER TABLE roster_overrides ADD CONSTRAINT roster_overrides_pkey_new PRIMARY KEY (id);
    END IF;
END $$;

-- Step 6: Create index on event_id and discord_user_id for performance
CREATE INDEX IF NOT EXISTS idx_roster_overrides_event_discord ON roster_overrides (event_id, discord_user_id);
CREATE INDEX IF NOT EXISTS idx_roster_overrides_event_placeholder ON roster_overrides (event_id, is_placeholder);
