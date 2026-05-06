$pathUpper = [System.Environment]::GetEnvironmentVariable("PATH", "Process")
$pathMixed = [System.Environment]::GetEnvironmentVariable("Path", "Process")
$resolvedPath = if ($pathMixed) { $pathMixed } else { $pathUpper }
if ($resolvedPath) {
  Remove-Item Env:PATH -ErrorAction SilentlyContinue
  Remove-Item Env:Path -ErrorAction SilentlyContinue
  [System.Environment]::SetEnvironmentVariable("Path", $resolvedPath, "Process")
}

$root = Join-Path $PSScriptRoot ".."
$logDir = Join-Path $root "tmp\static-local"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://postgres:postgres@localhost:5432/football_app" }
$env:SESSION_SECRET = if ($env:SESSION_SECRET) { $env:SESSION_SECRET } else { "ftb-cursor-local-session" }
$env:PORT = "3201"
$env:NODE_ENV = "development"

$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"
$webOut = Join-Path $logDir "web.out.log"
$webErr = Join-Path $logDir "web.err.log"

$loader = (Join-Path $PSScriptRoot "esm-extension-loader.mjs").Replace("\", "/")
$apiProcess = Start-Process -FilePath "node" -ArgumentList "--loader `"$loader`" artifacts/api-server/dist/index.js" -WorkingDirectory $root -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -WindowStyle Hidden -PassThru
$webProcess = Start-Process -FilePath "node" -ArgumentList "artifacts/football-training-board/dist/preview-proxy-5184.mjs" -WorkingDirectory $root -RedirectStandardOutput $webOut -RedirectStandardError $webErr -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 3

[pscustomobject]@{
  ApiPid = $apiProcess.Id
  WebPid = $webProcess.Id
  ApiOut = $apiOut
  ApiErr = $apiErr
  WebOut = $webOut
  WebErr = $webErr
} | ConvertTo-Json
