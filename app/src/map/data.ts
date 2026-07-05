import { feature, mesh } from 'topojson-client';
import { useEffect, useState } from 'react';
import type { LayerEntry, Manifest, Tier } from '../types';

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
  /** interior boundary meshes for layers flagged mesh in the manifest */
  meshes: Record<string, any>;
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

function isTiered(entry: LayerEntry): boolean {
  return entry.tiered ?? entry.preview.file !== entry.print.file;
}

function wantsMesh(id: string, entry: LayerEntry): boolean {
  return entry.mesh ?? (id === 'lan' || id === 'kommun');
}

export async function loadMapData(tier: Tier): Promise<MapData> {
  const manifest = (await fetchJson('/data/manifest.json')) as Manifest;
  const fc: Record<string, FC> = {};
  const meshes: MapData['meshes'] = {};

  // The manifest is the layer inventory — nothing here is country- or layer-specific.
  await Promise.all(
    Object.entries(manifest.layers).map(async ([id, entry]) => {
      if (!entry) return;
      const file = (isTiered(entry) ? entry[tier] : entry.preview).file;
      const topo = (await fetchJson(`/data/${file}`)) as Topology;
      fc[id] = toFC(topo);
      if (wantsMesh(id, entry)) {
        meshes[id] = mesh(topo, firstObject(topo), (a: any, b: any) => a !== b);
      }
    }),
  );

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
