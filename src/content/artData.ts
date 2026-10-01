// Types and loaders for ChatGPT/Codex's authored sidecars (ASSETS.md v2,
// ART_AUDIO_PLAN.md). These are art data: Claude only reads them, never edits them.
// `npm run art:export` validates and copies them from art/data to assets/data.

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
}

export interface Clip {
  fps: number;
  loop: boolean;
  frames: ClipFrame[];
  layerMask?: string[];
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
  reducedMotion: Record<string, { bodyFrame?: string; faceState?: string }>;
  scheduler: {
    blinkDelaySeconds: Vec2;
    stationaryDelaySeconds: Vec2;
    ambientWeights: Record<string, number>;
    seatedHoldSeconds: Vec2;
    sleepHoldSeconds: Vec2;
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
export const mapData = pick<MapData>('map_garden_v2.json');
export const uiData = pick<UiData>('ui_v2.json');
