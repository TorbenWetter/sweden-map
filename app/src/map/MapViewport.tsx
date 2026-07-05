import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Artboard } from './Artboard';
import type { MapData } from './data';
import type { Projected } from './projection';
import type { LabelLayout, PlacedLabel } from './labels';
import { useStudio } from '../state/store';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** css px per physical mm at nominal 96 dpi — "100 %" zoom = true print size (approx.) */
export const PX_PER_MM = 96 / 25.4;

interface Props {
  data: MapData;
  projected: Projected;
  layout: LabelLayout;
  hillshade: Record<'dark' | 'light', string> | null;
}

export function MapViewport({ data, projected, layout, hillshade }: Props) {
  const recipe = useStudio((s) => s.recipe);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const labelEdit = useStudio((s) => s.labelEdit);
  const selected = useStudio((s) => s.selected);
  const select = useStudio((s) => s.select);
  const update = useStudio((s) => s.update);
  const beginTransient = useStudio((s) => s.beginTransient);
  const endTransient = useStudio((s) => s.endTransient);
  const setCursorEN = useStudio((s) => s.setCursorEN);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<
    | { mode: 'pan'; x: number; y: number; tx: number; ty: number; moved: boolean }
    | { mode: 'label'; label: PlacedLabel; moved: boolean }
    | null
  >(null);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    const k = Math.min(width / recipe.paper.wMm, height / recipe.paper.hMm) * 0.94;
    setView({ k, tx: (width - recipe.paper.wMm * k) / 2, ty: (height - recipe.paper.hMm * k) / 2 });
  }, [recipe.paper.wMm, recipe.paper.hMm, setView]);

  useEffect(() => {
    if (!view) fit();
  }, [view, fit]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!viewRef.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Non-passive wheel: pinch/⌘-wheel zooms around the cursor, plain wheel pans.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.0028);
        const k = clamp(v.k * f, 0.12, 80);
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setView({ k, tx: cx - ((cx - v.tx) * k) / v.k, ty: cy - ((cy - v.ty) * k) / v.k });
      } else {
        setView({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  const clientToMm = (clientX: number, clientY: number): [number, number] => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current!;
    return [(clientX - rect.left - v.tx) / v.k, (clientY - rect.top - v.ty) / v.k];
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (drag.current?.mode === 'label') return;
    if (e.button !== 0 && e.button !== 1) return;
    const v = viewRef.current;
    if (!v) return;
    drag.current = { mode: 'pan', x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onLabelPointerDown = (e: ReactPointerEvent, label: PlacedLabel) => {
    e.stopPropagation();
    beginTransient();
    drag.current = { mode: 'label', label, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [mx, my] = clientToMm(e.clientX, e.clientY);
    setCursorEN(projected.toEN(mx, my));

    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView({ k: v.k, tx: d.tx + dx, ty: d.ty + dy });
    } else {
      d.moved = true;
      const lab = d.label;
      update((r) => {
        r.labelOverrides[lab.id] = {
          dxMm: mx - lab.baseX,
          dyMm: my - lab.baseY + lab.sizeMm * 0.3,
        };
      }, false);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'label') {
      endTransient();
    }
  };

  const onBackgroundClick = (e: React.MouseEvent) => {
    // Reached only when no layer stopped propagation → clicked outside the artwork.
    select(null);
  };

  const zoomBy = (f: number) => {
    const el = wrapRef.current;
    const v = viewRef.current;
    if (!el || !v) return;
    const { width, height } = el.getBoundingClientRect();
    const k = clamp(v.k * f, 0.12, 80);
    setView({ k, tx: width / 2 - ((width / 2 - v.tx) * k) / v.k, ty: height / 2 - ((height / 2 - v.ty) * k) / v.k });
  };

  const zoomTo100 = () => {
    const el = wrapRef.current;
    const v = viewRef.current;
    if (!el || !v) return;
    const { width, height } = el.getBoundingClientRect();
    const k = PX_PER_MM;
    setView({ k, tx: width / 2 - ((width / 2 - v.tx) * k) / v.k, ty: height / 2 - ((height / 2 - v.ty) * k) / v.k });
  };

  const v = view;
  return (
    <div ref={wrapRef} className="viewport" onDoubleClick={fit}>
      {v ? (
        <svg
          ref={svgRef}
          className="viewport-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setCursorEN(null)}
          onClick={onBackgroundClick}
        >
          <defs>
            <filter id="paper-shadow" x="-8%" y="-8%" width="116%" height="116%">
              <feDropShadow dx="0" dy="1.6" stdDeviation="3" floodColor="#000000" floodOpacity="0.5" />
            </filter>
          </defs>
          <g transform={`translate(${v.tx} ${v.ty}) scale(${v.k})`}>
            <rect x={0} y={0} width={recipe.paper.wMm} height={recipe.paper.hMm} fill="#ffffff" filter="url(#paper-shadow)" />
            <Artboard
              recipe={recipe}
              data={data}
              projected={projected}
              layout={layout}
              hillshade={hillshade}
              interactive={{ selected, labelEdit, onSelectLayer: select, onLabelPointerDown }}
            />
          </g>
        </svg>
      ) : null}

      <div className="viewport-controls">
        <button className="vc-btn" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
        <span className="vc-zoom">{v ? Math.round((v.k / PX_PER_MM) * 100) : 100}%</span>
        <button className="vc-btn" title="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
        <button className="vc-btn vc-fit" title="Fit (double-click canvas)" onClick={fit}>Fit</button>
        <button className="vc-btn vc-fit" title="True print size" onClick={zoomTo100}>1:1</button>
      </div>

      {labelEdit ? <div className="label-edit-hint">Label edit — drag any name; positions save to the recipe</div> : null}
    </div>
  );
}
