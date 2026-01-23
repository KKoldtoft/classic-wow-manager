# simple-sync.ps1
# Simple script to sync Heroku database to your existing local database
# Excludes wcl_event_pages table data (huge WCL event cache, only used for /live and /livehost)

$env:PGPASSWORD = "10041004aA"
$LOCAL_DB = "classic_wow_manager"
$DUMP_FILE = "$env:TEMP\heroku_dump.backup"

Write-Host "Syncing Heroku database to $LOCAL_DB..." -ForegroundColor Cyan
Write-Host "(Excluding wcl_event_pages data - large table only used for /live feature)" -ForegroundColor Gray
Write-Host ""

# Get the Heroku database URL
Write-Host "Getting Heroku database URL..." -ForegroundColor Yellow
$HEROKU_DB_URL = heroku config:get HEROKU_POSTGRESQL_ONYX_URL -a classic-wow-manager

if (-not $HEROKU_DB_URL) {
    Write-Host "Failed to get Heroku database URL" -ForegroundColor Red
    exit 1
}

# Force disconnect all users from the local database
Write-Host "Disconnecting existing connections..." -ForegroundColor Yellow
psql -U postgres -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB' AND pid <> pg_backend_pid();" 2>$null

# Drop and recreate the database
Write-Host "Recreating local database..." -ForegroundColor Yellow
psql -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS $LOCAL_DB;"
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE $LOCAL_DB;"

Write-Host ""
Write-Host "Pulling Heroku database (excluding wcl_event_pages data)..." -ForegroundColor Cyan
Write-Host "This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

# Use pg_dump with custom format to preserve constraints, then restore with pg_restore
# --exclude-table-data keeps the table schema but skips the massive data
pg_dump $HEROKU_DB_URL --format=custom --no-owner --no-acl --exclude-table-data=wcl_event_pages -f $DUMP_FILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "Dump failed." -ForegroundColor Red
    exit 1
}

Write-Host "Restoring to local database..." -ForegroundColor Yellow
pg_restore -U postgres -h localhost -d $LOCAL_DB --no-owner --no-acl $DUMP_FILE 2>$null

# Clean up dump file
Remove-Item $DUMP_FILE -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done! Your local database is now synced." -ForegroundColor Green
    Write-Host ""
    Write-Host "Note: wcl_event_pages table exists but is empty (data excluded for speed)." -ForegroundColor Gray
    Write-Host "This only affects the /live and /livehost pages - all other features work normally." -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "Sync completed (some non-critical warnings may have occurred)." -ForegroundColor Yellow
}

$env:PGPASSWORD = $null
