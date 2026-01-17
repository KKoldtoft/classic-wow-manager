# Fix PostgreSQL Authentication - Try These Solutions

## Solution 1: Reset PostgreSQL Password (RECOMMENDED)

Open PowerShell AS ADMINISTRATOR and run:

```powershell
# Connect to PostgreSQL as the Windows user (should work without password)
psql -U postgres

# Once connected, run this SQL command:
ALTER USER postgres WITH PASSWORD 'newpassword';

# Exit psql
\q
```

Then try the sync again with:
```powershell
$env:DATABASE_URL = "postgresql://postgres:newpassword@localhost:5432/postgres"
.\sync-db-simple.ps1
```

---

## Solution 2: Use Windows Authentication (No Password)

Try connecting without specifying postgres user:

```powershell
# Set DATABASE_URL with your Windows username
$env:DATABASE_URL = "postgresql://$env:USERNAME:@localhost:5432/postgres"
.\sync-db-simple.ps1
```

---

## Solution 3: Modify pg_hba.conf to Trust Local Connections

This allows connections without password from localhost:

1. Open: `C:\Program Files\PostgreSQL\17\data\pg_hba.conf` in Notepad AS ADMINISTRATOR

2. Find lines that look like:
   ```
   host    all             all             127.0.0.1/32            scram-sha-256
   host    all             all             ::1/128                 scram-sha-256
   ```

3. Change `scram-sha-256` to `trust`:
   ```
   host    all             all             127.0.0.1/32            trust
   host    all             all             ::1/128                 trust
   ```

4. Restart PostgreSQL service:
   ```powershell
   Restart-Service postgresql-x64-17
   ```

5. Then connect without password:
   ```powershell
   $env:DATABASE_URL = "postgresql://postgres:@localhost:5432/postgres"
   .\sync-db-simple.ps1
   ```

---

## Solution 4: Use the Default Postgres Database

You might not have created a "classic_wow" database. Try using the default "postgres" database:

```powershell
$env:DATABASE_URL = "postgresql://postgres:yourpassword@localhost:5432/postgres"
.\sync-db-simple.ps1
```

---

## Quick Test: Check if PostgreSQL is Running

```powershell
Get-Service | Where-Object {$_.Name -like "*postgres*"}
```

Should show "Running" status.

---

## What I Recommend:

**Try Solution 2 first** (Windows authentication) - it's the quickest:

```powershell
cd C:\Users\Kim\classic-wow-manager
$env:DATABASE_URL = "postgresql://Kim:@localhost:5432/postgres"
.\sync-db-simple.ps1
```

If that doesn't work, use **Solution 1** to reset the password to something you know.
