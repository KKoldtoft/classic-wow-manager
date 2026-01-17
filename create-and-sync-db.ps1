# create-and-sync-db.ps1
# This script creates a new database and syncs Heroku data to it

Write-Host "`n=== Create Database and Sync ===" -ForegroundColor Cyan
Write-Host ""

$dbName = "classic_wow_manager"
$dbUser = "postgres"

Write-Host "Step 1: Creating new database '$dbName'..." -ForegroundColor Yellow

# Drop the database if it exists (to ensure clean slate)
Write-Host "Dropping existing database if it exists..." -ForegroundColor Gray
psql -U $dbUser -d postgres -c "DROP DATABASE IF EXISTS $dbName;" 2>$null

# Create the database
Write-Host "Creating database..." -ForegroundColor Gray
psql -U $dbUser -d postgres -c "CREATE DATABASE $dbName;"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create database" -ForegroundColor Red
    Write-Host "Make sure PostgreSQL is running and you have permissions" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Database '$dbName' created successfully" -ForegroundColor Green
Write-Host ""

# Set the DATABASE_URL
$env:DATABASE_URL = "postgresql://${dbUser}:@localhost:5432/${dbName}"

Write-Host "Step 2: Syncing Heroku database..." -ForegroundColor Yellow
Write-Host "This will download all data from Heroku to your local database" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  WARNING: This may take a few minutes" -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Continue? Type 'yes' to proceed"
if ($confirmation -ne "yes") {
    Write-Host "❌ Sync cancelled" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Pulling Heroku database..." -ForegroundColor Cyan
Write-Host ""

# Use Heroku's pg:pull command
heroku pg:pull HEROKU_POSTGRESQL_ONYX_URL $env:DATABASE_URL --app classic-wow-manager

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Database sync failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Database sync completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Your local database is now synced with Heroku!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 IMPORTANT: Update your local DATABASE_URL" -ForegroundColor Yellow
Write-Host ""
$displayUrl = "postgresql://${dbUser}:@localhost:5432/${dbName}"
Write-Host "Set this environment variable before starting your server:" -ForegroundColor White
Write-Host ""
Write-Host "  DATABASE_URL=$displayUrl" -ForegroundColor Green
Write-Host ""
