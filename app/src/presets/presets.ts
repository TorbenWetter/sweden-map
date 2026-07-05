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
    neighborLabels: true,
  },
};

/** bottom → top. Hillshade multiplies/screens over the area fills, so it sits above them
    (flat terrain = no-op) and below line work and labels. */
const ORDER: LayerId[] = [
  'sea', 'bathymetry', 'waterlines', 'neighbors', 'neBorders', 'sweden', 'parks', 'lakes',
  'rivers', 'hillshade', 'contours', 'kommun', 'lan', 'roads', 'railways', 'trails', 'ferries', 'graticule', 'places', 'labels',
];

function buildLayers(styles: Record<LayerId, StylePatch>, hidden: LayerId[] = []): LayerState[] {
  return ORDER.map((id) => {
    const { filters: filterPatch, ...style } = styles[id] ?? {};
    return {
      id,
      visible: !hidden.includes(id),
      opacity: 1,
      filters: { ...structuredClone(DEFAULT_FILTERS[id] ?? {}), ...filterPatch },
      ...style,
    };
  });
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

export function nordic(): Recipe {
  return recipe('Nordic minimal', 'nordic', buildLayers({
    sea: { fill: '#DDE8EE' },
    bathymetry: { fill: '#C4D6E2' },
    waterlines: { stroke: '#B9CFDC', strokeWidthMm: 0.14 },
    hillshade: { opacity: 0.15 },
    contours: { stroke: '#C3BFB4', strokeWidthMm: 0.09 },
    neighbors: { fill: '#ECEAE5' },
    neBorders: { stroke: '#D5D2C9', strokeWidthMm: 0.18 },
    sweden: { fill: '#F7F5F0', stroke: '#9AA6B2', strokeWidthMm: 0.22 },
    parks: { fill: '#DCE5D4', opacity: 0.95 },
    lakes: { fill: '#C2D8E4' },
    rivers: { stroke: '#C2D8E4', strokeWidthMm: 0.28 },
    kommun: { stroke: '#C9CED6', strokeWidthMm: 0.12 },
    lan: { stroke: '#9AA0A8', strokeWidthMm: 0.26 },
    roads: { stroke: '#B9553F', strokeWidthMm: 0.5 },
    railways: { stroke: '#2E3440', strokeWidthMm: 0.28, dash: 'dash' },
    trails: { stroke: '#B98A5A', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#8FA6B8', strokeWidthMm: 0.18, dash: 'dash' },
    graticule: { stroke: '#A9BDCB', strokeWidthMm: 0.12, opacity: 0.6 },
    places: { fill: '#2E3440' },
    labels: { fill: '#2E3440', stroke: '#6E8296' },
  }, ['kommun', 'graticule', 'waterlines', 'contours', 'trails']), {});
}

export function topo(): Recipe {
  return recipe('Classic topographic', 'topo', buildLayers({
    sea: { fill: '#A9D2E2' },
    bathymetry: { fill: '#7FB8D2' },
    waterlines: { stroke: '#7FB5C9', strokeWidthMm: 0.14 },
    hillshade: { opacity: 0.22 },
    contours: { stroke: '#B39B72', strokeWidthMm: 0.1 },
    neighbors: { fill: '#E6E3D8' },
    neBorders: { stroke: '#B9B4A4', strokeWidthMm: 0.2 },
    sweden: { fill: '#EEF0DE', stroke: '#5F6B76', strokeWidthMm: 0.25 },
    parks: { fill: '#BFD9A8', opacity: 0.9 },
    lakes: { fill: '#8FC4DA', stroke: '#5F9FBC', strokeWidthMm: 0.1 },
    rivers: { stroke: '#5F9FBC', strokeWidthMm: 0.3 },
    kommun: { stroke: '#8E9298', strokeWidthMm: 0.12, dash: 'dot' },
    lan: { stroke: '#6B6F76', strokeWidthMm: 0.3, dash: 'dashdot' },
    roads: {
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
    graticule: { stroke: '#7FA3B5', strokeWidthMm: 0.13, opacity: 0.8 },
    places: { fill: '#1A1A1A' },
    labels: { fill: '#1A1A1A', stroke: '#3E6E85' },
  }, ['waterlines', 'bathymetry', 'contours']), {
    ink: '#1A1A1A',
    halo: '#EEF0DE',
    title: { show: true, text: 'SVERIGE', sub: 'TOPOGRAFISK ÖVERSIKT  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 11.5, trackingEm: 0.3, serif: true },
  });
}

export function dark(): Recipe {
  return recipe('Dark poster', 'dark', buildLayers({
    sea: { fill: '#0B0E13' },
    bathymetry: { fill: '#05070C' },
    waterlines: { stroke: '#1B2430', strokeWidthMm: 0.14 },
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
    roads: { stroke: '#FFB454', strokeWidthMm: 0.45 },
    railways: { stroke: '#7FD1D9', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#8A7048', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#4E6070', strokeWidthMm: 0.18, dash: 'dash' },
    graticule: { stroke: '#26313E', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#E6E9EE' },
    labels: { fill: '#E6E9EE', stroke: '#5F7A8C' },
  }, ['kommun', 'waterlines', 'contours', 'trails']), {
    ink: '#E6E9EE',
    halo: '#0B0E13',
    title: { show: true, text: 'SVERIGE', sub: '59.33° N  ·  18.07° E', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.5, serif: false },
  });
}

export function vintage(): Recipe {
  return recipe('Vintage atlas', 'vintage', buildLayers({
    sea: { fill: '#C9D8D2' },
    bathymetry: { fill: '#B4C7C0' },
    waterlines: { stroke: '#87A5A1', strokeWidthMm: 0.16 },
    hillshade: { opacity: 0.18 },
    contours: { stroke: '#C0AE8E', strokeWidthMm: 0.1 },
    neighbors: { fill: '#EAE0CC' },
    neBorders: { stroke: '#B5A88C', strokeWidthMm: 0.2 },
    sweden: { fill: '#F3EAD8', stroke: '#6E5B44', strokeWidthMm: 0.28 },
    parks: { fill: '#CDD4B2', opacity: 0.9 },
    lakes: { fill: '#B7CCC9', stroke: '#87A5A1', strokeWidthMm: 0.1 },
    rivers: { stroke: '#87A5A1', strokeWidthMm: 0.3 },
    kommun: { stroke: '#BBA98C', strokeWidthMm: 0.12, dash: 'dot' },
    lan: { stroke: '#6E5B44', strokeWidthMm: 0.26, dash: 'dashdot' },
    roads: { stroke: '#A6503C', strokeWidthMm: 0.5 },
    railways: { stroke: '#3F352A', strokeWidthMm: 0.28, dash: 'dash' },
    trails: { stroke: '#8A6A45', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#75908C', strokeWidthMm: 0.2, dash: 'dash' },
    graticule: { stroke: '#9C917B', strokeWidthMm: 0.13, opacity: 0.7 },
    places: { fill: '#3F352A' },
    labels: { fill: '#3F352A', stroke: '#5E7A74' },
  }, ['kommun', 'bathymetry', 'contours', 'trails']), {
    ink: '#3F352A',
    halo: '#F3EAD8',
    title: { show: true, text: 'Sverige', sub: 'KONUNGARIKET SVERIGE  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 13, trackingEm: 0.12, serif: true },
  });
}

/** Imhof-inspired: warm alpine paper, relief as the hero, linework recedes. */
export function alpine(): Recipe {
  return recipe('Fjällrelief', 'alpine', buildLayers({
    sea: { fill: '#C9DAE3' },
    bathymetry: { fill: '#AFC8D6' },
    waterlines: { stroke: '#A9C4D2', strokeWidthMm: 0.13 },
    hillshade: { opacity: 0.5 },
    contours: { stroke: '#A08A66', strokeWidthMm: 0.1, filters: { intervalM: 400, boldEveryM: 1000 } },
    neighbors: { fill: '#E9E7DE' },
    neBorders: { stroke: '#CFCABC', strokeWidthMm: 0.16 },
    sweden: { fill: '#F1EFE4', stroke: '#8C959C', strokeWidthMm: 0.2 },
    parks: { fill: '#D8E2C6', opacity: 0.8 },
    lakes: { fill: '#A8C9DB' },
    rivers: { stroke: '#A8C9DB', strokeWidthMm: 0.3 },
    kommun: { stroke: '#C2C2BA', strokeWidthMm: 0.1 },
    lan: { stroke: '#8E8E86', strokeWidthMm: 0.18 },
    roads: { stroke: '#8C4A3C', strokeWidthMm: 0.32 },
    railways: { stroke: '#3B3F45', strokeWidthMm: 0.22, dash: 'dash' },
    trails: { stroke: '#A5522F', strokeWidthMm: 0.26, dash: 'dot' },
    ferries: { stroke: '#93AEBE', strokeWidthMm: 0.16, dash: 'dash' },
    graticule: { stroke: '#A9BDCB', strokeWidthMm: 0.12, opacity: 0.6 },
    places: { fill: '#33383E' },
    labels: { fill: '#33383E', stroke: '#587488' },
  }, ['kommun', 'graticule', 'waterlines', 'bathymetry', 'contours', 'ferries']), {
    ink: '#33383E',
    halo: '#F1EFE4',
    title: { show: true, text: 'SVERIGE', sub: 'RELIEFKARTA  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.4, serif: false },
  });
}

/** Cyanotype: white linework on Prussian blue, glowing relief, graticule on. */
export function blueprint(): Recipe {
  return recipe('Cyanotype', 'blueprint', buildLayers({
    sea: { fill: '#0B2E4F' },
    bathymetry: { fill: '#071F38' },
    waterlines: { stroke: '#2E5A80', strokeWidthMm: 0.15 },
    hillshade: { opacity: 0.16, filters: { blend: 'screen' } },
    contours: { stroke: '#1E4265', strokeWidthMm: 0.09 },
    neighbors: { fill: '#0E3254' },
    neBorders: { stroke: '#2E5A80', strokeWidthMm: 0.16 },
    sweden: { fill: '#12395F', stroke: '#BCD7EA', strokeWidthMm: 0.24 },
    parks: { fill: '#16456E', opacity: 0.9 },
    lakes: { fill: '#0B2E4F' },
    rivers: { stroke: '#7FB3D5', strokeWidthMm: 0.24 },
    kommun: { stroke: '#2E5A80', strokeWidthMm: 0.1 },
    lan: { stroke: '#6E9BC0', strokeWidthMm: 0.22 },
    roads: { stroke: '#E8F1F8', strokeWidthMm: 0.4 },
    railways: { stroke: '#A5C8E1', strokeWidthMm: 0.26, dash: 'dash' },
    trails: { stroke: '#8FB5D6', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#6E9BC0', strokeWidthMm: 0.18, dash: 'dash' },
    graticule: { stroke: '#3E6E96', strokeWidthMm: 0.14, opacity: 1 },
    places: { fill: '#F0F6FB' },
    labels: { fill: '#F0F6FB', stroke: '#9CC3E0' },
  }, ['kommun', 'contours', 'trails']), {
    ink: '#F0F6FB',
    halo: '#0B2E4F',
    title: { show: true, text: 'SVERIGE', sub: 'CYANOTYP  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.5, serif: false },
    frame: { show: true, insetMm: 12, paper: '#0B2E4F', ruleMm: 0.4, ruleColor: '#E8F1F8' },
  });
}

/** Polar night: near-black blues, aurora-green roads, violet rail, glowing relief. */
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
    roads: { stroke: '#5CE6A8', strokeWidthMm: 0.4, casing: { on: true, color: '#070B14', extraMm: 0.12 } },
    railways: { stroke: '#8F7BE8', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#C9A96E', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#2E4356', strokeWidthMm: 0.18, dash: 'dash' },
    graticule: { stroke: '#17222E', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#E7F4EC' },
    labels: { fill: '#E7F4EC', stroke: '#55829B' },
  }, ['kommun', 'graticule', 'waterlines', 'contours', 'trails']), {
    ink: '#CFE6D8',
    halo: '#070B14',
    title: { show: true, text: 'SVERIGE', sub: 'POLARNATT  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.55, serif: false },
  });
}

/** Blågul silhouette: two colors can't carry full detail, so this one doesn't try —
    yellow Sweden on flag blue, lake speckle, subtle relief, only the two metros. */
export function flag(): Recipe {
  return recipe('Blågul', 'flag', buildLayers({
    sea: { fill: '#006AA7' },
    bathymetry: { fill: '#00588C' },
    waterlines: { stroke: '#1573AD', strokeWidthMm: 0.15 },
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
    roads: { stroke: '#003A63', strokeWidthMm: 0.42, filters: { classes: { motorway: true, trunk: false, primary: false, secondary: false } } },
    railways: { stroke: '#003A63', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#003A63', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#CFE3F0', strokeWidthMm: 0.18, dash: 'dash' },
    graticule: { stroke: '#2E81B5', strokeWidthMm: 0.12, opacity: 0.8 },
    places: { fill: '#003A63', filters: { minPopulation: 300000 } },
    labels: {
      fill: '#003A63', stroke: '#CFE3F0',
      filters: { labelMinPopulation: 300000, fontScale: 1.15, seaLabels: false, lakeLabels: false, neighborLabels: false },
    },
  }, ['kommun', 'lan', 'graticule', 'parks', 'neBorders', 'rivers', 'roads', 'railways', 'waterlines', 'bathymetry', 'contours', 'ferries', 'trails']), {
    ink: '#FFFFFF',
    halo: '#FECC02',
    title: { show: true, text: 'SVERIGE', sub: '{scale}', xMm: 462, yMm: 640, sizeMm: 14, trackingEm: 0.5, serif: false },
    legend: { show: false, xMm: 52, yMm: 682 },
    scalebar: { show: false, xMm: 412, yMm: 700 },
  });
}

/** Etching greyscale: pure linework and grey tones — prints beautifully in b/w. */
export function mono(): Recipe {
  return recipe('Etsning', 'mono', buildLayers({
    sea: { fill: '#EFEFEC' },
    bathymetry: { fill: '#DFDFDA' },
    waterlines: { stroke: '#9A9A94', strokeWidthMm: 0.13 },
    hillshade: { opacity: 0.25 },
    contours: { stroke: '#8A8A84', strokeWidthMm: 0.08, filters: { intervalM: 400, boldEveryM: 1000 } },
    neighbors: { fill: '#F6F6F3' },
    neBorders: { stroke: '#B9B9B2', strokeWidthMm: 0.14 },
    sweden: { fill: '#FFFFFF', stroke: '#1A1A1A', strokeWidthMm: 0.25 },
    parks: { fill: '#EBEBE6', opacity: 0.9, stroke: '#8A8A84', strokeWidthMm: 0.1 },
    lakes: { fill: '#E2E2DE', stroke: '#1A1A1A', strokeWidthMm: 0.1 },
    rivers: { stroke: '#6B6B66', strokeWidthMm: 0.22 },
    kommun: { stroke: '#9A9A94', strokeWidthMm: 0.1, dash: 'dot' },
    lan: { stroke: '#4A4A46', strokeWidthMm: 0.24, dash: 'dashdot' },
    roads: { stroke: '#1A1A1A', strokeWidthMm: 0.35 },
    railways: { stroke: '#1A1A1A', strokeWidthMm: 0.24, dash: 'dash' },
    trails: { stroke: '#4A4A46', strokeWidthMm: 0.2, dash: 'dot' },
    ferries: { stroke: '#6B6B66', strokeWidthMm: 0.16, dash: 'dash' },
    graticule: { stroke: '#C9C9C4', strokeWidthMm: 0.12, opacity: 1 },
    places: { fill: '#111111' },
    labels: { fill: '#111111', stroke: '#6B6B66' },
  }, ['kommun', 'bathymetry', 'contours', 'trails']), {
    ink: '#111111',
    halo: '#FFFFFF',
    title: { show: true, text: 'SVERIGE', sub: 'ETSNING  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12, trackingEm: 0.28, serif: true },
  });
}

/** Mid-century tourism: retro teal sea, cream land, persimmon roads, avocado parks. */
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
    roads: { stroke: '#D95B43', strokeWidthMm: 0.5, casing: { on: true, color: '#F5E9D0', extraMm: 0.14 } },
    railways: { stroke: '#4A4238', strokeWidthMm: 0.28, dash: 'dash' },
    trails: { stroke: '#8A5A3A', strokeWidthMm: 0.22, dash: 'dot' },
    ferries: { stroke: '#467B76', strokeWidthMm: 0.2, dash: 'dash' },
    graticule: { stroke: '#A9BDA8', strokeWidthMm: 0.12, opacity: 0.7 },
    places: { fill: '#4A4238' },
    labels: { fill: '#4A4238', stroke: '#467B76' },
  }, ['kommun', 'graticule', 'bathymetry', 'contours', 'trails']), {
    ink: '#4A4238',
    halo: '#F5E9D0',
    title: { show: true, text: 'SVERIGE', sub: 'VÄLKOMMEN TILL  ·  {scale}', xMm: 462, yMm: 640, sizeMm: 12.5, trackingEm: 0.35, serif: false },
  });
}

export const PRESETS: Record<string, { label: string; tagline: string; build: () => Recipe }> = {
  nordic: { label: 'Nordic', tagline: 'Paper-white minimalism, falu-red arteries', build: nordic },
  alpine: { label: 'Fjällrelief', tagline: 'Imhof-style relief hero on warm alpine paper', build: alpine },
  topo: { label: 'Topo', tagline: 'Reference-sheet classic, confident blues', build: topo },
  vintage: { label: 'Vintage', tagline: 'Aged atlas plate, sepia ink', build: vintage },
  mono: { label: 'Etsning', tagline: 'Etching greyscale — prints on any b/w laser', build: mono },
  retro: { label: 'Sextiotal', tagline: 'Mid-century tourism teal & persimmon', build: retro },
  dark: { label: 'Dark', tagline: 'Graphite night, amber glow, relief shimmer', build: dark },
  aurora: { label: 'Polarnatt', tagline: 'Polar night with aurora-green arteries', build: aurora },
  blueprint: { label: 'Cyanotype', tagline: 'White linework on Prussian blue', build: blueprint },
  flag: { label: 'Blågul', tagline: 'Flag silhouette — lakes, relief, the three metros', build: flag },
};
