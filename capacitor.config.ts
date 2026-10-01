import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vanitycrysis.potatokid',
  appName: 'Potato Kid',
  webDir: 'dist',
  // WebView debugging is left at Capacitor's default: on for debug APKs (used for
  // device frame-time and memory checks, plan §7), off for release builds.
};

export default config;
