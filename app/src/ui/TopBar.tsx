import { useRef, useState } from 'react';
import { useStudio } from '../state/store';
import { exportRaster, exportRecipeFile, exportSvg, openPrint } from '../export/export';
import { PresetPicker } from './PresetPicker';
import type { Recipe } from '../types';

export function TopBar() {
  const recipe = useStudio((s) => s.recipe);
  const importRecipe = useStudio((s) => s.importRecipe);
  const update = useStudio((s) => s.update);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const labelEdit = useStudio((s) => s.labelEdit);
  const setLabelEdit = useStudio((s) => s.setLabelEdit);

  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setExportOpen(false);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      alert(`${label} failed: ${e}`);
    } finally {
      setBusy(null);
    }
  };

  const onImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Recipe;
      if (parsed.version !== 1 || !Array.isArray(parsed.layers)) throw new Error('not a recipe file');
      importRecipe(parsed);
    } catch (e) {
      alert(`Could not load recipe: ${e}`);
    }
  };

  return (
    <header className="topbar">
      <div className="wordmark">
        SWEDEN <em>MAP STUDIO</em>
      </div>

      <PresetPicker />

      <input
        className="recipe-name"
        value={recipe.name}
        spellCheck={false}
        onChange={(e) => update((r) => (r.name = e.target.value), false)}
        title="Recipe name"
      />

      <div className="topbar-spacer" />

      <button className="tb-btn" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">↺</button>
      <button className="tb-btn" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)">↻</button>

      <button className={`tb-btn tb-toggle${labelEdit ? ' active' : ''}`} onClick={() => setLabelEdit(!labelEdit)} title="Drag labels on the map">
        Labels
      </button>

      <button className="tb-btn" onClick={() => exportRecipeFile(recipe)} title="Save recipe as JSON file">Save</button>
      <button className="tb-btn" onClick={() => fileRef.current?.click()} title="Load a recipe JSON file">Load</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImportFile(f);
          e.target.value = '';
        }}
      />

      <div className="export-wrap">
        <button className="export-btn" onClick={() => setExportOpen((v) => !v)} disabled={!!busy}>
          {busy ? `${busy}…` : 'Export'}
        </button>
        {exportOpen ? (
          <div className="export-menu" onMouseLeave={() => setExportOpen(false)}>
            <button onClick={() => run('SVG', () => exportSvg(recipe))}>
              SVG — vector master<span>opens in Illustrator/Inkscape</span>
            </button>
            <button onClick={() => { setExportOpen(false); openPrint(recipe); }}>
              PDF — print dialog<span>exact size, vector, for the print shop</span>
            </button>
            <button onClick={() => run('TIFF 300', () => exportRaster(recipe, 300, 'tiff'))}>
              TIFF — 300 dpi<span>print labs (WhiteWall et al.) — 8-bit, sRGB embedded</span>
            </button>
            <button onClick={() => run('JPEG 300', () => exportRaster(recipe, 300, 'jpeg'))}>
              JPEG — 300 dpi<span>same, smaller; quality 97, sRGB embedded</span>
            </button>
            <button onClick={() => run('PNG 300', () => exportRaster(recipe, 300, 'png'))}>
              PNG — 300 dpi<span>raster proof — labs often reject PNG</span>
            </button>
            <button onClick={() => run('PNG 150', () => exportRaster(recipe, 150, 'png'))}>
              PNG — 150 dpi<span>quick share</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
