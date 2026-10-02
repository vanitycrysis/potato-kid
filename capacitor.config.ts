import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vanitycrysis.potatokid',
  appName: 'Potato Kid',
  webDir: 'dist',
  // WebView debugging is left at Capacitor's default: on for debug APKs (used for
  // device frame-time and memory checks, plan §7), off for release builds.
  // Android Back is handled explicitly (src/platform/back.ts): it closes an open sheet,
  // otherwise it backgrounds the app like the system Back (GUI_MVP §2; Codex review, PR #31).
};

export default config;
