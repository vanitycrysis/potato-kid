import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vanitycrysis.potatokid',
  appName: 'Potato Kid',
  webDir: 'dist',
  // WebView debugging is left at Capacitor's default: on for debug APKs (used for
  // device frame-time and memory checks, plan §7), off for release builds.
  // Android Back: the App plugin's handler starts disabled, so Back keeps Android's own
  // behaviour until JavaScript is listening; src/platform/back.ts enables it once its
  // listener is registered (closes an open sheet, else backgrounds the app). Codex
  // reviews, PRs #31 and #39.
  plugins: {
    App: { disableBackButtonHandler: true },
  },
};

export default config;
