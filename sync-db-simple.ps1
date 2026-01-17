# sync-db-simple.ps1
#
# This script syncs the live Heroku database to your local database using Heroku CLI
#
# Prerequisites:
#   - Heroku CLI installed and logged in
#   - A local PostgreSQL database running
#
# Usage:
#   .\sync-db-simple.ps1

Write-Host "=== Simple Database Sync Script ===" -ForegroundColor Cyan
Write-Host ""

# Prompt for local database URL if not set
if (-not $env:DATABASE_URL) {
    Write-Host "Local DATABASE_URL not set in environment." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please enter your local PostgreSQL connection string:" -ForegroundColor Yellow
    Write-Host "Format: postgresql://username:password@localhost:5432/database_name" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Example: postgresql://postgres:postgres@localhost:5432/classic_wow" -ForegroundColor Gray
    Write-Host ""
    
    $localDbUrl = Read-Host "Local DATABASE_URL"
    
    if ([string]::IsNullOrWhiteSpace($localDbUrl)) {
        Write-Host "❌ No database URL provided. Exiting." -ForegroundColor Red
        exit 1
    }
    
    $env:DATABASE_URL = $localDbUrl
}

Write-Host "✅ Using local database: $env:DATABASE_URL" -ForegroundColor Green
Write-Host ""

Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Pull the latest Heroku database backup"
Write-Host "  2. Restore it to your local PostgreSQL database"
Write-Host "  3. ⚠️  REPLACE all local data with Heroku data"
Write-Host ""

$confirmation = Read-Host "Continue? Type 'yes' to proceed"
if ($confirmation -ne "yes") {
    Write-Host "❌ Sync cancelled" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Pulling Heroku database to local..." -ForegroundColor Cyan
Write-Host ""

# Use Heroku's pg:pull command which handles everything
heroku pg:pull HEROKU_POSTGRESQL_ONYX_URL $env:DATABASE_URL --app classic-wow-manager

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Database sync failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  1. Make sure your local PostgreSQL server is running"
    Write-Host "  2. Check that your DATABASE_URL is correct"
    Write-Host "  3. Ensure you have permissions to drop/create the database"
    Write-Host "  4. The local database must not have active connections"
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "🎉 Database sync completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Your local database now matches the live Heroku database." -ForegroundColor Green
Write-Host "You can restart your local server (npm start) to see all current events and stats." -ForegroundColor Green
Write-Host ""
