import { useEffect, useState } from 'react';
import { Artboard } from '../map/Artboard';
import { PRINT_PAYLOAD_KEY, compose, type Composition } from './export';
import type { Recipe } from '../types';

export function PrintPage() {
  const [recipe] = useState<Recipe | null>(() => {
    try {
      const raw = localStorage.getItem(PRINT_PAYLOAD_KEY);
      return raw ? (JSON.parse(raw) as Recipe) : null;
    } catch {
      return null;
    }
  });
  const [c, setC] = useState<Composition | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!recipe) return;
    let alive = true;
    (async () => {
      const comp = await compose(recipe, 'print');
      if (!alive) return;
      if (comp.hillshadeUrl) {
        const img = new Image();
        img.src = comp.hillshadeUrl;
        await img.decode().catch(() => undefined);
      }
      await document.fonts.ready;
      if (!alive) return;
      setC(comp);
      setTimeout(() => setReady(true), 250);
    })();
    return () => {
      alive = false;
    };
  }, [recipe]);

  useEffect(() => {
    if (ready) window.print();
  }, [ready]);

  if (!recipe) return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>No recipe found — open the studio and use Export → PDF.</p>;

  const { wMm, hMm } = recipe.paper;
  return (
    <div>
      <style>{`
        @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #52565c; }
        .print-toolbar { position: fixed; top: 12px; left: 12px; z-index: 10; display: flex; gap: 8px; align-items: center;
          font-family: Inter, sans-serif; font-size: 13px; color: #fff; background: #1b1f26; padding: 10px 12px; border-radius: 8px; }
        .print-toolbar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: none; background: #B9553F; color: #fff; cursor: pointer; }
        .sheet { width: ${wMm}mm; height: ${hMm}mm; margin: 24px auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,.4); }
        @media print { .print-toolbar { display: none; } .sheet { margin: 0; box-shadow: none; } }
      `}</style>
      <div className="print-toolbar">
        <span>{c ? 'Ready — choose “Save as PDF” for a vector file at exact size.' : 'Preparing print-quality render…'}</span>
        <button onClick={() => window.print()} disabled={!c}>Print / Save PDF</button>
      </div>
      {c ? (
        <svg
          className="sheet"
          xmlns="http://www.w3.org/2000/svg"
          width={`${wMm}mm`}
          height={`${hMm}mm`}
          viewBox={`0 0 ${wMm} ${hMm}`}
          fontFamily="Inter, 'Helvetica Neue', sans-serif"
        >
          <Artboard recipe={recipe} data={c.data} projected={c.projected} layout={c.layout} hillshadeHref={c.hillshadeUrl} />
        </svg>
      ) : (
        <div className="sheet" />
      )}
    </div>
  );
}
