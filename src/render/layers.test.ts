import { describe, expect, it } from 'vitest';
import { LAYER_ORDER, layerAssetName } from './layers';

describe('layer contract (ASSETS.md)', () => {
  it('draws back to front: overlay_back, body, face, overlay_front', () => {
    expect(LAYER_ORDER).toEqual(['overlay_back', 'body', 'face', 'overlay_front']);
  });

  it('uses the shared plain body and face for every kid', () => {
    expect(layerAssetName('hero', 'body')).toBe('kid_plain_body');
    expect(layerAssetName('hero', 'face')).toBe('kid_plain_face');
  });

  it('names per-type overlays kid_<id>_overlay_back/front', () => {
    expect(layerAssetName('firefighter', 'overlay_back')).toBe('kid_firefighter_overlay_back');
    expect(layerAssetName('firefighter', 'overlay_front')).toBe('kid_firefighter_overlay_front');
  });
});
