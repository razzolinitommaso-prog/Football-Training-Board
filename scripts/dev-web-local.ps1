. (Join-Path $PSScriptRoot "load-cursor-local-env.ps1")

$env:PORT = if ($env:WEB_PORT) { $env:WEB_PORT } else { "5184" }
$env:API_PORT = if ($env:API_PORT) { $env:API_PORT } else { "3201" }
$env:API_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:$($env:API_PORT)" }
$env:VITE_API_URL = if ($env:VITE_API_URL) { $env:VITE_API_URL } else { $env:API_URL }
$env:BASE_PATH = if ($env:BASE_PATH) { $env:BASE_PATH } else { "/" }

function Invoke-Pnpm {
  param (
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  $command = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($command) {
    & $command.Source @Arguments
    return
  }

  $command = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($command) {
    & $command.Source @Arguments
    return
  }

  $fallbackPath = Join-Path $env:APPDATA "npm\pnpm.cmd"
  if (Test-Path $fallbackPath) {
    & $fallbackPath @Arguments
    return
  }

  throw "pnpm not found in PATH. Verify Node.js/pnpm installation."
}

Invoke-Pnpm --filter @workspace/football-training-board run dev
