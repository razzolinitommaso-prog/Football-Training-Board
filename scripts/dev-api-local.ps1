. (Join-Path $PSScriptRoot "load-cursor-local-env.ps1")

$env:NODE_ENV = "development"
$env:PORT = if ($env:API_PORT) { $env:API_PORT } else { "3201" }

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

Invoke-Pnpm --filter @workspace/api-server run dev
