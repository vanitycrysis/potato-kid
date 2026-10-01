import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vanitycrysis.potatokid',
  appName: 'Potato Kid',
  webDir: 'dist',
  android: {
    // Debug builds allow Chrome remote debugging for frame-time and memory checks (plan §7).
    webContentsDebuggingEnabled: true,
  },
};

export default config;
