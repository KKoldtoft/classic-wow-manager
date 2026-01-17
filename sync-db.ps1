# sync-db.ps1
#
# This script syncs the live Heroku database to your local database
# It will download a backup from Heroku and restore it locally
#
# Usage:
#   .\sync-db.ps1

Write-Host "=== Database Sync Script ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will:" -ForegroundColor Yellow
Write-Host "  1. Create a fresh backup of the Heroku database"
Write-Host "  2. Download the backup to your local machine"
Write-Host "  3. Restore it to your local PostgreSQL database"
Write-Host ""

# Check if local DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ ERROR: DATABASE_URL environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set your local PostgreSQL connection string:" -ForegroundColor Yellow
    Write-Host '  $env:DATABASE_URL = "postgresql://username:password@localhost:5432/your_database_name"'
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host '  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/classic_wow"'
    Write-Host ""
    exit 1
}

Write-Host "✅ Local DATABASE_URL found: $env:DATABASE_URL" -ForegroundColor Green
Write-Host ""

# Step 1: Create a backup on Heroku
Write-Host "Step 1: Creating backup on Heroku..." -ForegroundColor Cyan
heroku pg:backups:capture --app classic-wow-manager

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create Heroku backup" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Backup created successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Download the latest backup
Write-Host "Step 2: Downloading backup..." -ForegroundColor Cyan
$backupFile = "latest.dump"

# Get the backup URL
$backupUrl = heroku pg:backups:url --app classic-wow-manager

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to get backup URL" -ForegroundColor Red
    exit 1
}

# Download the backup
Write-Host "Downloading to $backupFile..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $backupUrl.Trim() -OutFile $backupFile

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $backupFile)) {
    Write-Host "❌ Failed to download backup" -ForegroundColor Red
    exit 1
}

$fileSize = (Get-Item $backupFile).length / 1MB
Write-Host "✅ Downloaded backup ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
Write-Host ""

# Step 3: Restore to local database
Write-Host "Step 3: Restoring to local database..." -ForegroundColor Cyan
Write-Host "⚠️  WARNING: This will REPLACE your local database with Heroku data!" -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Continue? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "❌ Sync cancelled by user" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Restoring database..." -ForegroundColor Yellow

# Use pg_restore to restore the backup
# The --clean option drops existing objects before recreating them
# The --no-acl option skips restoration of access privileges
# The --no-owner option skips restoration of object ownership
pg_restore --verbose --clean --no-acl --no-owner -d $env:DATABASE_URL $backupFile

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "⚠️  Some warnings may appear, but the restore might have succeeded" -ForegroundColor Yellow
    Write-Host "   This is normal if your local schema differs slightly from Heroku" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "✅ Database restored successfully!" -ForegroundColor Green
    Write-Host ""
}

# Verify the sync
Write-Host "Verifying sync..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Would you like to see a count of some key tables? (yes/no)" -ForegroundColor Yellow
$verify = Read-Host

if ($verify -eq "yes") {
    # Create a temporary SQL script to count records
    $verifySQL = @"
SELECT 'players' as table_name, COUNT(*) as count FROM players
UNION ALL
SELECT 'roster_overrides', COUNT(*) FROM roster_overrides
UNION ALL
SELECT 'log_data', COUNT(*) FROM log_data
UNION ALL
SELECT 'events', COUNT(*) FROM events;
"@
    
    $tempVerifyFile = "temp_verify.sql"
    $verifySQL | Out-File -FilePath $tempVerifyFile -Encoding UTF8
    
    # Execute the verification query
    psql $env:DATABASE_URL -f $tempVerifyFile
    
    Remove-Item $tempVerifyFile
}

Write-Host ""
Write-Host "🎉 Database sync completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Your local database now has all the data from the live Heroku site." -ForegroundColor Green
Write-Host "You can restart your local server to see the updated data." -ForegroundColor Green
Write-Host ""
