export type Tier = 'preview' | 'print';

export type LayerId =
  | 'sea'
  | 'waterlines'
  | 'hillshade'
  | 'neighbors'
  | 'neBorders'
  | 'sweden'
  | 'parks'
  | 'lakes'
  | 'rivers'
  | 'kommun'
  | 'lan'
  | 'roads'
  | 'railways'
  | 'graticule'
  | 'places'
  | 'labels';

export type Dash = 'solid' | 'dash' | 'dot' | 'dashdot';

export interface LayerFilters {
  /** roads: which highway classes render */
  classes?: Record<string, boolean>;
  /** railways: which usage classes render */
  usages?: Record<string, boolean>;
  /** lakes: minimum surface area */
  minAreaKm2?: number;
  /** rivers: minimum merged length */
  minLengthKm?: number;
  /** parks: which kinds render */
  kinds?: Record<string, boolean>;
  /** places: minimum population for a dot */
  minPopulation?: number;
  /** labels: minimum population for a name */
  labelMinPopulation?: number;
  /** labels: global font multiplier */
  fontScale?: number;
  seaLabels?: boolean;
  lakeLabels?: boolean;
  riverLabels?: boolean;
  neighborLabels?: boolean;
  /** hillshade: multiply darkens (light themes), screen glows inverted relief (dark themes) */
  blend?: 'multiply' | 'screen';
  /** waterlines: how many concentric rings render (1–4) */
  rings?: number;
}

export interface ClassStyle {
  stroke?: string;
  strokeWidthMm?: number;
}

export interface Casing {
  on: boolean;
  color: string;
  /** extra stroke width beyond the road fill, per side, in mm */
  extraMm: number;
}

export interface LayerState {
  id: LayerId;
  visible: boolean;
  opacity: number;
  fill?: string;
  stroke?: string;
  strokeWidthMm?: number;
  dash?: Dash;
  /** per-class overrides (roads); absent classes inherit stroke × width factor */
  classStyles?: Record<string, ClassStyle>;
  /** contrasting under-stroke beneath all classes (roads) */
  casing?: Casing;
  filters: LayerFilters;
}

export interface Furniture {
  /** default ink for furniture text/rules */
  ink: string;
  halo: string;
  title: {
    show: boolean;
    text: string;
    sub: string;
    xMm: number;
    yMm: number;
    sizeMm: number;
    trackingEm: number;
    serif: boolean;
  };
  legend: { show: boolean; xMm: number; yMm: number };
  scalebar: { show: boolean; xMm: number; yMm: number };
  north: { show: boolean; xMm: number; yMm: number };
  attribution: { show: boolean };
  frame: { show: boolean; insetMm: number; paper: string; ruleMm: number; ruleColor: string };
}

export interface LabelOverride {
  dxMm: number;
  dyMm: number;
  hidden?: boolean;
}

export interface Recipe {
  version: 1;
  name: string;
  preset: string;
  paper: { wMm: number; hMm: number; marginMm: number };
  /** bottom → top draw order */
  layers: LayerState[];
  labelOverrides: Record<string, LabelOverride>;
  furniture: Furniture;
}

export interface FileInfo {
  file: string;
  bytes: number;
  features: number;
  bbox: [number, number, number, number] | null;
}

export interface LayerEntry {
  preview: FileInfo;
  print: FileInfo;
  /** distinct simplification tiers exist (legacy manifests: inferred from file names) */
  tiered?: boolean;
  /** render as interior-boundary mesh */
  mesh?: boolean;
}

export interface Manifest {
  manifestVersion?: number;
  generatedAt: string;
  /** country metadata — the app has no hardcoded country facts */
  country?: { name: string; code: string };
  epsg: number;
  crsLabel?: string;
  locale?: string;
  frame: { xmin: number; ymin: number; xmax: number; ymax: number };
  swedenBounds: [number, number, number, number];
  /** cities always shown/labeled regardless of population (e.g. county seats) */
  placePriority?: string[];
  /** chrome label overrides for country-specific layers */
  layerLabels?: Partial<Record<LayerId, string>>;
  /** poster legend strings */
  legendLabels?: Partial<Record<string, string>>;
  layers: Record<string, LayerEntry | null>;
  hillshade: {
    bounds: { xmin: number; ymin: number; xmax: number; ymax: number };
    preview: { file: string; bytes: number };
    print: { file: string; bytes: number };
  } | null;
  attribution: string[];
}

/** Defaults; country-specific entries are overridden by manifest.layerLabels. */
export const LAYER_LABELS: Record<LayerId, string> = {
  sea: 'Sea',
  waterlines: 'Waterlines',
  hillshade: 'Terrain relief',
  neighbors: 'Neighbor land',
  neBorders: 'Neighbor borders',
  sweden: 'Sweden',
  parks: 'National parks',
  lakes: 'Lakes',
  rivers: 'Rivers',
  kommun: 'Kommun borders',
  lan: 'Län borders',
  roads: 'Roads',
  railways: 'Railways',
  graticule: 'Graticule',
  places: 'Cities & towns',
  labels: 'Labels',
};

export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary'] as const;
export const ROAD_WIDTH_FACTOR: Record<string, number> = {
  motorway: 1,
  trunk: 0.82,
  primary: 0.62,
  secondary: 0.45,
};
export const RAIL_USAGES = ['main', 'branch'] as const;
