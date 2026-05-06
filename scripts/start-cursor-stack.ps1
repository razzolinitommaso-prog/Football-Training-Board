. (Join-Path $PSScriptRoot "load-cursor-local-env.ps1")

# Keep PATH/Path aligned for child processes without removing either one.
$pathUpper = [System.Environment]::GetEnvironmentVariable("PATH", "Process")
$pathMixed = [System.Environment]::GetEnvironmentVariable("Path", "Process")
$resolvedPath = if ($pathMixed) { $pathMixed } else { $pathUpper }
if ($resolvedPath) {
  Remove-Item Env:PATH -ErrorAction SilentlyContinue
  Remove-Item Env:Path -ErrorAction SilentlyContinue
  [System.Environment]::SetEnvironmentVariable("Path", $resolvedPath, "Process")
}

function Stop-ListenersOnPort {
  param (
    [Parameter(Mandatory = $true)]
    [string]$Port
  )

  $listenerIds = cmd /c "netstat -ano | findstr :$Port" |
    ForEach-Object {
      $parts = ($_ -replace '\s+', ' ').Trim().Split(' ')
      if ($parts.Length -ge 5 -and $parts[3] -eq 'LISTENING') {
        $parts[4]
      }
    } |
    Where-Object { $_ -match '^\d+$' } |
    Sort-Object -Unique

  foreach ($listenerPid in $listenerIds) {
    try {
      Stop-Process -Id ([int]$listenerPid) -Force -ErrorAction Stop
    } catch {
      Write-Warning "Unable to stop PID $listenerPid on port ${Port}: $($_.Exception.Message)"
    }
  }
}

function Stop-VitePorts {
  param (
    [Parameter(Mandatory = $true)]
    [int]$StartPort,
    [Parameter(Mandatory = $true)]
    [int]$EndPort
  )

  for ($port = $StartPort; $port -le $EndPort; $port++) {
    Stop-ListenersOnPort -Port ([string]$port)
  }
}

$logDir = Join-Path $PSScriptRoot "..\tmp\cursor-dev"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Stop-ListenersOnPort -Port $env:API_PORT
Stop-VitePorts -StartPort ([int]$env:WEB_PORT) -EndPort (([int]$env:WEB_PORT) + 5)

$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"
$webOut = Join-Path $logDir "web.out.log"
$webErr = Join-Path $logDir "web.err.log"

foreach ($file in @($apiOut, $apiErr, $webOut, $webErr)) {
  if (Test-Path $file) {
    Remove-Item -LiteralPath $file -Force
  }
}

$apiScript = Join-Path $PSScriptRoot "dev-api-local.ps1"
$webScript = Join-Path $PSScriptRoot "dev-web-local.ps1"

$apiProcess = Start-Process -FilePath "powershell" -ArgumentList "-ExecutionPolicy Bypass -File `"$apiScript`"" -WorkingDirectory (Join-Path $PSScriptRoot "..") -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -WindowStyle Hidden -PassThru

$webProcess = Start-Process -FilePath "powershell" -ArgumentList "-ExecutionPolicy Bypass -File `"$webScript`"" -WorkingDirectory (Join-Path $PSScriptRoot "..") -RedirectStandardOutput $webOut -RedirectStandardError $webErr -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 8

[pscustomobject]@{
  ApiPid = $apiProcess.Id
  WebPid = $webProcess.Id
  ApiOut = $apiOut
  ApiErr = $apiErr
  WebOut = $webOut
  WebErr = $webErr
} | ConvertTo-Json
