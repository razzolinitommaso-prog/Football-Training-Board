# Capacitor mobile build

This project keeps the existing Vite/React frontend and Express/Render backend.
Capacitor is only the native Android/iOS container.

## Prerequisites

- Node.js 20+
- pnpm
- Android Studio with a JDK configured (`JAVA_HOME`)
- A deployed backend URL on Render

## Android workflow

Build the web app with the Render API URL, then sync Capacitor:

```powershell
$env:VITE_API_URL = "https://YOUR-BACKEND.onrender.com"
pnpm build:web
pnpm cap:sync
pnpm cap:open:android
```

Do not use `http://localhost:3001` for mobile builds. Inside an installed app,
`localhost` means the phone itself, not the Render backend.

To create a debug APK from the command line:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The generated debug APK is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Backend CORS

The API accepts Capacitor origins in code:

- `capacitor://localhost`
- `ionic://localhost`
- `http://localhost`

Keep the normal web frontend origin in `APP_ORIGIN` /
`CORS_ALLOWED_ORIGINS` for Vercel or other web deployments.
