# EXAMPLE: How to set your DATABASE_URL
# Copy one of these examples and modify it with your actual credentials

# Example 1: Standard PostgreSQL setup
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/classic_wow"

# Example 2: No password
# $env:DATABASE_URL = "postgresql://postgres:@localhost:5432/classic_wow"

# Example 3: Using default postgres database
# $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"

# Example 4: Custom username and database
# $env:DATABASE_URL = "postgresql://myuser:mypassword@localhost:5432/mydb"

# After setting this, run:
# .\sync-db-simple.ps1
