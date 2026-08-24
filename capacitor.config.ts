import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.footballtrainingboard.app",
  appName: "Football Training Board",
  webDir: "artifacts/football-training-board/dist/public",
  server: {
    url: "https://football-training-board.onrender.com",
    cleartext: false,
  },
};

export default config;
