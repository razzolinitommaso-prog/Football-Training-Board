import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.footballtrainingboard.app",
  appName: "Football Training Board",
  webDir: "artifacts/football-training-board/dist/public",
  android: {
    zoomEnabled: true,
  },
  server: {
    url: "https://football-training-board-static.onrender.com",
    cleartext: false,
  },
};

export default config;
