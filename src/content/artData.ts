// Types and loaders for ChatGPT/Codex's authored sidecars (ASSETS.md v2,
// ART_AUDIO_PLAN.md). These are art data: Claude only reads them, never edits them.
// `npm run art:export` validates and copies them from art/data to assets/data.

import { withFarmRelocations } from './artRules';

export type Vec2 = [number, number];
/** Absolute source-canvas box: [left, top, right, bottom] in pixels. */
export type BoundsPx = [number, number, number, number];

export interface Attachment {
  position: Vec2;
  rotationDeg: number;
  scale: Vec2;
}

export interface BodyFrame {
  asset: string;
  boundsPx: BoundsPx;
  attachments: Record<string, Attachment>;
}

export interface Body {
  boundsPx: BoundsPx;
  frames: Record<string, BodyFrame>;
}

export interface Face {
  sourcePivot: Vec2;
  states: Record<string, string>;
}

export interface CostumeComponent {
  asset: string;
  layer: 'back' | 'front';
  attachTo: string;
  sourcePivot: Vec2;
  fitByBody: Record<string, Vec2>;
}

export interface Costume {
  status: string;
  components: CostumeComponent[];
}

export interface ComponentTransform {
  offsetPx?: Vec2;
  rotationDeg?: number;
  scale?: Vec2;
}

export interface ClipFrame {
  bodyFrame?: string;
  /** A face state name, or "inherit" to keep the current/blink-driven state. */
  faceState?: string;
  rig?: { offsetPx?: Vec2; rotationDeg?: number; opacity?: number };
  attachmentOffsets?: Record<string, Vec2>;
  componentTransforms?: Record<string, ComponentTransform>;
  /** Zero-based frame of the clip's `effect` shown during this entry. */
  effectFrame?: number;
}

export interface Clip {
  fps: number;
  loop: boolean;
  frames: ClipFrame[];
  layerMask?: string[];
  /** Name of the shared effect (in `effects`) this clip drives through `effectFrame`. */
  effect?: string;
  /** Discovery: only on a recipe's first discovery. */
  firstDiscoveryOnly?: boolean;
}

/** A transient event effect (spawn, fusion, discovery): shared by every kid type. */
export interface EventEffect {
  canvas: Vec2;
  sourcePivot: Vec2;
  layer: 'behind_kid' | 'above_kid';
  /** Source-px translation from the kid's ground point, before world/appearance scaling. */
  offsetPx: Vec2;
  frames: { asset: string; opacity: number }[];
}

/** The ground shadow drawn under every kid. */
export interface ShadowEffect {
  asset: string;
  canvas: Vec2;
  sourcePivot: Vec2;
  offsetPx: Vec2;
  /** Opacity multiplier while the kid is held. */
  heldOpacity: number;
}

export interface ReducedMotionEntry {
  bodyFrame?: string;
  faceState?: string;
  /** Keep the kid's current pose (effect-only clips such as discovery). */
  kidPose?: 'preserve';
  /** Fade a newborn in over this long instead of playing its clip. */
  opacityTransitionMs?: number;
}

export interface KidRig {
  canvas: Vec2;
  groundAnchor: Vec2;
  worldCanvasSize: number;
  layerOrder: string[];
  appearance: {
    bodyWeights: Record<string, number>;
    faceWeights: Record<string, number>;
    sizes: { scale: number; weight: number }[];
  };
  bodies: Record<string, Body>;
  faces: Record<string, Face>;
  costumes: Record<string, Costume>;
  clips: Record<string, Clip>;
  effects: { shadow: ShadowEffect } & Record<string, EventEffect | ShadowEffect>;
  reducedMotion: Record<string, ReducedMotionEntry>;
  scheduler: {
    blinkDelaySeconds: Vec2;
    stationaryDelaySeconds: Vec2;
    ambientWeights: Record<string, number>;
    seatedHoldSeconds: Vec2;
    sleepHoldSeconds: Vec2;
    /** Highest first: which presentation wins when several apply (e.g. pick-up over spawn). */
    priority: string[];
  };
}

export interface MapInstance {
  id: string;
  asset: string;
  worldGround: Vec2;
  sourcePivot: Vec2;
  scale: number;
  rotationDeg: number;
  exclusionRadiusWorld: number;
  drawOrder: number;
  boundsPx: BoundsPx;
}

export interface MapData {
  worldSize: Vec2;
  tileSize: number;
  groundCells: { col: number; row: number; asset: string }[];
  pathGridOrigin: Vec2;
  pathCells: { col: number; row: number; asset: string; rotationDeg: number }[];
  instances: MapInstance[];
  exclusions: { kidSceneryGapWorld: number };
  camera: { initialCentre: Vec2 };
  garden: { worldGround: Vec2; spawnOutlet: Vec2 };
}

export interface UiData {
  palette?: Record<string, string>;
  [key: string]: unknown;
}

const data = import.meta.glob('../../assets/data/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

function pick<T>(name: string): T | undefined {
  const hit = Object.entries(data).find(([path]) => path.endsWith(`/${name}`));
  return hit?.[1] as T | undefined;
}

export const kidRig = pick<KidRig>('kid_rig_v2.json');

/** One wild clip frame (kid_wild_v1, D-072/D-073): the stand body, bobbed; the face's state. */
export interface WildFrame {
  durationMs: number;
  frame: string;
  offsetPx: Vec2;
  faceState: string;
  opacity: number;
}

/**
 * Codex's wild kids (kid_wild_v1.json): the ten rares and twenty specials keep only the
 * shared face (D-072, D-073). Each draws one stand body of its own, the face at its anchor,
 * and simple bob clips; its collision box comes from its own lifetime bounds.
 */
export interface WildData {
  canvas: Vec2;
  groundAnchor: Vec2;
  worldCanvasSize: number;
  /**
   * Per clip name: its frames, or a `fallback` clip whose frames it borrows (only the frames:
   * its timing stays the scheduler's, `fallbackTiming`). A clip not listed shows the stand.
   */
  clips: Record<string, { loop: boolean; frames?: WildFrame[]; fallback?: string }>;
  /** Per clip name: the still frame under reduced motion. */
  reducedMotion: Record<string, { frame: string; offsetPx: Vec2; faceState: string; opacity: number }>;
  /** A rare's profile line (§16.2). */
  rareProfiles: Record<string, string>;
  types: Record<
    string,
    {
      name: string;
      collection: 'rare' | 'special';
      frames: Record<string, { asset: string; boundsPx: BoundsPx }>;
      faceAnchorPx: Vec2;
      faceScale: number;
      /** The box every clip stays inside, in source px: collision, at the saved scale. */
      lifetimeBoundsPx: BoundsPx;
    }
  >;
}
export const kidWild = pick<WildData>('kid_wild_v1.json');
const rawMap = pick<MapData>('map_garden_v3.json');

/** One of Codex's four field sites (farm_v1, GUI_MVP §22.1): the bed, its pads, crops and target. */
export interface FarmField {
  worldGround: Vec2;
  sourcePivot: Vec2;
  scale: number;
  /** The bay the field takes, about its ground: scenery once bought. */
  reserveRelative: [number, number, number, number];
  /** Working kids' feet, about the ground: rear left, rear right, front left, front right. */
  workerFeetRelative: Vec2[];
  /** Which pad each newcomer takes, in order (indexes into `workerFeetRelative`). */
  workerAdmissionPadOrder: number[];
  /** Where the two crop stamps stand, about the ground. */
  cropGroundsRelative: Vec2[];
  /** The drop target for assigning by drag, about the ground (§22.4). */
  dragRelative: [number, number, number, number];
}

/** Codex's food fields (farm_v1): the sites, the scenery they push aside, and how they're drawn. */
export interface FarmData {
  fields: FarmField[];
  sceneryRelocations: { instanceId: string; from: Vec2; to: Vec2 }[];
  findFieldsCentre: Vec2;
  render: {
    fieldAsset: string;
    cropAssets: Record<string, string>;
    cropSourcePivot: Vec2;
    cropScale: number;
  };
}
export const farmData = pick<FarmData>('farm_v1.json');

/** The map as the game has it: Codex's farm relocations applied (GUI_MVP §22.1). */
export const mapData = rawMap && withFarmRelocations(rawMap, farmData);
export const uiData = pick<UiData>('ui_v2.json');

/** Codex's planting tokens (GUI_MVP §15, `gate4_v2.json` → planting). */
export interface PlantingArt {
  gardenId: string;
  plotOffsetsWorld: [number, number][];
  plotCanvasScale: number;
  sourcePivot: [number, number];
  /** The soil and stage art's bounds in source px [left, top, right, bottom] (§15.2). */
  composedSourceBounds: [number, number, number, number];
  /** Soil, always drawn. */
  empty: string;
  /** Growing stages by progress, then the ready sign (`from: 1`). */
  stages: { from: number; to?: number; asset: string }[];
  waitingAsset: string;
  fillingAsset: string;
  filledSlotAsset: string;
  filledSlotSourceCentre: [number, number];
  fillingSlotCentresSource: [number, number][];
}
export const gate4Data = pick<{ planting?: PlantingArt; [key: string]: unknown }>('gate4_v2.json');
/** Generated by art:export (ROSTER-SCALE): cropped exports, [x, y, w, h, canvasW, canvasH]. */
export const trimData = pick<Record<string, [number, number, number, number, number, number]>>('trim.json');
