$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:VITE_API_URL = "https://football-training-board-api.onrender.com"
$env:VITE_APP_MODE = "platform"

Set-Location $root
pnpm run build:web

$androidApp = Join-Path $root "android"
$androidPlatform = Join-Path $root "android-platform"
if (-not (Test-Path (Join-Path $root "android-platform"))) {
  Copy-Item -Recurse -Path $androidApp -Destination $androidPlatform
}

$platformBuildGradle = Join-Path $androidPlatform "app\build.gradle"
(Get-Content $platformBuildGradle) `
  -replace 'com\.footballtrainingboard\.app', 'com.footballtrainingboard.platform' |
  Set-Content $platformBuildGradle

$platformStrings = Join-Path $androidPlatform "app\src\main\res\values\strings.xml"
(Get-Content $platformStrings) `
  -replace 'Football Training Board', 'FTB Platform' `
  -replace 'com\.footballtrainingboard\.app', 'com.footballtrainingboard.platform' |
  Set-Content $platformStrings

$oldMain = Join-Path $androidPlatform "app\src\main\java\com\footballtrainingboard\app\MainActivity.java"
$newMainDir = Join-Path $androidPlatform "app\src\main\java\com\footballtrainingboard\platform"
New-Item -ItemType Directory -Force -Path $newMainDir | Out-Null
if (Test-Path $oldMain) {
  $newMain = Join-Path $newMainDir "MainActivity.java"
  (Get-Content $oldMain) `
    -replace 'package com\.footballtrainingboard\.app;', 'package com.footballtrainingboard.platform;' |
    Set-Content $newMain
}

$cap = Join-Path $root "node_modules\.bin\cap.cmd"
if (-not (Test-Path $cap)) {
  throw "Capacitor CLI not found. Run pnpm install first."
}

& $cap copy android
Copy-Item -Recurse -Force `
  -Path (Join-Path $androidApp "app\src\main\assets\public") `
  -Destination (Join-Path $androidPlatform "app\src\main\assets")

$platformCapacitorConfig = Join-Path $androidPlatform "app\src\main\assets\capacitor.config.json"
@{
  appId = "com.footballtrainingboard.platform"
  appName = "FTB Platform"
  webDir = "artifacts/football-training-board/dist/public"
} | ConvertTo-Json | Set-Content $platformCapacitorConfig

$jdk = Get-ChildItem (Join-Path $root ".tools") -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "jdk-21*" } |
  Select-Object -First 1

if ($jdk) {
  $env:JAVA_HOME = $jdk.FullName
  $env:Path = "$($jdk.FullName)\bin;$env:Path"
}

$androidSdk = Join-Path $root ".tools\android-sdk"
if (Test-Path $androidSdk) {
  $env:ANDROID_HOME = $androidSdk
  $env:ANDROID_SDK_ROOT = $androidSdk
  $env:Path = "$androidSdk\platform-tools;$androidSdk\cmdline-tools\latest\bin;$env:Path"
}

Set-Location (Join-Path $root "android-platform")
.\gradlew.bat assembleDebug

Set-Location $root
$downloads = Join-Path $root "downloads"
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
Copy-Item -Force `
  -Path (Join-Path $root "android-platform\app\build\outputs\apk\debug\app-debug.apk") `
  -Destination (Join-Path $downloads "ftb-platform-android-debug.apk")

Write-Host "FTB Platform APK:"
Write-Host (Join-Path $downloads "ftb-platform-android-debug.apk")
