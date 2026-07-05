import { useStudio } from '../state/store';
import { niceScaleText } from '../map/projection';

export function StatusBar({
  scaleDen,
  skipped,
  crs,
  locale,
}: {
  scaleDen: number | null;
  skipped: number;
  crs: string | null;
  locale?: string;
}) {
  const cursorEN = useStudio((s) => s.cursorEN);
  const tier = useStudio((s) => s.tier);
  const setTier = useStudio((s) => s.setTier);
  const recipe = useStudio((s) => s.recipe);

  return (
    <footer className="statusbar">
      <span className="badge">{crs ?? '…'}</span>
      <span className="status-mono">
        {cursorEN ? `E ${Math.round(cursorEN[0]).toLocaleString(locale ?? 'sv-SE')}  N ${Math.round(cursorEN[1]).toLocaleString(locale ?? 'sv-SE')}` : 'E —  N —'}
      </span>
      <span className="status-mono">{scaleDen ? niceScaleText(scaleDen, locale) : ''}</span>
      <span className="status-mono">
        {recipe.paper.wMm}×{recipe.paper.hMm} mm
      </span>
      {skipped > 0 ? <span className="status-warn" title="Lower the label population threshold or drag labels to make room">{skipped} labels didn’t fit</span> : null}
      <div className="topbar-spacer" />
      <div className="tier-switch" title="Preview simplification is for smooth editing; exports always use print detail">
        {(['preview', 'print'] as const).map((t) => (
          <button key={t} className={`tier-pill${tier === t ? ' active' : ''}`} onClick={() => setTier(t)}>
            {t === 'preview' ? 'Fast preview' : 'Print detail'}
          </button>
        ))}
      </div>
    </footer>
  );
}
