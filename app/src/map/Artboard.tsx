import { useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MapData } from './data';
import { niceScaleText, type Projected } from './projection';
import type { LabelLayout, PlacedLabel } from './labels';
import { cityDotMm } from './labels';
import { ROAD_CLASSES, ROAD_WIDTH_FACTOR, type Dash, type LayerId, type LayerState, type Recipe } from '../types';

export interface ArtboardInteractive {
  selected: LayerId | null;
  labelEdit: boolean;
  onSelectLayer: (id: LayerId) => void;
  onLabelPointerDown: (e: ReactPointerEvent, label: PlacedLabel) => void;
}

export interface ArtboardProps {
  recipe: Recipe;
  data: MapData;
  projected: Projected;
  layout: LabelLayout;
  /** per-variant image URLs (or data URLs at export); Artboard picks by the layer's blend */
  hillshade: Record<'dark' | 'light', string> | null;
  interactive?: ArtboardInteractive;
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = a.match(/^#(..)(..)(..)$/i);
  const pb = b.match(/^#(..)(..)(..)$/i);
  if (!pa || !pb) return b;
  const mix = (i: number) =>
    Math.round(parseInt(pa[i], 16) + (parseInt(pb[i], 16) - parseInt(pa[i], 16)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(1)}${mix(2)}${mix(3)}`;
}

function dashArray(dash: Dash | undefined, w: number): string | undefined {
  switch (dash) {
    case 'dash': return '1.9 1.15';
    case 'dot': return `0.01 ${Math.max(0.9, w * 2.6)}`;
    case 'dashdot': return '2.1 0.95 0.01 0.95';
    default: return undefined;
  }
}

const SERIF_STACK = "'Iowan Old Style', 'Palatino', 'Georgia', serif";

/** Icon glyphs in a 10×10 box centered on 0,0; scaled by sizeMm/10 at render. */
const ICON_GLYPHS: Record<string, { fill: string; stroke?: string }> = {
  lighthouses: {
    // tower + lamp, with light rays as stroke
    fill: 'M -1.7 5 L -0.95 -2.1 L 0.95 -2.1 L 1.7 5 Z M 0 -4.4 m -0.95 0 a 0.95 0.95 0 1 0 1.9 0 a 0.95 0.95 0 1 0 -1.9 0',
    stroke: 'M -3.9 -4.4 L -2.1 -4.4 M 2.1 -4.4 L 3.9 -4.4 M -3.3 -6.3 L -1.9 -5.5 M 3.3 -6.3 L 1.9 -5.5',
  },
  airports: {
    fill: 'M 0 -4.4 L 0.85 -1.2 L 4.2 0.7 L 4.2 1.7 L 0.75 0.75 L 0.6 3.1 L 1.95 4.1 L 1.95 4.9 L 0 4.4 L -1.95 4.9 L -1.95 4.1 L -0.6 3.1 L -0.75 0.75 L -4.2 1.7 L -4.2 0.7 L -0.85 -1.2 Z',
  },
  castles: {
    fill: 'M -2.9 5 L -2.9 -2.4 L -2.9 -4.4 L -1.7 -4.4 L -1.7 -3.2 L -0.6 -3.2 L -0.6 -4.4 L 0.6 -4.4 L 0.6 -3.2 L 1.7 -3.2 L 1.7 -4.4 L 2.9 -4.4 L 2.9 5 Z',
  },
};

export function Artboard({ recipe, data, projected, layout, hillshade, interactive }: ArtboardProps) {
  const { path, toMm } = projected;
  const { wMm, hMm } = recipe.paper;
  const fr = recipe.furniture.frame;
  const inset = fr.show ? fr.insetMm : 0;
  const clipX = inset;
  const clipW = wMm - inset * 2;
  const clipH = hMm - inset * 2;

  const layerMap = useMemo(
    () => Object.fromEntries(recipe.layers.map((l) => [l.id, l])) as Record<LayerId, LayerState>,
    [recipe.layers],
  );

  // ---- memoized path strings ----
  const dSweden = useMemo(() => (data.fc.sweden ? path(data.fc.sweden as any) ?? '' : ''), [data, path]);
  const dNeighbors = useMemo(() => (data.fc.neighbors ? path(data.fc.neighbors as any) ?? '' : ''), [data, path]);
  const dNeBorders = useMemo(() => (data.fc.neBorders ? path(data.fc.neBorders as any) ?? '' : ''), [data, path]);
  const dGraticule = useMemo(() => (data.fc.graticule ? path(data.fc.graticule as any) ?? '' : ''), [data, path]);
  const dBathyClasses = useMemo(() => {
    if (!data.fc.bathymetry) return [] as Array<{ depth: number; d: string }>;
    return data.fc.bathymetry.features
      .map((f) => ({ depth: f.properties.depth as number, d: path(f as any) ?? '' }))
      .filter((c) => c.d)
      .sort((a, b) => a.depth - b.depth);
  }, [data, path]);

  const contourInterval = layerMap.contours?.filters.intervalM ?? 400;
  const contourBold = layerMap.contours?.filters.boldEveryM ?? 0;
  const dContours = useMemo(() => {
    if (!data.fc.contours) return { normal: '', bold: '' };
    const iv = Math.max(200, contourInterval);
    const feats = data.fc.contours.features.filter((f) => f.properties.elev % iv === 0);
    const normal = path({ type: 'FeatureCollection', features: feats } as any) ?? '';
    let bold = '';
    if (contourBold > 0) {
      const bf = feats.filter((f) => f.properties.elev % contourBold === 0);
      bold = bf.length ? path({ type: 'FeatureCollection', features: bf } as any) ?? '' : '';
    }
    return { normal, bold };
  }, [data, path, contourInterval, contourBold]);

  const dWaterlineRings = useMemo(() => {
    if (!data.fc.waterlines) return [] as string[];
    return [1, 2, 3, 4].map((ring) => {
      const feats = data.fc.waterlines.features.filter((f) => f.properties.ring === ring);
      return feats.length ? path({ type: 'FeatureCollection', features: feats } as any) ?? '' : '';
    });
  }, [data, path]);
  const dLan = useMemo(() => (data.meshes.lan ? path(data.meshes.lan) ?? '' : ''), [data, path]);
  const dKommun = useMemo(() => (data.meshes.kommun ? path(data.meshes.kommun) ?? '' : ''), [data, path]);

  const lakesMin = layerMap.lakes?.filters.minAreaKm2 ?? 0;
  const dLakes = useMemo(() => {
    if (!data.fc.lakes) return '';
    const feats = data.fc.lakes.features.filter((f) => (f.properties.area_km2 ?? 0) >= lakesMin);
    return path({ type: 'FeatureCollection', features: feats } as any) ?? '';
  }, [data, path, lakesMin]);

  const trailNetworks = layerMap.trails?.filters.networks;
  const trailsMin = layerMap.trails?.filters.minLengthKm ?? 0;
  const dTrails = useMemo(() => {
    if (!data.fc.trails) return '';
    const feats = data.fc.trails.features.filter(
      (f) => (trailNetworks?.[f.properties.network] ?? true) && (f.properties.length_km ?? 0) >= trailsMin,
    );
    return path({ type: 'FeatureCollection', features: feats } as any) ?? '';
  }, [data, path, trailNetworks, trailsMin]);

  const ferriesMin = layerMap.ferries?.filters.minLengthKm ?? 0;
  const dFerries = useMemo(() => {
    if (!data.fc.ferries) return '';
    const feats = data.fc.ferries.features.filter((f) => (f.properties.length_km ?? 0) >= ferriesMin);
    return path({ type: 'FeatureCollection', features: feats } as any) ?? '';
  }, [data, path, ferriesMin]);

  const riversMin = layerMap.rivers?.filters.minLengthKm ?? 0;
  const dRivers = useMemo(() => {
    if (!data.fc.rivers) return '';
    const feats = data.fc.rivers.features.filter((f) => (f.properties.length_km ?? 0) >= riversMin);
    return path({ type: 'FeatureCollection', features: feats } as any) ?? '';
  }, [data, path, riversMin]);

  const parkKinds = layerMap.parks?.filters.kinds;
  const dParks = useMemo(() => {
    if (!data.fc.parks) return '';
    const feats = data.fc.parks.features.filter((f) => parkKinds?.[f.properties.kind] !== false);
    return path({ type: 'FeatureCollection', features: feats } as any) ?? '';
  }, [data, path, parkKinds]);

  const dRoadsByClass = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of data.fc.roads?.features ?? []) {
      map[f.properties.class] = path(f as any) ?? '';
    }
    return map;
  }, [data, path]);

  const dRailByUsage = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of data.fc.railways?.features ?? []) {
      map[f.properties.usage] = path(f as any) ?? '';
    }
    return map;
  }, [data, path]);

  const cityDots = useMemo(() => {
    const minPop = layerMap.places?.filters.minPopulation ?? 0;
    const priority = new Set(data.manifest.placePriority ?? []);
    return (data.fc.places?.features ?? [])
      .filter((f) => (f.properties.population ?? 0) >= minPop || priority.has(f.properties.name))
      .map((f) => {
        const [x, y] = toMm(f.geometry.coordinates[0], f.geometry.coordinates[1]);
        return { x, y, pop: f.properties.population ?? 0, name: f.properties.name as string, capital: f.properties.capital === 'yes' };
      })
      .filter((c) => c.x > inset && c.x < wMm - inset && c.y > inset && c.y < hMm - inset);
  }, [data, toMm, layerMap.places?.filters.minPopulation, inset, wMm, hMm]);

  const neighborDots = useMemo(() =>
    (data.fc.neighborPlaces?.features ?? []).map((f) => {
      const [x, y] = toMm(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      return { x, y, name: f.properties.name as string };
    }).filter((c) => c.x > inset && c.x < wMm - inset && c.y > inset && c.y < hMm - inset),
  [data, toMm, inset, wMm, hMm]);

  const click = (id: LayerId) =>
    interactive
      ? {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            interactive.onSelectLayer(id);
          },
          style: { cursor: 'pointer' } as React.CSSProperties,
        }
      : {};

  const renderLayer = (l: LayerState) => {
    if (!l.visible) return null;
    const common = { key: l.id, opacity: l.opacity === 1 ? undefined : l.opacity };
    switch (l.id) {
      case 'sea':
        return <rect {...common} data-testid="sea" x={clipX} y={clipX} width={clipW} height={clipH} fill={l.fill} {...click('sea')} />;
      case 'bathymetry': {
        const seaFill = layerMap.sea?.fill ?? '#DDE8EE';
        const deep = l.fill ?? seaFill;
        const n = dBathyClasses.length;
        return (
          <g {...common} key={l.id} {...click('bathymetry')}>
            {dBathyClasses.map((c, idx) => (
              <path key={c.depth} d={c.d} fill={lerpHex(seaFill, deep, (idx + 1) / Math.max(n, 1))} stroke="none" />
            ))}
          </g>
        );
      }
      case 'contours':
        return (
          <g {...common} key={l.id} {...click('contours')}>
            {dContours.normal ? (
              <path d={dContours.normal} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidthMm ?? 0.09} strokeLinejoin="round" />
            ) : null}
            {dContours.bold ? (
              <path d={dContours.bold} fill="none" stroke={l.stroke} strokeWidth={(l.strokeWidthMm ?? 0.09) * 2} strokeLinejoin="round" />
            ) : null}
          </g>
        );
      case 'waterlines': {
        const rings = Math.max(1, Math.min(4, l.filters.rings ?? 4));
        const ringOpacity = [0.6, 0.42, 0.28, 0.16];
        return (
          <g {...common} key={l.id} {...click('waterlines')}>
            {dWaterlineRings.map((d, idx) =>
              idx < rings && d ? (
                <path
                  key={idx}
                  d={d}
                  fill="none"
                  stroke={l.stroke}
                  strokeWidth={l.strokeWidthMm ?? 0.14}
                  opacity={ringOpacity[idx]}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
          </g>
        );
      }
      case 'hillshade': {
        if (!hillshade || !data.manifest.hillshade) return null;
        const b = data.manifest.hillshade.bounds;
        const [x0, y0] = toMm(b.xmin, b.ymax);
        const [x1, y1] = toMm(b.xmax, b.ymin);
        // blend math + land clip are baked into the alpha PNGs: dark composites like
        // multiply, light like screen — a plain image stays on the GPU fast path
        const href = (l.filters.blend ?? 'multiply') === 'screen' ? hillshade.light : hillshade.dark;
        return (
          <image
            {...common}
            key={l.id}
            href={href}
            x={x0}
            y={y0}
            width={x1 - x0}
            height={y1 - y0}
            preserveAspectRatio="none"
          />
        );
      }
      case 'neighbors':
        return <path {...common} d={dNeighbors} fill={l.fill} stroke="none" {...click('neighbors')} />;
      case 'neBorders':
        return <path {...common} d={dNeBorders} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidthMm} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashArray(l.dash, l.strokeWidthMm ?? 0.2)} />;
      case 'sweden':
        return <path {...common} d={dSweden} fill={l.fill} stroke={l.stroke} strokeWidth={l.strokeWidthMm} strokeLinejoin="round" {...click('sweden')} />;
      case 'parks':
        return <path {...common} d={dParks} fill={l.fill} stroke={l.stroke} strokeWidth={l.strokeWidthMm} {...click('parks')} />;
      case 'lakes':
        return <path {...common} d={dLakes} fill={l.fill} stroke={l.stroke} strokeWidth={l.strokeWidthMm} {...click('lakes')} />;
      case 'rivers':
        return <path {...common} d={dRivers} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidthMm} strokeLinecap="round" strokeLinejoin="round" {...click('rivers')} />;
      case 'kommun':
        return (
          <g {...common} key={l.id} clipPath={dSweden ? 'url(#sweden-clip)' : undefined}>
            <path d={dKommun} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidthMm} strokeLinejoin="round" strokeDasharray={dashArray(l.dash, l.strokeWidthMm ?? 0.12)} strokeLinecap={l.dash === 'dot' || l.dash === 'dashdot' ? 'round' : undefined} />
          </g>
        );
      case 'lan':
        return (
          <g {...common} key={l.id} clipPath={dSweden ? 'url(#sweden-clip)' : undefined}>
            <path d={dLan} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidthMm} strokeLinejoin="round" strokeDasharray={dashArray(l.dash, l.strokeWidthMm ?? 0.26)} strokeLinecap={l.dash === 'dot' || l.dash === 'dashdot' ? 'round' : undefined} />
          </g>
        );
      case 'roads': {
        const order = [...ROAD_CLASSES].reverse(); // minor first, motorway on top
        const enabled = order.filter((cls) => l.filters.classes?.[cls] && dRoadsByClass[cls]);
        const widthOf = (cls: string) =>
          l.classStyles?.[cls]?.strokeWidthMm ?? (l.strokeWidthMm ?? 0.5) * ROAD_WIDTH_FACTOR[cls];
        const colorOf = (cls: string) => l.classStyles?.[cls]?.stroke ?? l.stroke;
        const casing = l.casing;
        return (
          <g {...common} key={l.id} {...click('roads')}>
            {casing?.on
              ? enabled.map((cls) => (
                  <path
                    key={`casing-${cls}`}
                    d={dRoadsByClass[cls]}
                    fill="none"
                    stroke={casing.color}
                    strokeWidth={widthOf(cls) + casing.extraMm * 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))
              : null}
            {enabled.map((cls) => (
              <path
                key={cls}
                d={dRoadsByClass[cls]}
                fill="none"
                stroke={colorOf(cls)}
                strokeWidth={widthOf(cls)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      }
      case 'railways':
        return (
          <g {...common} key={l.id} {...click('railways')}>
            {['main', 'branch'].map((usage) =>
              l.filters.usages?.[usage] && dRailByUsage[usage] ? (
                <path
                  key={usage}
                  d={dRailByUsage[usage]}
                  fill="none"
                  stroke={l.stroke}
                  strokeWidth={(l.strokeWidthMm ?? 0.28) * (usage === 'branch' ? 0.75 : 1)}
                  strokeLinejoin="round"
                  strokeDasharray={dashArray(l.dash, l.strokeWidthMm ?? 0.28)}
                />
              ) : null,
            )}
          </g>
        );
      case 'trails':
        return (
          <path
            {...common}
            d={dTrails}
            fill="none"
            stroke={l.stroke}
            strokeWidth={l.strokeWidthMm}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray(l.dash ?? 'dot', l.strokeWidthMm ?? 0.22)}
            {...click('trails')}
          />
        );
      case 'ferries':
        return (
          <path
            {...common}
            d={dFerries}
            fill="none"
            stroke={l.stroke}
            strokeWidth={l.strokeWidthMm}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray(l.dash ?? 'dash', l.strokeWidthMm ?? 0.18)}
            {...click('ferries')}
          />
        );
      case 'lighthouses':
      case 'airports':
      case 'castles': {
        const glyph = ICON_GLYPHS[l.id];
        const feats = data.fc[l.id]?.features ?? [];
        const scale = (l.sizeMm ?? 2.6) / 10;
        const halo = recipe.furniture.halo;
        return (
          <g {...common} key={l.id} {...click(l.id)}>
            {feats.map((f, i) => {
              const [x, y] = toMm(f.geometry.coordinates[0], f.geometry.coordinates[1]);
              if (x < inset || x > wMm - inset || y < inset || y > hMm - inset) return null;
              return (
                <g key={i} transform={`translate(${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}) scale(${scale})`}>
                  <path d={glyph.fill} fill={l.fill} stroke={halo} strokeWidth={0.9} paintOrder="stroke" strokeLinejoin="round" />
                  {glyph.stroke ? (
                    <path d={glyph.stroke} fill="none" stroke={l.fill} strokeWidth={0.8} strokeLinecap="round" />
                  ) : null}
                </g>
              );
            })}
          </g>
        );
      }
      case 'graticule':
        return <path {...common} d={dGraticule} fill="none" stroke={l.stroke} strokeWidth={l.strokeWidthMm} strokeDasharray={dashArray(l.dash, l.strokeWidthMm ?? 0.12)} />;
      case 'places':
        return (
          <g {...common} key={l.id} {...click('places')}>
            {cityDots.map((c) => {
              const r = cityDotMm(c.pop);
              return (
                <g key={`${c.name}${c.x.toFixed(1)}`}>
                  {c.capital ? (
                    <circle cx={c.x} cy={c.y} r={r + 0.55} fill="none" stroke={l.fill} strokeWidth={0.28} />
                  ) : null}
                  <circle cx={c.x} cy={c.y} r={r} fill={l.fill} />
                </g>
              );
            })}
            {(layerMap.labels?.filters.neighborLabels ?? true)
              ? neighborDots.map((c) => (
                  <circle key={c.name} cx={c.x} cy={c.y} r={0.55} fill={l.fill} opacity={0.55} />
                ))
              : null}
          </g>
        );
      case 'labels': {
        const halo = recipe.furniture.halo;
        return (
          <g {...common} key={l.id}>
            {layout.labels.map((lab, i) => {
              const waterish = lab.kind === 'sea' || lab.kind === 'lake' || lab.kind === 'river';
              const fill = waterish ? l.stroke : l.fill;
              const dist = Math.hypot(lab.x - lab.baseX, lab.y - lab.baseY);
              const labelEditStyle = interactive?.labelEdit
                ? ({ cursor: 'grab', userSelect: 'none' } as React.CSSProperties)
                : ({ userSelect: 'none' } as React.CSSProperties);
              const onDown = interactive?.labelEdit
                ? (e: React.PointerEvent) => interactive.onLabelPointerDown(e, lab)
                : undefined;

              if (lab.pathD) {
                // curved label: text flows on its own path; overrides shift the whole group
                const pid = `lblp-${i}`;
                const dx = lab.x - lab.baseX;
                const dy = lab.y - lab.baseY;
                return (
                  <g key={lab.id} transform={dx || dy ? `translate(${dx} ${dy})` : undefined}>
                    <defs>
                      <path id={pid} d={lab.pathD} fill="none" />
                    </defs>
                    <text
                      fontSize={lab.sizeMm}
                      fontWeight={lab.weight}
                      fontStyle={lab.italic ? 'italic' : undefined}
                      letterSpacing={lab.trackingMm ? `${lab.trackingMm}` : undefined}
                      fill={fill}
                      stroke={lab.kind === 'river' ? halo : undefined}
                      strokeWidth={lab.kind === 'river' ? 0.28 : undefined}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      style={labelEditStyle}
                      onPointerDown={onDown}
                    >
                      <textPath href={`#${pid}`} xlinkHref={`#${pid}`} startOffset="50%" textAnchor="middle">
                        {lab.text}
                      </textPath>
                    </text>
                  </g>
                );
              }

              return (
                <g key={lab.id}>
                  {lab.kind === 'city' && lab.overridden && dist > 6 ? (
                    <line x1={lab.baseX} y1={lab.baseY} x2={lab.x} y2={lab.y - lab.sizeMm * 0.3} stroke={l.fill} strokeWidth={0.1} opacity={0.5} />
                  ) : null}
                  <text
                    x={lab.x}
                    y={lab.y}
                    textAnchor={lab.anchor}
                    fontSize={lab.sizeMm}
                    fontWeight={lab.weight}
                    fontStyle={lab.italic ? 'italic' : undefined}
                    letterSpacing={lab.trackingMm ? `${lab.trackingMm}` : undefined}
                    fill={fill}
                    opacity={lab.kind === 'neighbor' ? 0.62 : undefined}
                    stroke={waterish ? undefined : halo}
                    strokeWidth={waterish ? undefined : 0.32}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    style={labelEditStyle}
                    onPointerDown={onDown}
                  >
                    {lab.text}
                  </text>
                </g>
              );
            })}
          </g>
        );
      }
      default:
        return null;
    }
  };

  // ---- furniture ----
  const fu = recipe.furniture;
  const legendItems = useMemo(() => {
    const items: Array<{ kind: 'line' | 'dash' | 'rect' | 'dot' | 'icon'; color: string; w?: number; label: string; dash?: Dash; icon?: string }> = [];
    const L = layerMap;
    const t = (key: string, fallback: string) => data.manifest.legendLabels?.[key] ?? fallback;
    if (L.roads?.visible) items.push({ kind: 'line', color: L.roads.stroke ?? '#000', w: L.roads.strokeWidthMm, label: t('roads', 'Major road') });
    if (L.railways?.visible) items.push({ kind: 'dash', color: L.railways.stroke ?? '#000', w: L.railways.strokeWidthMm, label: t('railways', 'Railway'), dash: L.railways.dash });
    if (L.ferries?.visible) items.push({ kind: 'dash', color: L.ferries.stroke ?? '#789', w: L.ferries.strokeWidthMm, label: t('ferries', 'Ferry'), dash: L.ferries.dash ?? 'dash' });
    if (L.trails?.visible) items.push({ kind: 'dash', color: L.trails.stroke ?? '#a52', w: L.trails.strokeWidthMm, label: t('trails', 'Trail'), dash: L.trails.dash ?? 'dot' });
    if (L.lakes?.visible) items.push({ kind: 'rect', color: L.lakes.fill ?? '#9cf', label: t('lakes', 'Lake') });
    if (L.parks?.visible) items.push({ kind: 'rect', color: L.parks.fill ?? '#cfc', label: t('parks', 'National park') });
    if (L.lan?.visible) items.push({ kind: 'line', color: L.lan.stroke ?? '#888', w: L.lan.strokeWidthMm, label: t('lan', 'Region border'), dash: L.lan.dash });
    if (L.kommun?.visible) items.push({ kind: 'line', color: L.kommun.stroke ?? '#aaa', w: L.kommun.strokeWidthMm, label: t('kommun', 'Municipality border'), dash: L.kommun.dash });
    if (L.places?.visible) items.push({ kind: 'dot', color: L.places.fill ?? '#000', label: t('places', 'Town') });
    const iconFallback = { lighthouses: 'Lighthouse', airports: 'Airport', castles: 'Castle' } as const;
    for (const iconId of ['lighthouses', 'airports', 'castles'] as const) {
      if (L[iconId]?.visible) {
        items.push({ kind: 'icon', color: L[iconId].fill ?? '#333', label: t(iconId, iconFallback[iconId]), icon: iconId });
      }
    }
    return items;
  }, [layerMap, data.manifest.legendLabels]);

  const scalebar = useMemo(() => {
    const target = 45; // mm
    const kmCandidates = [10, 20, 25, 50, 100, 150, 200, 250, 300];
    const kmAt = (projected.scaleDen * target) / 1e6;
    const km = kmCandidates.reduce((best, c) => (Math.abs(c - kmAt) < Math.abs(best - kmAt) ? c : best), kmCandidates[0]);
    const mm = (km * 1e6) / projected.scaleDen;
    return { km, mm };
  }, [projected.scaleDen]);

  return (
    <g fontFamily="Inter, 'Helvetica Neue', sans-serif" data-testid="artboard">
      <defs>
        <clipPath id="paper-clip">
          <rect x={clipX} y={clipX} width={clipW} height={clipH} />
        </clipPath>
        {dSweden ? (
          // admin meshes include maritime boundary segments — clip them to the landmass
          <clipPath id="sweden-clip">
            <path d={dSweden} />
          </clipPath>
        ) : null}
      </defs>

      {fr.show ? <rect x={0} y={0} width={wMm} height={hMm} fill={fr.paper} /> : null}

      <g clipPath="url(#paper-clip)">{recipe.layers.map(renderLayer)}</g>

      {fr.show ? (
        <rect x={inset} y={inset} width={wMm - inset * 2} height={hMm - inset * 2} fill="none" stroke={fr.ruleColor} strokeWidth={fr.ruleMm} />
      ) : null}

      {fu.title.show ? (
        <g {...(interactive ? { style: { cursor: 'default' } } : {})}>
          <text
            x={fu.title.xMm}
            y={fu.title.yMm}
            textAnchor="middle"
            fontSize={fu.title.sizeMm}
            fontWeight={fu.title.serif ? 500 : 600}
            fontFamily={fu.title.serif ? SERIF_STACK : undefined}
            letterSpacing={fu.title.trackingEm * fu.title.sizeMm}
            fill={fu.ink}
            stroke={fu.halo}
            strokeWidth={0.5}
            paintOrder="stroke"
          >
            {fu.title.text}
          </text>
          {fu.title.sub ? (
            <text
              x={fu.title.xMm}
              y={fu.title.yMm + fu.title.sizeMm * 0.85}
              textAnchor="middle"
              fontSize={2.4}
              fontWeight={500}
              letterSpacing={0.55}
              fill={fu.ink}
              opacity={0.62}
              stroke={fu.halo}
              strokeWidth={0.3}
              paintOrder="stroke"
            >
              {fu.title.sub.replace('{scale}', niceScaleText(projected.scaleDen, data.manifest.locale))}
            </text>
          ) : null}
        </g>
      ) : null}

      {fu.north.show ? (
        <g transform={`translate(${fu.north.xMm} ${fu.north.yMm})`} fill={fu.ink}>
          <path d="M 0,-7.2 L -1.9,1.6 L 0,0.4 L 1.9,1.6 Z" stroke={fu.halo} strokeWidth={0.4} paintOrder="stroke" />
          <text x={0} y={5.6} textAnchor="middle" fontSize={2.6} fontWeight={600} stroke={fu.halo} strokeWidth={0.3} paintOrder="stroke">
            N
          </text>
        </g>
      ) : null}

      {fu.scalebar.show ? (
        <g transform={`translate(${fu.scalebar.xMm} ${fu.scalebar.yMm})`}>
          <rect x={0} y={0} width={scalebar.mm} height={1.15} fill="none" stroke={fu.ink} strokeWidth={0.2} />
          <rect x={scalebar.mm / 2} y={0} width={scalebar.mm / 2} height={1.15} fill={fu.ink} />
          {[0, scalebar.km / 2, scalebar.km].map((v, i) => (
            <text
              key={i}
              x={(scalebar.mm * i) / 2}
              y={-1.4}
              textAnchor="middle"
              fontSize={2}
              fontWeight={500}
              fill={fu.ink}
              stroke={fu.halo}
              strokeWidth={0.25}
              paintOrder="stroke"
            >
              {v === scalebar.km ? `${v} km` : v}
            </text>
          ))}
        </g>
      ) : null}

      {fu.legend.show && legendItems.length ? (
        <g transform={`translate(${fu.legend.xMm} ${fu.legend.yMm})`}>
          {legendItems.map((it, i) => {
            const y = i * 5.4;
            return (
              <g key={it.label} transform={`translate(0 ${y})`}>
                {it.kind === 'icon' && it.icon ? (
                  <g transform="translate(3.5 -0.9) scale(0.24)">
                    <path d={ICON_GLYPHS[it.icon].fill} fill={it.color} />
                    {ICON_GLYPHS[it.icon].stroke ? <path d={ICON_GLYPHS[it.icon].stroke!} fill="none" stroke={it.color} strokeWidth={0.8} strokeLinecap="round" /> : null}
                  </g>
                ) : it.kind === 'rect' ? (
                  <rect x={0} y={-2.6} width={7} height={3.4} fill={it.color} />
                ) : it.kind === 'dot' ? (
                  <circle cx={3.5} cy={-0.9} r={0.85} fill={it.color} />
                ) : (
                  <line x1={0} y1={-0.9} x2={7} y2={-0.9} stroke={it.color} strokeWidth={Math.max(it.w ?? 0.4, 0.35)} strokeDasharray={dashArray(it.dash, it.w ?? 0.35)} strokeLinecap="round" />
                )}
                <text x={9.2} y={0} fontSize={2.35} fontWeight={500} fill={fu.ink} stroke={fu.halo} strokeWidth={0.28} paintOrder="stroke">
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}

      {fu.attribution.show ? (
        <text
          x={wMm - inset - 3.5}
          y={hMm - inset - 3}
          textAnchor="end"
          fontSize={1.55}
          fill={fu.ink}
          opacity={0.5}
        >
          {data.manifest.attribution.join('  ·  ')}
        </text>
      ) : null}
    </g>
  );
}
