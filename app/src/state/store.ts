import { create } from 'zustand';
import { LAYER_LABELS, type LayerId, type Recipe, type Tier } from '../types';
import { PRESETS, nordic } from '../presets/presets';

const STORAGE_KEY = 'sweden-map-studio.recipe.v1';

function loadInitialRecipe(): Recipe {
  // ?preset=aurora loads a preset fresh — shareable and handy for comparing looks.
  const requested = new URLSearchParams(window.location.search).get('preset');
  if (requested && PRESETS[requested]) return PRESETS[requested].build();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Recipe;
      if (parsed.version === 1 && Array.isArray(parsed.layers)) return parsed;
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
  selected: LayerId | null;
  tier: Tier;
  labelEdit: boolean;
  view: View | null; // null → viewport fits on next layout
  cursorEN: [number, number] | null;
  /** chrome labels per layer; country-specific entries come from the manifest */
  layerLabels: Record<LayerId, string>;
  past: Recipe[];
  future: Recipe[];
  transientStash: Recipe | null;

  update: (fn: (r: Recipe) => void, history?: boolean) => void;
  beginTransient: () => void;
  endTransient: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: LayerId | null) => void;
  setTier: (t: Tier) => void;
  setLabelEdit: (v: boolean) => void;
  setView: (v: View | null) => void;
  setCursorEN: (c: [number, number] | null) => void;
  setLayerLabels: (labels: Partial<Record<LayerId, string>>) => void;
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

  select: (id) => set({ selected: id }),
  setTier: (tier) => set({ tier }),
  setLabelEdit: (labelEdit) => set({ labelEdit }),
  setView: (view) => set({ view }),
  setCursorEN: (cursorEN) => set({ cursorEN }),
  setLayerLabels: (labels) => set({ layerLabels: { ...LAYER_LABELS, ...labels } }),

  applyPreset: (id) => {
    const builder = PRESETS[id];
    if (!builder) return;
    const prev = get().recipe;
    const next = builder.build();
    next.paper = { ...prev.paper }; // keep the chosen paper
    set({ recipe: next, past: [...get().past.slice(-99), prev], future: [] });
  },

  importRecipe: (r) => {
    const prev = get().recipe;
    set({ recipe: r, past: [...get().past.slice(-99), prev], future: [] });
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

export function layerOf(recipe: Recipe, id: LayerId) {
  return recipe.layers.find((l) => l.id === id);
}
