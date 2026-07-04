import { geoIdentity, geoPath, type GeoProjection } from 'd3-geo';
import type { Manifest, Recipe } from '../types';

export interface Projected {
  proj: GeoProjection;
  path: ReturnType<typeof geoPath>;
  /** map scale denominator (1 : N) */
  scaleDen: number;
  /** convert EPSG:3006 meters → artboard mm */
  toMm: (e: number, n: number) => [number, number];
  /** convert artboard mm → EPSG:3006 meters */
  toEN: (x: number, y: number) => [number, number];
}

export function makeProjection(manifest: Manifest, recipe: Recipe): Projected {
  const [x0, y0, x1, y1] = manifest.swedenBounds;
  const { wMm, hMm, marginMm } = recipe.paper;
  const inset = recipe.furniture.frame.show ? recipe.furniture.frame.insetMm : 0;
  const m = marginMm + inset;

  const proj = geoIdentity().reflectY(true) as unknown as GeoProjection;
  const boundsFeature = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    },
  };
  proj.fitExtent(
    [
      [m, m],
      [wMm - m, hMm - m],
    ],
    boundsFeature,
  );

  const path = geoPath(proj);
  const k = (proj as any).scale() as number; // mm per meter
  const scaleDen = 1000 / k;

  return {
    proj,
    path,
    scaleDen,
    toMm: (e, n) => proj([e, n]) as [number, number],
    toEN: (x, y) => (proj.invert ? (proj.invert([x, y]) as [number, number]) : [0, 0]),
  };
}

export function niceScaleText(scaleDen: number): string {
  const rounded = Math.round(scaleDen / 1000) * 1000;
  return `1:${rounded.toLocaleString('sv-SE').replace(/ /g, ' ')}`;
}
