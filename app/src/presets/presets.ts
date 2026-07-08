import type { LayerId, LayerState, Recipe } from '../types';

const A1 = { wMm: 594, hMm: 841, marginMm: 26 };

type StylePatch = Partial<Omit<LayerState, 'id' | 'filters'>> & { filters?: LayerState['filters'] };

const DEFAULT_FILTERS: Partial<Record<LayerId, LayerState['filters']>> = {
  hillshade: { blend: 'multiply' },
  waterlines: { rings: 4 },
  contours: { intervalM: 400, boldEveryM: 0 },
  roads: { classes: { motorway: true, trunk: true, primary: true, secondary: false } },
  railways: { usages: { main: true, branch: true } },
  lakes: { minAreaKm2: 8 },
  rivers: { minLengthKm: 60 },
  ferries: { minLengthKm: 10 },
  trails: { networks: { nwn: true, rwn: false }, minLengthKm: 60 },
  parks: { kinds: { national_park: true, nature_reserve: false } },
  places: { minPopulation: 14000 },
  labels: {
    labelMinPopulation: 42000,
    fontScale: 1,
    seaLabels: true,
    lakeLabels: true,
    riverLabels: true,
    regionLabels: false,
    neighborLabels: true,
  },
};

/** bottom → top. Hillshade multiplies/screens over the area fills, so it sits above them
    (flat terrain = no-op) and below line work and labels. */
const ORDER: LayerId[] = [
  'sea', 'bathymetry', 'waterlines', 'neighbors', 'neBorders', 'sweden', 'parks', 'lakes',
  'rivers', 'hillshade', 'contours', 'kommun', 'lan', 'roads', 'railways', 'trails', 'ferries', 'lighthouses', 'airports', 'castles', 'graticule', 'places', 'labels',
];

/** Second/third instance of a layer type — the presets' way of using layer duplication:
    a faint wash under a bold hero, double-line borders, split park kinds, … */
interface Extra {
  of: LayerId;
  uid: string;
  /** shown in the layers panel and as the legend row */
  label: string;
  patch: StylePatch;
}

function buildLayers(styles: Record<LayerId, StylePatch>, hidden: LayerId[] = [], extras: Extra[] = []): LayerState[] {
  const layers: LayerState[] = ORDER.map((id) => {
    const { filters: filterPatch, ...style } = styles[id] ?? {};
    return {
      uid: id,
      id,
      visible: !hidden.includes(id),
      opacity: 1,
      filters: { ...structuredClone(DEFAULT_FILTERS[id] ?? {}), ...filterPatch },
      ...style,
    };
  });
  for (const ex of extras) {
    const { filters: filterPatch, ...style } = ex.patch;
    // insert above the last instance of the type: extras draw on top of their base,
    // and the base stays first so type-level reads (shields, thresholds) hit it
    let at = -1;
    for (let i = 0; i < layers.length; i++) if (layers[i].id === ex.of) at = i;
    layers.splice(at + 1, 0, {
      uid: ex.uid,
      id: ex.of,
      label: ex.label,
      visible: true,
      opacity: 1,
      filters: { ...structuredClone(DEFAULT_FILTERS[ex.of] ?? {}), ...filterPatch },
      ...style,
    });
  }
  return layers;
}

function recipe(name: string, preset: string, layers: LayerState[], f: Partial<Recipe['furniture']>): Recipe {
  return {
    version: 1,
    name,
    preset,
    paper: { ...A1 },
    layers,
    labelOverrides: {},
    furniture: {
      ink: '#2E3440',
      halo: '#F7F5F0',
      title: {
        show: true, text: 'SVERIGE', sub: 'SWEREF 99 TM  ·  {scale}',
        xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.42, serif: false,
      },
      legend: { show: true, xMm: 52, yMm: 682 },
      scalebar: { show: true, xMm: 412, yMm: 700 },
      north: { show: true, xMm: 462, yMm: 585 },
      attribution: { show: true },
      frame: { show: false, insetMm: 14, paper: '#FCFCFA', ruleMm: 0.3, ruleColor: '#2E3440' },
      ...f,
    },
  };
}

// ---------------------------------------------------------------------------
// Light & painterly
// ---------------------------------------------------------------------------

/** Scandinavian minimalism: paper-white land, whisper coast rings, falu-red arteries.
    Lakes come in two instances — a pale all-lakes wash under the deep great lakes. */
export function nordic(): Recipe {
  return recipe('Nordic minimal', 'nordic', buildLayers({
    sea: { fill: '#DDE8EE' },
    bathymetry: { fill: '#C4D6E2' },
    waterlines: { stroke: '#C7D9E3', strokeWidthMm: 0.13, filters: { rings: 2 } },
    hillshade: { opacity: 0.15 },
    contours: { stroke: '#C3BFB4', strokeWidthMm: 0.09 },
    neighbors: { fill: '#ECEAE5' },
    neBorders: { stroke: '#D5D2C9', strokeWidthMm: 0.18 },
    sweden: { fill: '#F7F5F0', stroke: '#9AA6B2', strokeWidthMm: 0.22 },
    parks: { fill: '#DCE5D4', opacity: 0.95 },
    lakes: { fill: '#CFE0E9', filters: { minAreaKm2: 3 } },
    rivers: { stroke: '#C2D8E4', strokeWidthMm: 0.28 },
    kommun: { stroke: '#C9CED6', strokeWidthMm: 0.12 },
    lan: { stroke: '#9AA0A8', strokeWidthMm: 0.26 },
    roads: { shields: { on: false, fill: '#2F7D46', text: '#FFFFFF', everyMm: 150 }, stroke: '#B9553F', strokeWidthMm: 0.5 },
    railways: { stroke: '#2E3440', strokeWidthMm: 0.28, dash: 'dash' },
    trails: { stroke: '#B98A5A', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#8FA6B8', strokeWidthMm: 0.18, dash: 'dash' },
    lighthouses: { fill: '#5F7A8C', sizeMm: 2.6 },
    airports: { fill: '#5F7A8C', sizeMm: 2.8 },
    castles: { fill: '#5F7A8C', sizeMm: 2.4 },
    graticule: { stroke: '#A9BDCB', strokeWidthMm: 0.12, opacity: 0.6 },
    places: { fill: '#2E3440' },
    labels: { fill: '#2E3440', stroke: '#6E8296' },
  }, ['kommun', 'graticule', 'contours', 'trails', 'lighthouses', 'airports', 'castles'], [
    { of: 'lakes', uid: 'lakes-great', label: 'Great lakes', patch: { fill: '#BBD3E1', filters: { minAreaKm2: 120 } } },
  ]), {});
}

/** Cut-paper collage: flat pastel shapes, zero outlines. The coast rings render as
    stacked paper layers fading into the sea; cities are terracotta confetti dots. */
export function pastell(): Recipe {
  return recipe('Pappersklipp', 'pastell', buildLayers({
    sea: { fill: '#A9C6D6' },
    bathymetry: { fill: '#8FB2C6' },
    waterlines: { stroke: '#7FA3B8', strokeWidthMm: 1.2 },
    hillshade: { opacity: 0.12 },
    contours: { stroke: '#D8CFBC', strokeWidthMm: 0.1 },
    neighbors: { fill: '#E6DBC4' },
    neBorders: { stroke: '#D6C9AE', strokeWidthMm: 0.16 },
    sweden: { fill: '#F4EAD5' },
    parks: { fill: '#B9CDA0' },
    lakes: { fill: '#8FB4C8', filters: { minAreaKm2: 20 } },
    rivers: { stroke: '#8FB4C8', strokeWidthMm: 0.6, filters: { minLengthKm: 100 } },
    kommun: { stroke: '#E2D7C0', strokeWidthMm: 0.1 },
    lan: { stroke: '#D6C9AE', strokeWidthMm: 0.18 },
    roads: { shields: { on: false, fill: '#6E8F54', text: '#F4EAD5', everyMm: 150 }, stroke: '#C97F6F', strokeWidthMm: 0.45 },
    railways: { stroke: '#5A5348', strokeWidthMm: 0.26, dash: 'dash' },
    trails: { stroke: '#B08968', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#7FA3B8', strokeWidthMm: 0.2, dash: 'dash' },
    lighthouses: { fill: '#C97F6F', sizeMm: 2.6 },
    airports: { fill: '#5A5348', sizeMm: 2.8 },
    castles: { fill: '#B08968', sizeMm: 2.4 },
    graticule: { stroke: '#BFD0DA', strokeWidthMm: 0.12, opacity: 0.6 },
    places: { fill: '#C97F6F', filters: { minPopulation: 120000 } },
    labels: {
      fill: '#5A5348', stroke: '#7391A0',
      filters: { labelMinPopulation: 250000, fontScale: 1.1, seaLabels: false, lakeLabels: false, riverLabels: false, neighborLabels: false },
    },
  }, ['bathymetry', 'hillshade', 'contours', 'neBorders', 'kommun', 'lan', 'roads', 'railways', 'trails', 'ferries', 'lighthouses', 'airports', 'castles', 'graticule']), {
    ink: '#5A5348',
    halo: '#F4EAD5',
    title: { show: true, text: 'SVERIGE', sub: 'PAPPERSKLIPP  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.35, serif: false },
    legend: { show: false, xMm: 52, yMm: 682 },
    scalebar: { show: false, xMm: 412, yMm: 700 },
    north: { show: false, xMm: 462, yMm: 585 },
    frame: { show: true, insetMm: 16, paper: '#FAF6EC', ruleMm: 0.2, ruleColor: '#D8CFBC' },
  });
}

/** Imhof-inspired: warm alpine paper, relief as the hero, fine 200 m contours with
    bold index lines every 1000 m, Kungsleden-class trails on. Linework recedes. */
export function alpine(): Recipe {
  return recipe('Fjällrelief', 'alpine', buildLayers({
    sea: { fill: '#C9DAE3' },
    bathymetry: { fill: '#AFC8D6' },
    waterlines: { stroke: '#A9C4D2', strokeWidthMm: 0.13 },
    hillshade: { opacity: 0.5 },
    contours: { stroke: '#A8916A', strokeWidthMm: 0.08, filters: { intervalM: 200, boldEveryM: 1000 } },
    neighbors: { fill: '#E9E7DE' },
    neBorders: { stroke: '#CFCABC', strokeWidthMm: 0.16 },
    sweden: { fill: '#F1EFE4', stroke: '#8C959C', strokeWidthMm: 0.2 },
    parks: { fill: '#D8E2C6', opacity: 0.8 },
    lakes: { fill: '#A8C9DB' },
    rivers: { stroke: '#A8C9DB', strokeWidthMm: 0.32 },
    kommun: { stroke: '#C2C2BA', strokeWidthMm: 0.1 },
    lan: { stroke: '#8E8E86', strokeWidthMm: 0.18 },
    roads: { shields: { on: false, fill: '#4E7A5A', text: '#F1EFE4', everyMm: 150 }, stroke: '#8C4A3C', strokeWidthMm: 0.32 },
    railways: { stroke: '#3B3F45', strokeWidthMm: 0.22, dash: 'dash' },
    trails: { stroke: '#A5522F', strokeWidthMm: 0.26, dash: 'dot' },
    ferries: { stroke: '#93AEBE', strokeWidthMm: 0.16, dash: 'dash' },
    lighthouses: { fill: '#587488', sizeMm: 2.6 },
    airports: { fill: '#33383E', sizeMm: 2.8 },
    castles: { fill: '#6E5B44', sizeMm: 2.4 },
    graticule: { stroke: '#A9BDCB', strokeWidthMm: 0.12, opacity: 0.6 },
    places: { fill: '#33383E' },
    labels: { fill: '#33383E', stroke: '#587488' },
  }, ['kommun', 'graticule', 'waterlines', 'bathymetry', 'ferries', 'lighthouses', 'airports', 'castles']), {
    ink: '#33383E',
    halo: '#F1EFE4',
    title: { show: true, text: 'SVERIGE', sub: 'RELIEFKARTA  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.4, serif: false },
  });
}

/** Contour-line art: the terrain as pure linework — fine ink contours with burnt-orange
    index lines (a second contour instance), coast echoed by sea rings, framed like a print. */
export function kurvor(): Recipe {
  return recipe('Höjdkurvor', 'kurvor', buildLayers({
    sea: { fill: '#F7F6F2' },
    bathymetry: { fill: '#ECEAE3' },
    waterlines: { stroke: '#9FB6C4', strokeWidthMm: 0.14, filters: { rings: 3 } },
    hillshade: { opacity: 0.15 },
    contours: { stroke: '#5F6572', strokeWidthMm: 0.11, filters: { intervalM: 200, boldEveryM: 0 } },
    neighbors: { fill: '#F2F0EB' },
    neBorders: { stroke: '#DBD8D0', strokeWidthMm: 0.14 },
    sweden: { fill: '#FFFFFF', stroke: '#3A3F47', strokeWidthMm: 0.22 },
    parks: { fill: '#EDF0E4', opacity: 0.9 },
    lakes: { fill: '#FFFFFF', stroke: '#3A3F47', strokeWidthMm: 0.15, filters: { minAreaKm2: 20 } },
    rivers: { stroke: '#9FB6C4', strokeWidthMm: 0.18, filters: { minLengthKm: 150 } },
    kommun: { stroke: '#D8D8D2', strokeWidthMm: 0.1 },
    lan: { stroke: '#B9B9B2', strokeWidthMm: 0.16 },
    roads: { shields: { on: false, fill: '#3A3F47', text: '#FFFFFF', everyMm: 150 }, stroke: '#8A8A84', strokeWidthMm: 0.3 },
    railways: { stroke: '#8A8A84', strokeWidthMm: 0.22, dash: 'dash' },
    trails: { stroke: '#B9836A', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#9FB6C4', strokeWidthMm: 0.16, dash: 'dash' },
    lighthouses: { fill: '#6E7480', sizeMm: 2.4 },
    airports: { fill: '#3A3F47', sizeMm: 2.6 },
    castles: { fill: '#6E7480', sizeMm: 2.2 },
    graticule: { stroke: '#D0D6DB', strokeWidthMm: 0.12, opacity: 0.8 },
    places: { fill: '#1F232B', filters: { minPopulation: 300000 } },
    labels: {
      fill: '#1F232B', stroke: '#7391A0',
      filters: { labelMinPopulation: 300000, fontScale: 0.95, seaLabels: false, lakeLabels: false, riverLabels: false, neighborLabels: false },
    },
  }, ['bathymetry', 'hillshade', 'parks', 'kommun', 'lan', 'neBorders', 'roads', 'railways', 'trails', 'ferries', 'lighthouses', 'airports', 'castles', 'graticule'], [
    { of: 'contours', uid: 'contours-index', label: 'Index contours', patch: { stroke: '#C2502F', strokeWidthMm: 0.24, filters: { intervalM: 1000, boldEveryM: 0 } } },
  ]), {
    ink: '#1F232B',
    halo: '#FFFFFF',
    title: { show: true, text: 'SVERIGE', sub: 'HÖJDKURVOR VAR 200 M  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.55, serif: false },
    legend: { show: false, xMm: 52, yMm: 682 },
    north: { show: false, xMm: 462, yMm: 585 },
    frame: { show: true, insetMm: 14, paper: '#FFFFFF', ruleMm: 0.3, ruleColor: '#1F232B' },
  });
}

// ---------------------------------------------------------------------------
// Cartographic classics
// ---------------------------------------------------------------------------

/** The full reference sheet: contours, bathymetry, casings, E-road shields, graticule,
    both park kinds as separate instances — every layer earning its keep. */
export function topo(): Recipe {
  return recipe('Classic topographic', 'topo', buildLayers({
    sea: { fill: '#A9D2E2' },
    bathymetry: { fill: '#7FB8D2' },
    waterlines: { stroke: '#7FB5C9', strokeWidthMm: 0.14 },
    hillshade: { opacity: 0.2 },
    contours: { stroke: '#B39B72', strokeWidthMm: 0.09, filters: { intervalM: 400, boldEveryM: 1000 } },
    neighbors: { fill: '#E6E3D8' },
    neBorders: { stroke: '#B9B4A4', strokeWidthMm: 0.2 },
    sweden: { fill: '#EEF0DE', stroke: '#5F6B76', strokeWidthMm: 0.25 },
    parks: { fill: '#D6E3BF', opacity: 0.75, label: 'Nature reserves', filters: { kinds: { national_park: false, nature_reserve: true } } },
    lakes: { fill: '#8FC4DA', stroke: '#5F9FBC', strokeWidthMm: 0.1 },
    rivers: { stroke: '#5F9FBC', strokeWidthMm: 0.3 },
    kommun: { stroke: '#8E9298', strokeWidthMm: 0.12, dash: 'dot' },
    lan: { stroke: '#6B6F76', strokeWidthMm: 0.3, dash: 'dashdot' },
    roads: {
      shields: { on: true, fill: '#2D8039', text: '#FFFFFF', everyMm: 130 },
      stroke: '#C43B2E', strokeWidthMm: 0.55,
      casing: { on: true, color: '#FFFFFF', extraMm: 0.14 },
      classStyles: {
        motorway: { stroke: '#C43B2E' },
        trunk: { stroke: '#D96038' },
        primary: { stroke: '#E8933A' },
        secondary: { stroke: '#E8B54F' },
      },
    },
    railways: { stroke: '#1A1A1A', strokeWidthMm: 0.3, dash: 'dash' },
    trails: { stroke: '#8A4A2E', strokeWidthMm: 0.24, dash: 'dot' },
    ferries: { stroke: '#4A7E99', strokeWidthMm: 0.2, dash: 'dash' },
    lighthouses: { fill: '#3E6E85', sizeMm: 2.4 },
    airports: { fill: '#1A1A1A', sizeMm: 2.8 },
    castles: { fill: '#6E4A2E', sizeMm: 2.4 },
    graticule: { stroke: '#7FA3B5', strokeWidthMm: 0.13, opacity: 0.8 },
    places: { fill: '#1A1A1A' },
    labels: { fill: '#1A1A1A', stroke: '#3E6E85', filters: { regionLabels: true } },
  }, ['waterlines', 'castles'], [
    { of: 'parks', uid: 'parks-national', label: 'National parks', patch: { fill: '#BFD9A8', stroke: '#7FA35C', strokeWidthMm: 0.12, opacity: 0.9, filters: { kinds: { national_park: true, nature_reserve: false } } } },
  ]), {
    ink: '#1A1A1A',
    halo: '#EEF0DE',
    title: { show: true, text: 'SVERIGE', sub: 'TOPOGRAFISK ÖVERSIKT  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 11.5, trackingEm: 0.3, serif: true },
  });
}

/** Turn-of-the-century school atlas: engraved coast hatching, county borders as a rose
    band under a fine dark line (two län instances), steamer routes, castles, serif labels. */
export function atlas(): Recipe {
  return recipe('Skolatlas', 'atlas', buildLayers({
    sea: { fill: '#CDDDE0' },
    bathymetry: { fill: '#B4C9CD' },
    waterlines: { stroke: '#9DB8B8', strokeWidthMm: 0.15 },
    hillshade: { opacity: 0.12 },
    contours: { stroke: '#C0AE8E', strokeWidthMm: 0.1 },
    neighbors: { fill: '#EFE7D2' },
    neBorders: { stroke: '#B5A88C', strokeWidthMm: 0.2 },
    sweden: { fill: '#F9F3E3', stroke: '#6E5B44', strokeWidthMm: 0.25 },
    parks: { fill: '#D5DCBA', opacity: 0.9 },
    lakes: { fill: '#BCD2D6', stroke: '#7FA0A4', strokeWidthMm: 0.1 },
    rivers: { stroke: '#7FA0A4', strokeWidthMm: 0.28 },
    kommun: { stroke: '#BBA98C', strokeWidthMm: 0.12, dash: 'dot' },
    lan: { stroke: '#E0AC96', strokeWidthMm: 0.9, opacity: 0.5, label: 'County band' },
    roads: { shields: { on: false, fill: '#4A6B4F', text: '#F9F3E3', everyMm: 150 }, stroke: '#A6503C', strokeWidthMm: 0.4 },
    railways: { stroke: '#3F352A', strokeWidthMm: 0.3, dash: 'dash' },
    trails: { stroke: '#8A6A45', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#7FA0A4', strokeWidthMm: 0.18, dash: 'dash' },
    lighthouses: { fill: '#5E7A74', sizeMm: 2.4 },
    airports: { fill: '#3F352A', sizeMm: 2.8 },
    castles: { fill: '#7A6650', sizeMm: 1.7 },
    graticule: { stroke: '#A79A80', strokeWidthMm: 0.14, opacity: 0.8 },
    places: { fill: '#3F352A' },
    labels: { fill: '#3F352A', stroke: '#5E7A74', filters: { regionLabels: true, serifLabels: true, fontScale: 1.05 } },
  }, ['bathymetry', 'hillshade', 'contours', 'parks', 'kommun', 'roads', 'trails', 'lighthouses', 'airports'], [
    { of: 'lan', uid: 'lan-line', label: 'County line', patch: { stroke: '#7A5040', strokeWidthMm: 0.18, opacity: 1 } },
  ]), {
    ink: '#3F352A',
    halo: '#F9F3E3',
    title: { show: true, text: 'Sverige', sub: 'SKOLATLAS ÖFVER KONUNGARIKET  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 13.5, trackingEm: 0.12, serif: true },
    frame: { show: true, insetMm: 13, paper: '#F6EFDC', ruleMm: 0.5, ruleColor: '#6E5B44' },
  });
}

/** Nautical chart: depth bands and beacons are the story — buff land kept empty,
    four coastal fathom rings, lighthouses, ferry lanes, a proper graticule. */
export function sjokort(): Recipe {
  return recipe('Sjökort', 'sjokort', buildLayers({
    sea: { fill: '#EAF2F6' },
    bathymetry: { fill: '#8FBDD6' },
    waterlines: { stroke: '#8FB3C4', strokeWidthMm: 0.16 },
    hillshade: { opacity: 0.12 },
    contours: { stroke: '#C9B896', strokeWidthMm: 0.09 },
    neighbors: { fill: '#EFE9D6' },
    neBorders: { stroke: '#CDC4AA', strokeWidthMm: 0.16 },
    sweden: { fill: '#F7EDD3', stroke: '#4A4A46', strokeWidthMm: 0.2 },
    parks: { fill: '#E4E8CC', opacity: 0.9 },
    lakes: { fill: '#C6DDE9', stroke: '#8FB3C4', strokeWidthMm: 0.08 },
    rivers: { stroke: '#8FB3C4', strokeWidthMm: 0.22 },
    kommun: { stroke: '#D5CDB6', strokeWidthMm: 0.1 },
    lan: { stroke: '#B0A88E', strokeWidthMm: 0.18 },
    roads: { shields: { on: false, fill: '#4A6E85', text: '#F7EDD3', everyMm: 150 }, stroke: '#B0A88E', strokeWidthMm: 0.3 },
    railways: { stroke: '#8A8474', strokeWidthMm: 0.22, dash: 'dash' },
    trails: { stroke: '#B0A88E', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#4A6E85', strokeWidthMm: 0.22, dash: 'dash' },
    lighthouses: { fill: '#B9553F', sizeMm: 1.9 },
    airports: { fill: '#4A4A46', sizeMm: 2.6 },
    castles: { fill: '#8A8474', sizeMm: 2.2 },
    graticule: { stroke: '#9FBECC', strokeWidthMm: 0.16, opacity: 1 },
    places: { fill: '#33332F', filters: { minPopulation: 50000 } },
    labels: { fill: '#33332F', stroke: '#4A7E99', filters: { labelMinPopulation: 90000, serifLabels: true } },
  }, ['hillshade', 'contours', 'parks', 'kommun', 'lan', 'roads', 'railways', 'trails', 'airports', 'castles']), {
    ink: '#33332F',
    halo: '#F7EDD3',
    title: { show: true, text: 'SVERIGE', sub: 'SJÖKORT  ·  DJUP I METER  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.35, serif: true },
    frame: { show: true, insetMm: 12, paper: '#F4F0E2', ruleMm: 0.4, ruleColor: '#4A4A46' },
  });
}

/** The roadless map: national parks and long-distance trails are the heroes, each split
    into two instances (parks by kind, trails by network). No roads, no railways. */
export function vildmark(): Recipe {
  return recipe('Vildmark', 'vildmark', buildLayers({
    sea: { fill: '#CBD9D0' },
    bathymetry: { fill: '#B4C6BC' },
    waterlines: { stroke: '#B2C4B8', strokeWidthMm: 0.14 },
    hillshade: { opacity: 0.22 },
    contours: { stroke: '#B9B29A', strokeWidthMm: 0.09 },
    neighbors: { fill: '#E4E7D8' },
    neBorders: { stroke: '#C6CBB8', strokeWidthMm: 0.16 },
    sweden: { fill: '#F0F2E6', stroke: '#7E8C74', strokeWidthMm: 0.22 },
    parks: { fill: '#D9E3C4', opacity: 0.9, label: 'Nature reserves', filters: { kinds: { national_park: false, nature_reserve: true } } },
    lakes: { fill: '#A6C4CB' },
    rivers: { stroke: '#96BAC1', strokeWidthMm: 0.3 },
    kommun: { stroke: '#CDD1C2', strokeWidthMm: 0.1 },
    lan: { stroke: '#A8AC9C', strokeWidthMm: 0.18 },
    roads: { shields: { on: false, fill: '#6E8F54', text: '#F0F2E6', everyMm: 150 }, stroke: '#8C8C84', strokeWidthMm: 0.3 },
    railways: { stroke: '#5A5A52', strokeWidthMm: 0.22, dash: 'dash' },
    trails: { stroke: '#B08968', strokeWidthMm: 0.18, dash: 'dot', label: 'Regional trails', filters: { networks: { nwn: false, rwn: true }, minLengthKm: 40 } },
    ferries: { stroke: '#9DB4B8', strokeWidthMm: 0.16, dash: 'dash' },
    lighthouses: { fill: '#6E8478', sizeMm: 2.4 },
    airports: { fill: '#3E4438', sizeMm: 2.6 },
    castles: { fill: '#6E8478', sizeMm: 2.2 },
    graticule: { stroke: '#BCC8BE', strokeWidthMm: 0.12, opacity: 0.7 },
    places: { fill: '#3E4438', filters: { minPopulation: 50000 } },
    labels: {
      fill: '#3E4438', stroke: '#6E8478',
      filters: { labelMinPopulation: 100000, seaLabels: false, neighborLabels: false },
    },
  }, ['bathymetry', 'waterlines', 'contours', 'kommun', 'roads', 'railways', 'ferries', 'lighthouses', 'airports', 'castles', 'graticule'], [
    { of: 'parks', uid: 'parks-national', label: 'National parks', patch: { fill: '#A9C688', stroke: '#6E8F54', strokeWidthMm: 0.14, filters: { kinds: { national_park: true, nature_reserve: false } } } },
    { of: 'trails', uid: 'trails-national', label: 'National trails', patch: { stroke: '#9C4526', strokeWidthMm: 0.34, dash: 'dot', filters: { networks: { nwn: true, rwn: false }, minLengthKm: 60 } } },
  ]), {
    ink: '#3E4438',
    halo: '#F0F2E6',
    title: { show: true, text: 'SVERIGE', sub: 'NATIONALPARKER OCH LEDER  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.4, serif: false },
  });
}

// ---------------------------------------------------------------------------
// Print techniques & pop
// ---------------------------------------------------------------------------

/** Mid-century tourism: teal sea, cream land, persimmon roads with cream casings,
    E-road badges, and the full pictorial icon set — lighthouses, castles, airports. */
export function retro(): Recipe {
  return recipe('Sextiotal', 'retro', buildLayers({
    sea: { fill: '#8FC1BD' },
    bathymetry: { fill: '#79ACA7' },
    waterlines: { stroke: '#6FA39E', strokeWidthMm: 0.15 },
    hillshade: { opacity: 0.15 },
    contours: { stroke: '#B9A183', strokeWidthMm: 0.1 },
    neighbors: { fill: '#E4D9C0' },
    neBorders: { stroke: '#C9BCA0', strokeWidthMm: 0.18 },
    sweden: { fill: '#F5E9D0', stroke: '#4A4238', strokeWidthMm: 0.24 },
    parks: { fill: '#A8BF7E', opacity: 0.85 },
    lakes: { fill: '#79B0AB' },
    rivers: { stroke: '#79B0AB', strokeWidthMm: 0.3 },
    kommun: { stroke: '#C4B08C', strokeWidthMm: 0.1 },
    lan: { stroke: '#8C7B62', strokeWidthMm: 0.24 },
    roads: { shields: { on: true, fill: '#3E7A4E', text: '#F5E9D0', everyMm: 150 }, stroke: '#D95B43', strokeWidthMm: 0.5, casing: { on: true, color: '#F5E9D0', extraMm: 0.14 } },
    railways: { stroke: '#4A4238', strokeWidthMm: 0.28, dash: 'dash' },
    trails: { stroke: '#8A5A3A', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#467B76', strokeWidthMm: 0.22, dash: 'dash' },
    lighthouses: { fill: '#467B76', sizeMm: 2.6 },
    airports: { fill: '#D95B43', sizeMm: 2.8 },
    castles: { fill: '#8A5A3A', sizeMm: 2.0 },
    graticule: { stroke: '#A9BDA8', strokeWidthMm: 0.12, opacity: 0.7 },
    places: { fill: '#4A4238' },
    labels: { fill: '#4A4238', stroke: '#467B76' },
  }, ['kommun', 'graticule', 'bathymetry', 'contours', 'trails']), {
    ink: '#4A4238',
    halo: '#F5E9D0',
    title: { show: true, text: 'SVERIGE', sub: 'VÄLKOMMEN TILL  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.35, serif: false },
  });
}

/** Two-ink risograph: fluorescent pink + workhorse blue on cream. Land is a pink tint,
    water prints blue, and the parks read as the overprint purple where the inks meet. */
export function riso(): Recipe {
  return recipe('Risograf', 'riso', buildLayers({
    sea: { fill: '#FAF3E3' },
    bathymetry: { fill: '#EFE6D0' },
    waterlines: { stroke: '#2456C4', strokeWidthMm: 0.2, filters: { rings: 3 } },
    hillshade: { opacity: 0.1 },
    contours: { stroke: '#F0328C', strokeWidthMm: 0.09 },
    neighbors: { fill: '#F1E7CF' },
    neBorders: { stroke: '#E0D3B4', strokeWidthMm: 0.16 },
    sweden: { fill: '#FFC2DA' },
    parks: { fill: '#9455B8', opacity: 0.8 },
    lakes: { fill: '#2456C4' },
    rivers: { stroke: '#2456C4', strokeWidthMm: 0.28 },
    kommun: { stroke: '#FF8FC0', strokeWidthMm: 0.1 },
    lan: { stroke: '#F0328C', strokeWidthMm: 0.16, dash: 'dot' },
    roads: { shields: { on: false, fill: '#2456C4', text: '#FAF3E3', everyMm: 150 }, stroke: '#F0328C', strokeWidthMm: 0.42, filters: { classes: { motorway: true, trunk: true, primary: true, secondary: false } } },
    railways: { stroke: '#2456C4', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#F0328C', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#2456C4', strokeWidthMm: 0.16, dash: 'dash' },
    lighthouses: { fill: '#2456C4', sizeMm: 2.4 },
    airports: { fill: '#F0328C', sizeMm: 2.6 },
    castles: { fill: '#2456C4', sizeMm: 2.2 },
    graticule: { stroke: '#E8A8C8', strokeWidthMm: 0.13, opacity: 0.8 },
    places: { fill: '#1D44B8' },
    labels: { fill: '#1D44B8', stroke: '#1D44B8' },
  }, ['bathymetry', 'hillshade', 'contours', 'neBorders', 'kommun', 'lan', 'trails', 'lighthouses', 'airports', 'castles', 'graticule']), {
    ink: '#1D44B8',
    halo: '#FAF3E3',
    title: { show: true, text: 'SVERIGE', sub: 'TVÅFÄRGSTRYCK  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 13, trackingEm: 0.4, serif: false },
    legend: { show: false, xMm: 52, yMm: 682 },
    north: { show: false, xMm: 462, yMm: 585 },
  });
}

/** Etching greyscale: dense engraved linework — fine contours, dotted municipal mesh,
    rivers in two instances (grey wash under black majors). Prints on any b/w laser. */
export function mono(): Recipe {
  return recipe('Etsning', 'mono', buildLayers({
    sea: { fill: '#EFEFEC' },
    bathymetry: { fill: '#DFDFDA' },
    waterlines: { stroke: '#9A9A94', strokeWidthMm: 0.13 },
    hillshade: { opacity: 0.25 },
    contours: { stroke: '#9A9A94', strokeWidthMm: 0.07, filters: { intervalM: 200, boldEveryM: 1000 } },
    neighbors: { fill: '#F6F6F3' },
    neBorders: { stroke: '#B9B9B2', strokeWidthMm: 0.14 },
    sweden: { fill: '#FFFFFF', stroke: '#1A1A1A', strokeWidthMm: 0.25 },
    parks: { fill: '#EBEBE6', opacity: 0.9, stroke: '#8A8A84', strokeWidthMm: 0.1 },
    lakes: { fill: '#E2E2DE', stroke: '#1A1A1A', strokeWidthMm: 0.1 },
    rivers: { stroke: '#8A8A84', strokeWidthMm: 0.13, filters: { minLengthKm: 40 } },
    kommun: { stroke: '#9A9A94', strokeWidthMm: 0.1, dash: 'dot' },
    lan: { stroke: '#4A4A46', strokeWidthMm: 0.24, dash: 'dashdot' },
    roads: { shields: { on: false, fill: '#3A3A36', text: '#FFFFFF', everyMm: 150 }, stroke: '#1A1A1A', strokeWidthMm: 0.35 },
    railways: { stroke: '#1A1A1A', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#4A4A46', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#6B6B66', strokeWidthMm: 0.16, dash: 'dash' },
    lighthouses: { fill: '#4A4A46', sizeMm: 2.6 },
    airports: { fill: '#1A1A1A', sizeMm: 2.8 },
    castles: { fill: '#4A4A46', sizeMm: 2.4 },
    graticule: { stroke: '#C9C9C4', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#111111' },
    labels: { fill: '#111111', stroke: '#6B6B66', filters: { serifLabels: true } },
  }, ['bathymetry', 'trails', 'lighthouses', 'airports', 'castles'], [
    { of: 'rivers', uid: 'rivers-major', label: 'Major rivers', patch: { stroke: '#1A1A1A', strokeWidthMm: 0.28, filters: { minLengthKm: 200 } } },
  ]), {
    ink: '#111111',
    halo: '#FFFFFF',
    title: { show: true, text: 'SVERIGE', sub: 'ETSNING  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.28, serif: true },
  });
}

/** Cyanotype: white technical linework on Prussian blue — contours, graticule and
    coast rings like a developed blueprint, glowing relief. */
export function blueprint(): Recipe {
  return recipe('Cyanotype', 'blueprint', buildLayers({
    sea: { fill: '#0B2E4F' },
    bathymetry: { fill: '#071F38' },
    waterlines: { stroke: '#2E5A80', strokeWidthMm: 0.15 },
    hillshade: { opacity: 0.16, filters: { blend: 'screen' } },
    contours: { stroke: '#2E5A80', strokeWidthMm: 0.09, filters: { intervalM: 400, boldEveryM: 0 } },
    neighbors: { fill: '#0E3254' },
    neBorders: { stroke: '#2E5A80', strokeWidthMm: 0.16 },
    sweden: { fill: '#12395F', stroke: '#BCD7EA', strokeWidthMm: 0.24 },
    parks: { fill: '#16456E', opacity: 0.9 },
    lakes: { fill: '#0B2E4F' },
    rivers: { stroke: '#7FB3D5', strokeWidthMm: 0.24 },
    kommun: { stroke: '#2E5A80', strokeWidthMm: 0.1 },
    lan: { stroke: '#6E9BC0', strokeWidthMm: 0.22 },
    roads: { shields: { on: false, fill: '#1E4265', text: '#E8F1F8', everyMm: 150 }, stroke: '#E8F1F8', strokeWidthMm: 0.4 },
    railways: { stroke: '#A5C8E1', strokeWidthMm: 0.26, dash: 'dash' },
    trails: { stroke: '#8FB5D6', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#6E9BC0', strokeWidthMm: 0.18, dash: 'dash' },
    lighthouses: { fill: '#9CC3E0', sizeMm: 2.4 },
    airports: { fill: '#E8F1F8', sizeMm: 2.8 },
    castles: { fill: '#6E9BC0', sizeMm: 2.4 },
    graticule: { stroke: '#3E6E96', strokeWidthMm: 0.14, opacity: 1 },
    places: { fill: '#F0F6FB' },
    labels: { fill: '#F0F6FB', stroke: '#9CC3E0' },
  }, ['kommun', 'trails', 'airports', 'castles']), {
    ink: '#F0F6FB',
    halo: '#0B2E4F',
    title: { show: true, text: 'SVERIGE', sub: 'CYANOTYP  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.5, serif: false },
    frame: { show: true, insetMm: 12, paper: '#0B2E4F', ruleMm: 0.4, ruleColor: '#E8F1F8' },
  });
}

/** Every road, nothing else: all four classes in near-black ink on white paper —
    the country's shape emerges from the network alone. Ferries keep the islands attached. */
export function vagnat(): Recipe {
  return recipe('Vägnät', 'vagnat', buildLayers({
    sea: { fill: '#FFFFFF' },
    bathymetry: { fill: '#F4F4F2' },
    waterlines: { stroke: '#D5D5D0', strokeWidthMm: 0.12 },
    hillshade: { opacity: 0.1 },
    contours: { stroke: '#D5D5D0', strokeWidthMm: 0.08 },
    neighbors: { fill: '#FFFFFF' },
    neBorders: { stroke: '#E4E4E0', strokeWidthMm: 0.14 },
    sweden: { fill: '#FFFFFF' },
    parks: { fill: '#F4F4F2' },
    lakes: { fill: '#FFFFFF', stroke: '#D5D5D0', strokeWidthMm: 0.1 },
    rivers: { stroke: '#D5D5D0', strokeWidthMm: 0.18 },
    kommun: { stroke: '#E4E4E0', strokeWidthMm: 0.1 },
    lan: { stroke: '#C9C9C4', strokeWidthMm: 0.14 },
    roads: {
      shields: { on: false, fill: '#141414', text: '#FFFFFF', everyMm: 150 },
      stroke: '#141414', strokeWidthMm: 0.42,
      filters: { classes: { motorway: true, trunk: true, primary: true, secondary: true } },
    },
    railways: { stroke: '#8A8A84', strokeWidthMm: 0.2, dash: 'dash' },
    trails: { stroke: '#B9B9B2', strokeWidthMm: 0.18, dash: 'dot' },
    ferries: { stroke: '#9A9A94', strokeWidthMm: 0.14, dash: 'dot' },
    lighthouses: { fill: '#141414', sizeMm: 2.2 },
    airports: { fill: '#141414', sizeMm: 2.4 },
    castles: { fill: '#141414', sizeMm: 2.2 },
    graticule: { stroke: '#E4E4E0', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#141414', filters: { minPopulation: 300000 } },
    labels: {
      fill: '#141414', stroke: '#8A8A84',
      filters: { labelMinPopulation: 300000, seaLabels: false, lakeLabels: false, riverLabels: false, neighborLabels: false },
    },
  }, ['bathymetry', 'waterlines', 'hillshade', 'contours', 'neBorders', 'parks', 'rivers', 'kommun', 'lan', 'railways', 'trails', 'lighthouses', 'airports', 'castles', 'graticule', 'places', 'labels']), {
    ink: '#141414',
    halo: '#FFFFFF',
    title: { show: true, text: 'SVERIGE', sub: 'VÄGNÄT  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 15, trackingEm: 0.6, serif: false },
    legend: { show: false, xMm: 52, yMm: 682 },
    scalebar: { show: false, xMm: 412, yMm: 700 },
    north: { show: false, xMm: 462, yMm: 585 },
  });
}

/** Blågul silhouette: two colors can't carry full detail, so this one doesn't try —
    yellow Sweden on flag blue, concentric coast rings, subtle relief, the metros only. */
export function flag(): Recipe {
  return recipe('Blågul', 'flag', buildLayers({
    sea: { fill: '#006AA7' },
    bathymetry: { fill: '#00588C' },
    waterlines: { stroke: '#1E77AE', strokeWidthMm: 0.35, filters: { rings: 3 } },
    hillshade: { opacity: 0.1 },
    contours: { stroke: '#E5B800', strokeWidthMm: 0.09 },
    neighbors: { fill: '#1573AD' },
    neBorders: { stroke: '#2E81B5', strokeWidthMm: 0.16 },
    sweden: { fill: '#FECC02', stroke: '#003A63', strokeWidthMm: 0.3 },
    parks: { fill: '#EDBE00', opacity: 1 },
    lakes: { fill: '#006AA7' },
    rivers: { stroke: '#006AA7', strokeWidthMm: 0.3 },
    kommun: { stroke: '#D9AE00', strokeWidthMm: 0.1 },
    lan: { stroke: '#C79F00', strokeWidthMm: 0.2 },
    roads: { shields: { on: false, fill: '#003A63', text: '#FECC02', everyMm: 150 }, stroke: '#003A63', strokeWidthMm: 0.42, filters: { classes: { motorway: true, trunk: false, primary: false, secondary: false } } },
    railways: { stroke: '#003A63', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#003A63', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#CFE3F0', strokeWidthMm: 0.18, dash: 'dash' },
    lighthouses: { fill: '#003A63', sizeMm: 2.6 },
    airports: { fill: '#003A63', sizeMm: 2.8 },
    castles: { fill: '#003A63', sizeMm: 2.4 },
    graticule: { stroke: '#2E81B5', strokeWidthMm: 0.12, opacity: 0.8 },
    places: { fill: '#003A63', filters: { minPopulation: 300000 } },
    labels: {
      fill: '#003A63', stroke: '#CFE3F0',
      filters: { labelMinPopulation: 300000, fontScale: 1.15, seaLabels: false, lakeLabels: false, neighborLabels: false },
    },
  }, ['kommun', 'lan', 'graticule', 'parks', 'neBorders', 'rivers', 'roads', 'railways', 'bathymetry', 'contours', 'ferries', 'trails', 'lighthouses', 'airports', 'castles']), {
    ink: '#FFFFFF',
    halo: '#FECC02',
    title: { show: true, text: 'SVERIGE', sub: '{scale}', xMm: 462, yMm: 640, sizeMm: 14, trackingEm: 0.5, serif: false },
    legend: { show: false, xMm: 52, yMm: 682 },
    scalebar: { show: false, xMm: 412, yMm: 700 },
  });
}

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

/** Graphite night: the whole road web glows faintly under amber arteries —
    two road instances — with relief shimmering through a screen blend. */
export function dark(): Recipe {
  return recipe('Dark poster', 'dark', buildLayers({
    sea: { fill: '#0B0E13' },
    bathymetry: { fill: '#05070C' },
    waterlines: { stroke: '#1B2430', strokeWidthMm: 0.14, filters: { rings: 2 } },
    hillshade: { opacity: 0.22, filters: { blend: 'screen' } },
    contours: { stroke: '#232B37', strokeWidthMm: 0.09 },
    neighbors: { fill: '#12151B' },
    neBorders: { stroke: '#242A33', strokeWidthMm: 0.18 },
    sweden: { fill: '#171C24', stroke: '#3A4250', strokeWidthMm: 0.25 },
    parks: { fill: '#1E2A22', opacity: 1 },
    lakes: { fill: '#0B0E13' },
    rivers: { stroke: '#20303C', strokeWidthMm: 0.3 },
    kommun: { stroke: '#242B36', strokeWidthMm: 0.12 },
    lan: { stroke: '#3A4250', strokeWidthMm: 0.26 },
    roads: {
      label: 'Road network',
      shields: { on: false, fill: '#3E8E4F', text: '#0B0E13', everyMm: 150 },
      stroke: '#39424F', strokeWidthMm: 0.32,
      filters: { classes: { motorway: true, trunk: true, primary: true, secondary: true } },
    },
    railways: { stroke: '#7FD1D9', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#8A7048', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#4E6070', strokeWidthMm: 0.18, dash: 'dash' },
    lighthouses: { fill: '#7FD1D9', sizeMm: 2.6 },
    airports: { fill: '#E6E9EE', sizeMm: 2.8 },
    castles: { fill: '#8A7048', sizeMm: 2.4 },
    graticule: { stroke: '#26313E', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#E6E9EE' },
    labels: { fill: '#E6E9EE', stroke: '#5F7A8C' },
  }, ['kommun', 'contours', 'trails', 'lighthouses', 'airports', 'castles'], [
    { of: 'roads', uid: 'roads-arteries', label: 'Main arteries', patch: {
      stroke: '#FFB454', strokeWidthMm: 0.5,
      casing: { on: true, color: '#0B0E13', extraMm: 0.12 },
      filters: { classes: { motorway: true, trunk: true, primary: false, secondary: false } },
    } },
  ]), {
    ink: '#E6E9EE',
    halo: '#0B0E13',
    title: { show: true, text: 'SVERIGE', sub: '59.33° N  ·  18.07° E', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.5, serif: false },
  });
}

/** Polar night: near-black blues, aurora-green roads, violet rail, glowing relief,
    lighthouses blinking along the coast. */
export function aurora(): Recipe {
  return recipe('Polarnatt', 'aurora', buildLayers({
    sea: { fill: '#070B14' },
    bathymetry: { fill: '#02040A' },
    waterlines: { stroke: '#14202E', strokeWidthMm: 0.14 },
    hillshade: { opacity: 0.3, filters: { blend: 'screen' } },
    contours: { stroke: '#131C28', strokeWidthMm: 0.09 },
    neighbors: { fill: '#0A0F19' },
    neBorders: { stroke: '#1A2330', strokeWidthMm: 0.16 },
    sweden: { fill: '#0D1420', stroke: '#2A3547', strokeWidthMm: 0.24 },
    parks: { fill: '#0F271D', opacity: 1 },
    lakes: { fill: '#070B14' },
    rivers: { stroke: '#14384E', strokeWidthMm: 0.3 },
    kommun: { stroke: '#1B2634', strokeWidthMm: 0.12 },
    lan: { stroke: '#263140', strokeWidthMm: 0.24 },
    roads: { shields: { on: false, fill: '#14532D', text: '#B8F0CE', everyMm: 150 }, stroke: '#5CE6A8', strokeWidthMm: 0.4, casing: { on: true, color: '#070B14', extraMm: 0.12 } },
    railways: { stroke: '#8F7BE8', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#C9A96E', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#2E4356', strokeWidthMm: 0.18, dash: 'dash' },
    lighthouses: { fill: '#7FD1D9', sizeMm: 2.2 },
    airports: { fill: '#E7F4EC', sizeMm: 2.8 },
    castles: { fill: '#C9A96E', sizeMm: 2.4 },
    graticule: { stroke: '#17222E', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#E7F4EC' },
    labels: { fill: '#E7F4EC', stroke: '#55829B' },
  }, ['kommun', 'graticule', 'waterlines', 'contours', 'trails', 'airports', 'castles']), {
    ink: '#CFE6D8',
    halo: '#070B14',
    title: { show: true, text: 'SVERIGE', sub: 'POLARNATT  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.55, serif: false },
  });
}

/** Synthwave: magenta arteries with glow casings, cyan rail, electric rivers and a
    retro graticule grid over deep violet — the outrun poster. */
export function neon(): Recipe {
  return recipe('Neonstad', 'neon', buildLayers({
    sea: { fill: '#0E0817' },
    bathymetry: { fill: '#060310' },
    waterlines: { stroke: '#2A1750', strokeWidthMm: 0.18, filters: { rings: 3 } },
    hillshade: { opacity: 0.18, filters: { blend: 'screen' } },
    contours: { stroke: '#241040', strokeWidthMm: 0.09 },
    neighbors: { fill: '#140B20' },
    neBorders: { stroke: '#241543', strokeWidthMm: 0.16 },
    sweden: { fill: '#191028', stroke: '#5A38A8', strokeWidthMm: 0.26 },
    parks: { fill: '#122B33', opacity: 1 },
    lakes: { fill: '#0E0817' },
    rivers: { stroke: '#3D7DFF', strokeWidthMm: 0.26 },
    kommun: { stroke: '#241543', strokeWidthMm: 0.12 },
    lan: { stroke: '#452C7E', strokeWidthMm: 0.2 },
    roads: {
      shields: { on: false, fill: '#5C1046', text: '#FFD9F0', everyMm: 150 },
      stroke: '#FF3EA5', strokeWidthMm: 0.42,
      casing: { on: true, color: '#5C1046', extraMm: 0.24 },
    },
    railways: { stroke: '#29E5FF', strokeWidthMm: 0.22, dash: 'dash' },
    trails: { stroke: '#8E7BD8', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#3E4E9E', strokeWidthMm: 0.16, dash: 'dash' },
    lighthouses: { fill: '#29E5FF', sizeMm: 2.4 },
    airports: { fill: '#F5D949', sizeMm: 2.6 },
    castles: { fill: '#8E7BD8', sizeMm: 2.2 },
    graticule: { stroke: '#38206B', strokeWidthMm: 0.16, opacity: 1 },
    places: { fill: '#FFE9F7' },
    labels: { fill: '#FFE9F7', stroke: '#8E7BD8' },
  }, ['parks', 'kommun', 'contours', 'trails', 'lighthouses', 'castles']), {
    ink: '#F3E9FF',
    halo: '#0E0817',
    title: { show: true, text: 'SVERIGE', sub: 'MIDNATT  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.6, serif: false },
  });
}

export const PRESETS: Record<string, { label: string; tagline: string; build: () => Recipe }> = {
  nordic: { label: 'Nordic', tagline: 'Paper-white minimalism, falu-red arteries', build: nordic },
  pastell: { label: 'Pappersklipp', tagline: 'Cut-paper pastels — shapes only, no lines', build: pastell },
  alpine: { label: 'Fjällrelief', tagline: 'Imhof-style relief hero on warm alpine paper', build: alpine },
  kurvor: { label: 'Höjdkurvor', tagline: 'Contour-line art with burnt-orange index lines', build: kurvor },
  topo: { label: 'Topo', tagline: 'The full reference sheet — every layer on duty', build: topo },
  atlas: { label: 'Skolatlas', tagline: 'Antique school atlas, banded county borders', build: atlas },
  sjokort: { label: 'Sjökort', tagline: 'Nautical chart — depth bands, beacons, graticule', build: sjokort },
  vildmark: { label: 'Vildmark', tagline: 'The roadless map — parks and trails as heroes', build: vildmark },
  retro: { label: 'Sextiotal', tagline: 'Mid-century tourism teal & persimmon', build: retro },
  riso: { label: 'Risograf', tagline: 'Two-ink print: pink + blue overprint on cream', build: riso },
  mono: { label: 'Etsning', tagline: 'Etching greyscale — prints on any b/w laser', build: mono },
  blueprint: { label: 'Cyanotype', tagline: 'White linework on Prussian blue', build: blueprint },
  vagnat: { label: 'Vägnät', tagline: 'Every road, nothing else — ink-on-white data art', build: vagnat },
  flag: { label: 'Blågul', tagline: 'Flag duotone — lakes, relief, the three metros', build: flag },
  dark: { label: 'Dark', tagline: 'Amber arteries over a faintly glowing road web', build: dark },
  aurora: { label: 'Polarnatt', tagline: 'Polar night with aurora-green arteries', build: aurora },
  neon: { label: 'Neonstad', tagline: 'Synthwave — magenta glow on deep violet', build: neon },
};
