# Classic Wow Manager – How to Deploy and Refresh Your Setup (PowerShell Version)

This guide explains, in simple terms, how to update your project code from Heroku and refresh your local database. It’s written to be easy to follow and uses **only PowerShell commands** for Windows.

---

## What You Need Before You Start

- **Heroku CLI**: Installed and logged in.
- **PostgreSQL**: Installed locally.
- **App Name**: Confirm the Heroku app is `classic-wow-manager`.
- **Password**: Know your local PostgreSQL password to replace `<your-local-pg-password>`.

---

## Step 1. Log In to Heroku

Open **PowerShell** and run:

```powershell
heroku login
$token = heroku auth:token

## Step 1. Log In to Heroku
These commands make sure your local project is connected to Herokus code:

git fetch heroku
git remote set-url heroku "https://apikey:$token@git.heroku.com/classic-wow-manager.git"
git fetch heroku



These commands reset your local database so it matches Herokus database:

# Set your local PostgreSQL credentials
$env:PGUSER = "postgres"
$env:PGPASSWORD = "<your-local-pg-password>"

# Disconnect anything currently using the database
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='classic_wow_manager';"

# Delete the old copy of the database
psql -U postgres -c "DROP DATABASE IF EXISTS classic_wow_manager;"

# Download a fresh copy from Heroku
heroku pg:pull DATABASE_URL classic_wow_manager -a classic-wow-manager


# Move to your project folder and update your code:

Set-Location "C:\Users\Kim\classic-wow-manager"
git remote -v   # Check that the remote is correct
git fetch heroku

# WARNING: This replaces your local code with Heroku’s version and removes any unsaved changes
git checkout -B master
git reset --hard heroku/master


Install Everything and Start
npm ci
npm run dev

# This is how I doploy
.\deploy.ps1 -message "Message"

---

## Sync Local Database with Heroku

To pull the live Heroku database and replace your local database content, use:

```powershell
npm run sync-db
```

This is the **easiest method**. It runs `simple-sync.ps1` which:
1. Disconnects any active connections to your local database
2. Drops and recreates the local `classic_wow_manager` database
3. Pulls a fresh copy from Heroku using `pg_dump` (excludes large tables for speed)

> **Note**: The sync excludes data from `wcl_event_pages` (a large table storing WCL combat events). This table is only used for the `/live` and `/livehost` real-time raid analysis feature. All other features work normally. The table schema is created, just empty.

> **Technical**: The script uses `pg_dump --format=custom` + `pg_restore` instead of piping to preserve all constraints and indexes properly.

### Alternative: Interactive Sync

For a more guided experience with confirmation prompts:

```powershell
.\sync-db-simple.ps1
```

This script will:
- Prompt for your DATABASE_URL if not set
- Ask for confirmation before proceeding
- Show helpful error messages if something goes wrong

### Prerequisites
- Heroku CLI installed and logged in (`heroku login`)
- Local PostgreSQL server running
- No active connections to the local database (stop your dev server first)