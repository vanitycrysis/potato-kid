/**
 * Kid layer contract (ENGINEERING_PLAN.md §5, PR #2 review):
 * 256 × 256 canvases, ground anchor at (128, 224), drawn back to front.
 */
export const LAYER_SIZE = 256;
export const ANCHOR_X = 128 / LAYER_SIZE;
export const ANCHOR_Y = 224 / LAYER_SIZE;

export const LAYER_ORDER = ['overlay_back', 'body', 'face', 'overlay_front'] as const;
export type LayerName = (typeof LAYER_ORDER)[number];

/** Body and face are shared by every kid (`kid_plain_*`, ASSETS.md); overlays are per type and optional. */
export function layerAssetName(kidType: string, layer: LayerName): string {
  return layer === 'body' || layer === 'face' ? `kid_plain_${layer}` : `kid_${kidType}_${layer}`;
}
