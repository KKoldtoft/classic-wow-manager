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