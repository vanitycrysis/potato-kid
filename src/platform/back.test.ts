import { describe, expect, it } from 'vitest';
import { handleBack } from './back';

describe('Android Back (Codex review, PR #39)', () => {
  it('works before the HUD exists, then closes sheets first', async () => {
    let back!: () => void;
    let minimized = 0;
    const handler = handleBack({
      addListener: (_e, fn) => Promise.resolve((back = fn)),
      minimizeApp: async () => void minimized++,
    });
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
