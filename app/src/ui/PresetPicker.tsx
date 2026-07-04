import { useEffect, useMemo, useRef, useState } from 'react';
import { PRESETS } from '../presets/presets';
import { useStudio, layerOf } from '../state/store';
import type { Recipe } from '../types';

function paletteOf(r: Recipe): string[] {
  return [
    layerOf(r, 'sea')?.fill ?? '#888',
    layerOf(r, 'sweden')?.fill ?? '#fff',
    layerOf(r, 'lakes')?.fill ?? '#9cf',
    layerOf(r, 'roads')?.stroke ?? '#c00',
    layerOf(r, 'railways')?.stroke ?? '#222',
    layerOf(r, 'labels')?.fill ?? '#000',
  ];
}

export function PresetPicker() {
  const recipe = useStudio((s) => s.recipe);
  const applyPreset = useStudio((s) => s.applyPreset);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cards = useMemo(
    () =>
      Object.entries(PRESETS).map(([id, p]) => ({
        id,
        label: p.label,
        tagline: p.tagline,
        palette: paletteOf(p.build()),
      })),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = PRESETS[recipe.preset];

  return (
    <div className="preset-picker" ref={wrapRef}>
      <button className="preset-button" onClick={() => setOpen((v) => !v)} title="Choose a style preset">
        <span className="preset-button-strip">
          {paletteOf(recipe).slice(0, 4).map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </span>
        {current?.label ?? 'Custom'}
        <span className="caret">▾</span>
      </button>
      {open ? (
        <div className="preset-gallery">
          <div className="preset-gallery-title">Style presets</div>
          <div className="preset-grid">
            {cards.map((c) => (
              <button
                key={c.id}
                className={`preset-card${recipe.preset === c.id ? ' active' : ''}`}
                onClick={() => {
                  applyPreset(c.id);
                  setOpen(false);
                }}
              >
                <span className="preset-strip">
                  {c.palette.map((col, i) => (
                    <i key={i} style={{ background: col }} />
                  ))}
                </span>
                <span className="preset-card-label">{c.label}</span>
                <span className="preset-card-tagline">{c.tagline}</span>
              </button>
            ))}
          </div>
          <div className="preset-gallery-foot">Applying a preset keeps your paper size. Everything stays editable.</div>
        </div>
      ) : null}
    </div>
  );
}
