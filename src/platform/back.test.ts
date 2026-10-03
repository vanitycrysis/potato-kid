import { describe, expect, it } from 'vitest';
import { handleBack } from './back';

describe('Android Back (Codex review, PR #39)', () => {
  it('works before the HUD exists, then closes sheets first', async () => {
    let back!: () => void;
    let minimized = 0;
    const toggles: boolean[] = [];
    const handler = handleBack({
      addListener: (_e, fn) => Promise.resolve((back = fn)),
      toggleBackButtonHandler: async ({ enabled }) => void toggles.push(enabled),
      minimizeApp: async () => void minimized++,
    });
    // The native handler is enabled only after the listener is registered.
    expect(toggles).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(toggles).toEqual([true]);
    back(); // during boot: no HUD yet, behaves like the system Back
    expect(minimized).toBe(1);
    let sheetOpen = true;
    handler.closeSheet = () => {
      const was = sheetOpen;
      sheetOpen = false;
      return was;
    };
    back(); // closes the sheet
    expect(minimized).toBe(1);
    back(); // nothing open: background the app
    expect(minimized).toBe(2);
  });
});
