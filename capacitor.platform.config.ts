import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.footballtrainingboard.platform",
  appName: "FTB Platform",
  webDir: "artifacts/football-training-board/dist/public",
  server: {
    url: "https://football-training-board.onrender.com/platform-login",
    cleartext: false,
  },
  android: {
    path: "android-platform",
  },
};

export default config;
