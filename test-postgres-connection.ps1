# test-postgres-connection.ps1
# This script helps you test different PostgreSQL connection methods

Write-Host "`n=== PostgreSQL Connection Test ===" -ForegroundColor Cyan
Write-Host ""

$testConnections = @(
    @{
        Name = "Windows User (Kim) - No Password"
        URL = "postgresql://Kim:@localhost:5432/postgres"
    },
    @{
        Name = "postgres user - No Password"
        URL = "postgresql://postgres:@localhost:5432/postgres"
    },
    @{
        Name = "postgres user - Password: postgres"
        URL = "postgresql://postgres:postgres@localhost:5432/postgres"
    },
    @{
        Name = "postgres user - Password: admin"
        URL = "postgresql://postgres:admin@localhost:5432/postgres"
    }
)

Write-Host "Testing connection methods..." -ForegroundColor Yellow
Write-Host ""

foreach ($conn in $testConnections) {
    Write-Host "Testing: $($conn.Name)" -ForegroundColor White
    
    $env:DATABASE_URL = $conn.URL
    
    # Try to connect with psql
    $testQuery = "SELECT version();"
    $result = $testQuery | psql $env:DATABASE_URL 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ SUCCESS! This connection works!" -ForegroundColor Green
        Write-Host "  Use this DATABASE_URL:" -ForegroundColor Green
        Write-Host "  $($conn.URL)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Copy and paste this to sync your database:" -ForegroundColor Yellow
        Write-Host '  $env:DATABASE_URL = "' -NoNewline -ForegroundColor Cyan
        Write-Host $conn.URL -NoNewline -ForegroundColor Green
        Write-Host '"' -ForegroundColor Cyan
        Write-Host "  .\sync-db-simple.ps1" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    } else {
        Write-Host "  ❌ Failed" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "❌ None of the automatic tests worked." -ForegroundColor Red
Write-Host ""
Write-Host "Manual options:" -ForegroundColor Yellow
Write-Host "1. Set a new postgres password (see FIX_POSTGRES_AUTH.md)" -ForegroundColor White
Write-Host "2. Check if PostgreSQL service is running:" -ForegroundColor White
Write-Host "   Get-Service | Where-Object {`$_.Name -like '*postgres*'}" -ForegroundColor Gray
Write-Host ""
