import { feature, mesh } from 'topojson-client';
import { useEffect, useState } from 'react';
import type { Manifest, Tier } from '../types';

type Topology = any;
type GeometryCollection = any;

export interface FC {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, any>;
    geometry: any;
  }>;
}

export interface MapData {
  manifest: Manifest;
  /** per layer id: FeatureCollection */
  fc: Record<string, FC>;
  /** interior boundary meshes for admin layers */
  meshes: { lan?: any; kommun?: any };
  tier: Tier;
}

const fetchCache = new Map<string, Promise<any>>();

function fetchJson(url: string): Promise<any> {
  let p = fetchCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
    fetchCache.set(url, p);
  }
  return p;
}

function firstObject(topo: Topology): GeometryCollection {
  const key = Object.keys(topo.objects)[0];
  return topo.objects[key] as GeometryCollection;
}

function toFC(topo: Topology): FC {
  return feature(topo, firstObject(topo)) as unknown as FC;
}

/** Layers that exist at a single tier only. */
const SINGLE_TIER: Record<string, string> = {
  places: 'places.json',
  graticule: 'graticule.json',
  neBorders: 'ne-borders.json',
  seaLabels: 'sea-labels.json',
  neighborPlaces: 'neighbor-places.json',
};

const TIERED = ['sweden', 'neighbors', 'lan', 'kommun', 'lakes', 'rivers', 'roads', 'railways', 'parks'];

export async function loadMapData(tier: Tier): Promise<MapData> {
  const manifest = (await fetchJson('/data/manifest.json')) as Manifest;
  const fc: Record<string, FC> = {};
  const meshes: MapData['meshes'] = {};

  await Promise.all([
    ...TIERED.map(async (id) => {
      if (!manifest.layers[id]?.[tier]) return;
      const topo = (await fetchJson(`/data/${id}.${tier}.json`)) as Topology;
      fc[id] = toFC(topo);
      if (id === 'lan' || id === 'kommun') {
        meshes[id] = mesh(topo, firstObject(topo), (a, b) => a !== b);
      }
    }),
    ...Object.entries(SINGLE_TIER).map(async ([id, file]) => {
      if (!manifest.layers[id]) return;
      const topo = (await fetchJson(`/data/${file}`)) as Topology;
      fc[id] = toFC(topo);
    }),
  ]);

  return { manifest, fc, meshes, tier };
}

export function useMapData(tier: Tier): { data: MapData | null; error: string | null } {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMapData(tier)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [tier]);

  return { data, error };
}
