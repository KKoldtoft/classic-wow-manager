# migrate-db.ps1
#
# This script handles database operations for your Heroku application.
#
# Usage:
#   .\migrate-db.ps1 -setupDb              # Creates database tables only
#   .\migrate-db.ps1 -migrateData          # Migrates players.tsv data only  
#   .\migrate-db.ps1 -setupDb -migrateData # Does both operations
#
# Parameters:
#   -setupDb: Creates database tables if they don't exist
#   -migrateData: Migrates local players.tsv data to Heroku database

param (
    [switch]$setupDb,
    [switch]$migrateData
)

if (-not $setupDb -and -not $migrateData) {
    Write-Host "Usage: .\migrate-db.ps1 -setupDb and/or -migrateData"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\migrate-db.ps1 -setupDb              # Creates database tables"
    Write-Host "  .\migrate-db.ps1 -migrateData          # Migrates players data"
    Write-Host "  .\migrate-db.ps1 -setupDb -migrateData # Does both"
    exit 1
}

Write-Host "=== Database Migration Script ==="
Write-Host ""

if ($setupDb) {
    Write-Host "Step 1: Creating database tables..."
    
    $createTablesSQL = @"
-- Create players table
CREATE TABLE IF NOT EXISTS players (
    discord_id VARCHAR(255),
    character_name VARCHAR(255),
    class VARCHAR(50),
    PRIMARY KEY (discord_id, character_name)
);

-- Create roster_overrides table  
CREATE TABLE IF NOT EXISTS roster_overrides (
    event_id VARCHAR(255),
    discord_user_id VARCHAR(255),
    original_signup_name VARCHAR(255),
    assigned_char_name VARCHAR(255),
    assigned_char_class VARCHAR(50),
    assigned_char_spec VARCHAR(50),
    assigned_char_spec_emote VARCHAR(50),
    player_color VARCHAR(50),
    party_id INTEGER,
    slot_id INTEGER,
    PRIMARY KEY (event_id, discord_user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_players_discord_id ON players (discord_id);
CREATE INDEX IF NOT EXISTS idx_roster_overrides_event_id ON roster_overrides (event_id);
"@
    
    # Write SQL to temporary file to avoid formatting issues
    $tempSchemaFile = "temp_schema.sql"
    $createTablesSQL | Out-File -FilePath $tempSchemaFile -Encoding UTF8
    
    # Execute using the newer database
    heroku pg:psql HEROKU_POSTGRESQL_ONYX_URL -f $tempSchemaFile
    
    # Clean up
    Remove-Item $tempSchemaFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database tables created successfully."
    } else {
        Write-Host "❌ Error creating database tables."
        Write-Host "   Make sure you're logged into Heroku CLI and have access to the database."
        exit 1
    }
}

if ($migrateData) {
    Write-Host "Step 2: Migrating players data..."
    
    # Check if players.tsv exists
    if (-not (Test-Path "players.tsv")) {
        Write-Host "❌ players.tsv file not found in current directory."
        Write-Host "   Make sure you're running this script from the project root."
        exit 1
    }
    
    Write-Host "Processing players.tsv file..."
    
    # Create a temporary SQL file for data migration
    $migrationSQL = "-- Migrating data from players.tsv`n-- Using ON CONFLICT to avoid duplicates`n`n"
    
    # Read and process the TSV file
    $players = Get-Content "players.tsv"
    $processedCount = 0
    
    foreach ($line in $players) {
        if ($line.Trim() -ne "") {
            $fields = $line -split "`t"
            if ($fields.Length -ge 3) {
                $discordId = $fields[0].Trim()
                $characterName = $fields[1].Trim()
                $class = $fields[2].Trim()
                
                # Escape single quotes in the data
                $discordId = $discordId -replace "'", "''"
                $characterName = $characterName -replace "'", "''"
                $class = $class -replace "'", "''"
                
                if ($characterName -ne "" -and $class -ne "") {
                    $migrationSQL += "INSERT INTO players (discord_id, character_name, class) VALUES ('$discordId', '$characterName', '$class') ON CONFLICT (discord_id, character_name) DO NOTHING;`n"
                    $processedCount++
                }
            }
        }
    }
    
    Write-Host "Found $processedCount player records to migrate..."
    
    # Write to temporary file
    $tempFile = "temp_migration.sql"
    $migrationSQL | Out-File -FilePath $tempFile -Encoding UTF8
    
    # Execute the migration
    Write-Host "Executing database migration..."
    heroku pg:psql HEROKU_POSTGRESQL_ONYX_URL -f $tempFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Player data migrated successfully."
        Write-Host "   $processedCount records processed."
    } else {
        Write-Host "❌ Error migrating player data."
        Write-Host "   Check the error messages above for details."
        exit 1
    }
    
    # Clean up temporary file
    Remove-Item $tempFile
    Write-Host "Temporary migration file cleaned up."
}

Write-Host ""
Write-Host "🎉 Database migration completed successfully!"
Write-Host ""
Write-Host "To verify the migration worked, you can run:"
Write-Host "  heroku pg:psql"
Write-Host "  Then in the database console:"
Write-Host "    SELECT COUNT(*) FROM players;"
Write-Host "    SELECT * FROM players LIMIT 5;" 