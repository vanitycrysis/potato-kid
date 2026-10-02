import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Android Back (GUI_MVP §2): closes an open sheet; otherwise behaves like the system Back
 * on the root screen and sends the app to the background. The App plugin's own handler
 * would swallow Back in this single-page app, so it is replaced, not left on
 * (Codex review, PR #31).
 */
export function handleBack(closeSheet: () => boolean): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => {
    if (!closeSheet()) void App.minimizeApp();
  });
}
