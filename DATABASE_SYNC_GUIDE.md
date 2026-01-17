# DATABASE SYNC GUIDE

## Quick Start - Run These Commands

### Step 1: Open a NEW PowerShell Terminal (not in Cursor)
You need to run this in an interactive terminal where you can type responses.

### Step 2: Navigate to your project
```powershell
cd C:\Users\Kim\classic-wow-manager
```

### Step 3: Set your local database URL
Replace `yourpassword` and `classic_wow` with your actual credentials:
```powershell
$env:DATABASE_URL = "postgresql://postgres:yourpassword@localhost:5432/classic_wow"
```

Common configurations:
- If you're using the default postgres database: `classic_wow` → `postgres`
- If your password is blank, just use: `postgresql://postgres:@localhost:5432/classic_wow`
- If you're using a different username, change `postgres` to your username

### Step 4: IMPORTANT - Stop your local server
Go to your Cursor terminal where npm is running and press `Ctrl+C` to stop the server.
The database must not have any active connections.

### Step 5: Run the sync script
```powershell
.\sync-db-simple.ps1
```

When prompted, type `yes` to confirm.

### Step 6: Restart your server
After the sync completes, go back to Cursor and run:
```powershell
npm start
```

## What This Does

✅ Downloads the complete Heroku database (all events, stats, players, etc.)
✅ Replaces your local database with the live data
✅ Your localhost will now show all current raid logs, events, and statistics from production

## Troubleshooting

### "ERROR: Database sync failed"
- Make sure PostgreSQL is running locally
- Verify your DATABASE_URL is correct
- Ensure no other programs are connected to the database
- Make sure you stopped your npm server

### "Cannot drop database"
- Stop ALL connections to the database (close pgAdmin, stop npm server, etc.)
- You may need to force-disconnect or use a different database name

### Don't have PostgreSQL installed locally?
If you don't have PostgreSQL running locally, you'll need to:
1. Install PostgreSQL for Windows
2. Create a database (or use the default `postgres` database)
3. Then run the sync script

## Alternative: One-Line Command (Advanced)

If you want to do it all in one go:
```powershell
$env:DATABASE_URL = "postgresql://postgres:yourpassword@localhost:5432/classic_wow"; .\sync-db-simple.ps1
```
