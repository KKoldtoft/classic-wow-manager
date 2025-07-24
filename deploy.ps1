# deploy.ps1
#
# This script automates the process of committing and deploying changes to Heroku.
#
# Usage:
#   .\deploy.ps1 -message "Your detailed commit message here"
#
# If no message is provided, a default one will be used.

param (
    [string]$message
)

if (-not $message) {
    $message = "Automated commit and deploy"
    Write-Host "No commit message provided. Using default message: '$message'"
}

Write-Host "Step 1: Staging all changes..."
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: 'git add' failed. Aborting."
    exit 1
}

Write-Host "Step 2: Committing changes with message: '$message'"
git commit -m "$message"
if ($LASTEXITCODE -ne 0) {
    # Check if the error is just that there are no changes to commit
    $status = git status --porcelain
    if ($status) {
        Write-Host "Error: 'git commit' failed. Aborting."
        exit 1
    } else {
        Write-Host "No new changes to commit. Pushing existing commits."
    }
}

Write-Host "Step 3: Pushing to Heroku..."
git push heroku master
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: 'git push heroku master' failed."
    exit 1
}

Write-Host "✅ Deployment to Heroku initiated successfully." 