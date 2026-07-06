import { create } from 'zustand';
import { LAYER_LABELS, type LayerId, type LayerState, type Recipe, type Tier } from '../types';
import { PRESETS, nordic } from '../presets/presets';

const STORAGE_KEY = 'sweden-map-studio.recipe.v1';

/** Layer types that make sense as multiple instances (different filters/styles). */
export const DUPLICABLE: ReadonlySet<LayerId> = new Set([
  'waterlines', 'contours', 'parks', 'lakes', 'rivers', 'kommun', 'lan',
  'roads', 'railways', 'ferries', 'trails', 'lighthouses', 'airports', 'castles', 'graticule',
] as LayerId[]);

/** Older recipes predate layer instances — give every layer a uid. */
function migrate(recipe: Recipe): Recipe {
  for (const l of recipe.layers) {
    if (!l.uid) l.uid = l.id;
  }
  return recipe;
}

function loadInitialRecipe(): Recipe {
  // ?preset=aurora loads a preset fresh — shareable and handy for comparing looks.
  const requested = new URLSearchParams(window.location.search).get('preset');
  if (requested && PRESETS[requested]) return PRESETS[requested].build();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Recipe;
      if (parsed.version === 1 && Array.isArray(parsed.layers)) return migrate(parsed);
    }
  } catch {
    /* fall through to default */
  }
  return nordic();
}

export interface View {
  k: number;
  tx: number;
  ty: number;
}

interface StudioState {
  recipe: Recipe;
  /** selected layer instance uid */
  selected: string | null;
  tier: Tier;
  labelEdit: boolean;
  view: View | null; // null → viewport fits on next layout
  cursorEN: [number, number] | null;
  /** chrome labels per layer type; country-specific entries come from the manifest */
  layerLabels: Record<LayerId, string>;
  past: Recipe[];
  future: Recipe[];
  transientStash: Recipe | null;

  update: (fn: (r: Recipe) => void, history?: boolean) => void;
  beginTransient: () => void;
  endTransient: () => void;
  undo: () => void;
  redo: () => void;
  select: (uid: string | null) => void;
  setTier: (t: Tier) => void;
  setLabelEdit: (v: boolean) => void;
  setView: (v: View | null) => void;
  setCursorEN: (c: [number, number] | null) => void;
  setLayerLabels: (labels: Partial<Record<LayerId, string>>) => void;
  duplicateLayer: (uid: string) => void;
  removeLayer: (uid: string) => void;
  applyPreset: (id: string) => void;
  importRecipe: (r: Recipe) => void;
}

export const useStudio = create<StudioState>((set, get) => ({
  recipe: loadInitialRecipe(),
  selected: null,
  tier: 'preview',
  labelEdit: false,
  view: null,
  cursorEN: null,
  layerLabels: { ...LAYER_LABELS },
  past: [],
  future: [],
  transientStash: null,

  update: (fn, history = true) => {
    const prev = get().recipe;
    const next = structuredClone(prev);
    fn(next);
    set({
      recipe: next,
      ...(history
        ? { past: [...get().past.slice(-99), prev], future: [] }
        : {}),
    });
  },

  beginTransient: () => set({ transientStash: structuredClone(get().recipe) }),
  endTransient: () => {
    const stash = get().transientStash;
    if (stash && JSON.stringify(stash) !== JSON.stringify(get().recipe)) {
      set({ past: [...get().past.slice(-99), stash], future: [], transientStash: null });
    } else {
      set({ transientStash: null });
    }
  },

  undo: () => {
    const { past, recipe, future } = get();
    if (!past.length) return;
    set({ recipe: past[past.length - 1], past: past.slice(0, -1), future: [recipe, ...future].slice(0, 100) });
  },
  redo: () => {
    const { past, recipe, future } = get();
    if (!future.length) return;
    set({ recipe: future[0], future: future.slice(1), past: [...past.slice(-99), recipe] });
  },

  select: (uid) => set({ selected: uid }),
  setTier: (tier) => set({ tier }),
  setLabelEdit: (labelEdit) => set({ labelEdit }),
  setView: (view) => set({ view }),
  setCursorEN: (cursorEN) => set({ cursorEN }),
  setLayerLabels: (labels) => set({ layerLabels: { ...LAYER_LABELS, ...labels } }),

  duplicateLayer: (uid) => {
    const src = get().recipe.layers.find((l) => l.uid === uid);
    if (!src || !DUPLICABLE.has(src.id)) return;
    const copy = structuredClone(src);
    copy.uid = `${src.id}-${Math.random().toString(36).slice(2, 8)}`;
    copy.label = `${src.label ?? get().layerLabels[src.id]} copy`;
    get().update((r) => {
      const idx = r.layers.findIndex((l) => l.uid === uid);
      r.layers.splice(idx + 1, 0, copy);
    });
    set({ selected: copy.uid });
  },

  removeLayer: (uid) => {
    const { recipe } = get();
    const target = recipe.layers.find((l) => l.uid === uid);
    if (!target) return;
    const siblings = recipe.layers.filter((l) => l.id === target.id);
    if (siblings.length <= 1) return; // never remove the last instance of a type
    get().update((r) => {
      r.layers = r.layers.filter((l) => l.uid !== uid);
    });
    if (get().selected === uid) set({ selected: null });
  },

  applyPreset: (id) => {
    const builder = PRESETS[id];
    if (!builder) return;
    const prev = get().recipe;
    const next = builder.build();
    next.paper = { ...prev.paper }; // keep the chosen paper
    set({ recipe: next, past: [...get().past.slice(-99), prev], future: [], selected: null });
  },

  importRecipe: (r) => {
    const prev = get().recipe;
    set({ recipe: migrate(r), past: [...get().past.slice(-99), prev], future: [], selected: null });
  },
}));

// Debounced autosave.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStudio.subscribe((state) => {
  clearTimeout(saveTimer);
  const r = state.recipe;
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    } catch {
      /* storage full/unavailable — autosave is best-effort */
    }
  }, 400);
});

/** Layer instance by uid. */
export function layerOf(recipe: Recipe, uid: string): LayerState | undefined {
  return recipe.layers.find((l) => l.uid === uid);
}

/** First instance of a layer TYPE — for type-level logic (labels engine, shields, …). */
export function layerOfType(recipe: Recipe, id: LayerId): LayerState | undefined {
  return recipe.layers.find((l) => l.id === id);
}
