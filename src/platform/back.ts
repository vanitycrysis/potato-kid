import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** The part of Capacitor's App plugin Back handling uses (injectable for tests). */
export interface BackNative {
  addListener(event: 'backButton', fn: () => void): Promise<unknown>;
  toggleBackButtonHandler(options: { enabled: boolean }): Promise<void>;
  minimizeApp(): Promise<void>;
}

/**
 * Android Back (GUI_MVP §2): closes an open sheet; otherwise behaves like the system Back
 * on the root screen and sends the app to the background.
 *
 * The plugin's native handler starts disabled (capacitor.config.ts), so until JavaScript
 * is listening, and if the bundle never loads, Back keeps Android's own behaviour. It is
 * enabled only once this listener is registered (Codex review, PR #39). `closeSheet` is
 * set once the HUD exists; before that Back backgrounds the app.
 */
export function handleBack(native: BackNative | null = Capacitor.isNativePlatform() ? App : null): { closeSheet: () => boolean } {
  const handler = { closeSheet: () => false };
  if (!native) return handler;
  void native
    .addListener('backButton', () => {
      if (!handler.closeSheet()) void native.minimizeApp();
    })
    .then(() => native.toggleBackButtonHandler({ enabled: true }));
  return handler;
}
