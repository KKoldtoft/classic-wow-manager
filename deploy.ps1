# deploy.ps1
#
# This script automates the process of committing and deploying changes to Heroku.
#
# Usage:
#   .\deploy.ps1 -message "Your detailed commit message here"
#   .\deploy.ps1 -message "Your commit message" -setupDb
#   .\deploy.ps1 -message "Your commit message" -migrateData
#   .\deploy.ps1 -message "Your commit message" -setupDb -migrateData
#
# Parameters:
#   -setupDb: Creates database tables if they don't exist
#   -migrateData: Migrates local players.tsv data to Heroku database
#
# If no message is provided, a default one will be used.

param (
    [string]$message,
    [switch]$setupDb,
    [switch]$migrateData
)

if (-not $message) {
    $message = "Automated commit and deploy"
    Write-Host "No commit message provided. Using default message: '$message'"
}

Write-Host "Step 1: Staging all changes..."
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: 'git add' failed. Aborting."
    exit 1
}

Write-Host "Step 2: Committing changes with message: '$message'"
git commit -m "$message"
if ($LASTEXITCODE -ne 0) {
    # Check if the error is just that there are no changes to commit
    $status = git status --porcelain
    if ($status) {
        Write-Host "Error: 'git commit' failed. Aborting."
        exit 1
    } else {
        Write-Host "No new changes to commit. Pushing existing commits."
    }
}

Write-Host "Step 3: Pushing to Heroku..."
git push heroku master
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: 'git push heroku master' failed."
    exit 1
}

Write-Host "✅ Code deployment to Heroku completed successfully."

# Database operations
if ($setupDb -or $migrateData) {
    Write-Host ""
    Write-Host "=== Database Operations ==="
    
    if ($setupDb) {
        Write-Host "Step 4a: Creating database tables..."
        
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
            exit 1
        }
    }
    
    if ($migrateData) {
        Write-Host "Step 4b: Migrating players data..."
        
        # Check if players.tsv exists
        if (-not (Test-Path "players.tsv")) {
            Write-Host "❌ players.tsv file not found. Skipping data migration."
        } else {
            Write-Host "Creating temporary migration script..."
            
            # Create a temporary SQL file for data migration
            $migrationSQL = "-- Clear existing data (optional - remove this line if you want to keep existing data)`nTRUNCATE TABLE players CASCADE;`n`n-- Insert data from players.tsv`n"
            
            # Read and process the TSV file
            $players = Get-Content "players.tsv"
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
                        }
                    }
                }
            }
            
            # Write to temporary file
            $tempFile = "temp_migration.sql"
            $migrationSQL | Out-File -FilePath $tempFile -Encoding UTF8
            
            # Execute the migration
            heroku pg:psql HEROKU_POSTGRESQL_ONYX_URL -f $tempFile
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Player data migrated successfully."
            } else {
                Write-Host "❌ Error migrating player data."
                exit 1
            }
            
            # Clean up temporary file
            Remove-Item $tempFile
        }
    }
}

Write-Host ""
Write-Host "🎉 Deployment completed successfully!"
if ($setupDb -or $migrateData) {
    Write-Host "   - Code deployed to Heroku"
    if ($setupDb) { Write-Host "   - Database tables created" }
    if ($migrateData) { Write-Host "   - Player data migrated" }
} else {
    Write-Host "   To also setup database tables, use: .\deploy.ps1 -message 'your message' -setupDb"
    Write-Host "   To migrate player data, use: .\deploy.ps1 -message 'your message' -migrateData"
    Write-Host "   To do both: .\deploy.ps1 -message 'your message' -setupDb -migrateData"
} 