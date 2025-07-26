# migrate-web.ps1
#
# This script handles database operations via HTTP calls to your deployed Heroku application.
# No local PostgreSQL installation required!
#
# Usage:
#   .\migrate-web.ps1 -setupDb              # Creates database tables only
#   .\migrate-web.ps1 -migrateData          # Migrates players.tsv data only  
#   .\migrate-web.ps1 -setupDb -migrateData # Does both operations
#
# Parameters:
#   -setupDb: Creates database tables if they don't exist
#   -migrateData: Migrates local players.tsv data to Heroku database
#   -appUrl: Your Heroku app URL (optional, will auto-detect if not provided)

param (
    [switch]$setupDb,
    [switch]$migrateData,
    [string]$appUrl
)

if (-not $setupDb -and -not $migrateData) {
    Write-Host "Usage: .\migrate-web.ps1 -setupDb and/or -migrateData"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\migrate-web.ps1 -setupDb              # Creates database tables"
    Write-Host "  .\migrate-web.ps1 -migrateData          # Migrates players data"
    Write-Host "  .\migrate-web.ps1 -setupDb -migrateData # Does both"
    Write-Host ""
    Write-Host "Optional:"
    Write-Host "  .\migrate-web.ps1 -setupDb -appUrl 'https://your-app.herokuapp.com'"
    exit 1
}

# Auto-detect Heroku app URL if not provided
if (-not $appUrl) {
    Write-Host "Auto-detecting Heroku app URL..."
    try {
        $appInfo = heroku apps:info --json | ConvertFrom-Json
        $appUrl = "https://$($appInfo.app.name).herokuapp.com"
        Write-Host "Detected app URL: $appUrl"
    } catch {
        Write-Host "❌ Could not auto-detect Heroku app URL."
        Write-Host "   Please provide it manually: .\migrate-web.ps1 -setupDb -appUrl 'https://your-app.herokuapp.com'"
        exit 1
    }
}

Write-Host "=== Web-Based Database Migration ==="
Write-Host "App URL: $appUrl"
Write-Host ""

# Function to make HTTP requests
function Invoke-MigrationRequest {
    param(
        [string]$Endpoint,
        [string]$Description
    )
    
    try {
        Write-Host "Calling $Description endpoint..."
        $response = Invoke-RestMethod -Uri "$appUrl/api/admin/$Endpoint" -Method Post -ContentType "application/json"
        
        if ($response.success) {
            Write-Host "✅ $($response.message)"
            if ($response.processedCount) {
                Write-Host "   Records processed: $($response.processedCount)"
            }
                         if ($response.errors) {
                 Write-Host "⚠️  Some errors occurred:"
                 foreach ($migrationError in $response.errors) {
                     Write-Host "   - $migrationError"
                 }
            }
            return $true
        } else {
            Write-Host "❌ $($response.message)"
            if ($response.error) {
                Write-Host "   Error details: $($response.error)"
            }
            return $false
        }
    } catch {
        Write-Host "❌ Failed to call $Description endpoint"
        Write-Host "   Error: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode
            Write-Host "   HTTP Status: $statusCode"
            
            if ($statusCode -eq 404) {
                Write-Host "   Make sure your app is deployed with the latest code."
            }
        }
        return $false
    }
}

# Check if app is accessible
try {
    Write-Host "Checking if app is accessible..."
    $healthCheck = Invoke-RestMethod -Uri "$appUrl/api/db-status" -Method Get -TimeoutSec 10
    Write-Host "✅ App is accessible. Database status: $($healthCheck.status)"
} catch {
    Write-Host "❌ Cannot reach the application at $appUrl"
    Write-Host "   Make sure the app is deployed and running."
    Write-Host "   Error: $($_.Exception.Message)"
    exit 1
}

$allSuccessful = $true

if ($setupDb) {
    Write-Host ""
    Write-Host "Step 1: Setting up database tables..."
    $success = Invoke-MigrationRequest -Endpoint "setup-database" -Description "database setup"
    if (-not $success) {
        $allSuccessful = $false
    }
}

if ($migrateData) {
    Write-Host ""
    Write-Host "Step 2: Migrating player data..."
    
    # Check if players.tsv exists locally
    if (-not (Test-Path "players.tsv")) {
        Write-Host "❌ players.tsv file not found in current directory."
        Write-Host "   Make sure you're running this script from the project root."
        $allSuccessful = $false
    } else {
        Write-Host "✅ Found players.tsv file locally"
        Write-Host "   Note: The migration reads the file from the deployed app, not locally."
        Write-Host "   Make sure you've deployed your latest players.tsv file."
        
        $success = Invoke-MigrationRequest -Endpoint "migrate-players" -Description "player data migration"
        if (-not $success) {
            $allSuccessful = $false
        }
    }
}

Write-Host ""
if ($allSuccessful) {
    Write-Host "🎉 All database operations completed successfully!"
} else {
    Write-Host "⚠️  Some operations failed. Check the messages above."
}

Write-Host ""
Write-Host "To verify the migration worked, you can:"
Write-Host "  1. Visit your app and check if player data is showing correctly"
Write-Host "  2. Check the logs: heroku logs --tail"
Write-Host "  3. Use psql if you have it: heroku pg:psql" 