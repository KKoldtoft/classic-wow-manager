# simple-sync.ps1
# Simple script to sync Heroku database to your existing local database

$env:DATABASE_URL = "postgres://postgres:10041004aA@localhost:5432/classic_wow_manager"

Write-Host "Syncing Heroku database to classic_wow_manager..." -ForegroundColor Cyan
Write-Host ""

# Drop the local database - pg:pull will recreate it
Write-Host "Dropping existing database..." -ForegroundColor Yellow
$env:PGPASSWORD = "10041004aA"

# Force disconnect all users from the database
psql -U postgres -h localhost -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'classic_wow_manager' AND pid <> pg_backend_pid();" 2>$null

# Drop the database (pg:pull will create it fresh)
psql -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS classic_wow_manager;"

$env:PGPASSWORD = $null

Write-Host ""
Write-Host "Pulling Heroku database..." -ForegroundColor Cyan
heroku pg:pull HEROKU_POSTGRESQL_ONYX_URL $env:DATABASE_URL --app classic-wow-manager

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done! Your local database is now synced." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Sync failed." -ForegroundColor Red
}
