import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** The part of Capacitor's App plugin Back handling uses (injectable for tests). */
export interface BackNative {
  addListener(event: 'backButton', fn: () => void): Promise<unknown>;
  minimizeApp(): Promise<void>;
}

/**
 * Android Back (GUI_MVP §2): closes an open sheet; otherwise behaves like the system Back
 * on the root screen and sends the app to the background. The App plugin's own handler
 * would swallow Back in this single-page app, so it is replaced (Codex review, PR #31).
 *
 * Registered before boot's asynchronous work, so Back works during loading and on a boot
 * error screen; `closeSheet` is set once the HUD exists (Codex review, PR #39).
 */
export function handleBack(native: BackNative | null = Capacitor.isNativePlatform() ? App : null): { closeSheet: () => boolean } {
  const handler = { closeSheet: () => false };
  void native?.addListener('backButton', () => {
    if (!handler.closeSheet()) void native.minimizeApp();
  });
  return handler;
}
