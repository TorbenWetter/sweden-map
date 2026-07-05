import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LayerId } from '../types';
import { useStudio } from '../state/store';

const ROW_H = 30;

export function LayersPanel() {
  const recipe = useStudio((s) => s.recipe);
  const selected = useStudio((s) => s.selected);
  const select = useStudio((s) => s.select);
  const update = useStudio((s) => s.update);
  const layerLabels = useStudio((s) => s.layerLabels);

  // display order: topmost drawn first
  const display = [...recipe.layers].reverse();
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: LayerId; from: number; to: number } | null>(null);

  const onHandleDown = (e: ReactPointerEvent, id: LayerId, index: number) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ id, from: index, to: index });
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    if (!drag || !listRef.current) return;
    const rect = listRef.current.getBoundingClientRect();
    const to = Math.max(0, Math.min(display.length - 1, Math.floor((e.clientY - rect.top) / ROW_H)));
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const onHandleUp = () => {
    if (drag && drag.to !== drag.from) {
      const { id, to } = drag;
      update((r) => {
        const arr = r.layers;
        const fromArr = arr.findIndex((l) => l.id === id);
        const [moved] = arr.splice(fromArr, 1);
        // display index → array index (display is reversed)
        const toArr = arr.length - to;
        arr.splice(Math.max(0, Math.min(arr.length, toArr)), 0, moved);
      });
    }
    setDrag(null);
  };

  return (
    <aside className="panel layers-panel">
      <div className="panel-header">Layers</div>
      <div className="layers-list" ref={listRef}>
        {display.map((l, i) => (
          <div key={l.id}>
            {drag && drag.to === i && drag.to <= drag.from ? <div className="drop-line" /> : null}
            <div
              className={`layer-row${selected === l.id ? ' selected' : ''}${drag?.id === l.id ? ' dragging' : ''}${l.visible ? '' : ' hidden-layer'}`}
              onClick={() => select(l.id)}
            >
              <span
                className="drag-handle"
                title="Drag to reorder draw order"
                onPointerDown={(e) => onHandleDown(e, l.id, i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
              >
                ⋮⋮
              </span>
              <button
                className={`eye${l.visible ? ' on' : ''}`}
                title={l.visible ? 'Hide layer' : 'Show layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  update((r) => {
                    const t = r.layers.find((x) => x.id === l.id)!;
                    t.visible = !t.visible;
                  });
                }}
              >
                {l.visible ? '●' : '○'}
              </button>
              <span className="layer-name">{layerLabels[l.id]}</span>
              <span className="layer-swatch" style={{ background: l.fill ?? l.stroke ?? 'transparent' }} />
            </div>
            {drag && drag.to === i && drag.to > drag.from ? <div className="drop-line" /> : null}
          </div>
        ))}
      </div>
      <div className="panel-footnote">Top of the list draws on top. Drag ⋮⋮ to reorder.</div>
    </aside>
  );
}
