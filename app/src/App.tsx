import { useEffect, useMemo, useState } from 'react';
import { useMapData } from './map/data';
import { makeProjection } from './map/projection';
import { layoutLabels, type LabelLayout } from './map/labels';
import { MapViewport } from './map/MapViewport';
import { TopBar } from './ui/TopBar';
import { LayersPanel } from './ui/LayersPanel';
import { Inspector } from './ui/Inspector';
import { StatusBar } from './ui/StatusBar';
import { layerOf, useStudio } from './state/store';

export default function App() {
  const tier = useStudio((s) => s.tier);
  const recipe = useStudio((s) => s.recipe);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const setView = useStudio((s) => s.setView);
  const { data, error } = useMapData(tier);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === '0') {
        e.preventDefault();
        setView(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setView]);

  const projected = useMemo(
    () => (data ? makeProjection(data.manifest, recipe) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data,
      recipe.paper.wMm,
      recipe.paper.hMm,
      recipe.paper.marginMm,
      recipe.furniture.frame.show,
      recipe.furniture.frame.insetMm,
    ],
  );

  // Labels re-place only when something layout-relevant changes (not on color tweaks).
  const labelKey = useMemo(
    () =>
      JSON.stringify({
        labels: layerOf(recipe, 'labels'),
        places: layerOf(recipe, 'places')?.filters,
        overrides: recipe.labelOverrides,
        paper: recipe.paper,
        frame: recipe.furniture.frame,
      }),
    [recipe],
  );

  const layout: LabelLayout = useMemo(
    () => (data && projected ? layoutLabels(data, projected, recipe) : { labels: [], skipped: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, projected, labelKey, fontsReady],
  );

  const hillshadeHref = data?.manifest.hillshade ? `/data/${data.manifest.hillshade.preview.file}` : null;

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <LayersPanel />
        {error ? (
          <div className="center-pane">
            <div className="error-card">
              <h2>Map data not found</h2>
              <p>The app couldn’t load <code>public/data/manifest.json</code>.</p>
              <p>Run the data pipeline once, then reload:</p>
              <pre>pnpm pipeline</pre>
              <p className="dim">{error}</p>
            </div>
          </div>
        ) : data && projected ? (
          <MapViewport data={data} projected={projected} layout={layout} hillshadeHref={hillshadeHref} />
        ) : (
          <div className="center-pane">
            <div className="loading-card">Loading Sweden…</div>
          </div>
        )}
        <Inspector />
      </div>
      <StatusBar scaleDen={projected?.scaleDen ?? null} skipped={layout.skipped.length} />
    </div>
  );
}
