import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vanitycrysis.potatokid',
  appName: 'Potato Kid',
  webDir: 'dist',
  // WebView debugging is left at Capacitor's default: on for debug APKs (used for
  // device frame-time and memory checks, plan §7), off for release builds.
  plugins: {
    // The App plugin is only for pause/resume (lifecycle coordinator). Its default Back
    // handler would swallow Android's Back button in this single-page app; keep the system
    // behaviour instead (Codex review, PR #31).
    App: { disableBackButtonHandler: true },
  },
};

export default config;
