$envFile = Join-Path $PSScriptRoot "..\.env.cursor.local.ps1"

if (-not (Test-Path $envFile)) {
  throw "Missing local env file: $envFile"
}

. $envFile

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is missing in .env.cursor.local.ps1"
}
