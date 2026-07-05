import { useState } from 'react';
import { RAIL_USAGES, ROAD_CLASSES, ROAD_WIDTH_FACTOR, type Dash, type LayerId, type LayerState, type Recipe } from '../types';
import { layerOf, useStudio } from '../state/store';
import { CheckRow, ColorField, Field, NumberField, RangeField, Section, SelectField } from './controls';

const DASH_OPTIONS: Array<{ value: Dash; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dash', label: 'Dashed' },
  { value: 'dot', label: 'Dotted' },
  { value: 'dashdot', label: 'Dash-dot' },
];

const CLASS_LABELS: Record<string, string> = {
  motorway: 'Motorway',
  trunk: 'Trunk',
  primary: 'Primary',
  secondary: 'Secondary',
};

type Tab = 'layer' | 'paper' | 'layout';

export function Inspector() {
  const [tab, setTab] = useState<Tab>('layer');
  return (
    <aside className="panel inspector">
      <div className="tabs">
        {(['layer', 'paper', 'layout'] as Tab[]).map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'layer' ? 'Layer' : t === 'paper' ? 'Paper' : 'Layout'}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === 'layer' ? <LayerTab /> : tab === 'paper' ? <PaperTab /> : <LayoutTab />}
      </div>
    </aside>
  );
}

function LayerTab() {
  const recipe = useStudio((s) => s.recipe);
  const selected = useStudio((s) => s.selected);
  const update = useStudio((s) => s.update);
  const layerLabels = useStudio((s) => s.layerLabels);
  const layer = selected ? layerOf(recipe, selected) : undefined;

  if (!layer) {
    return <div className="empty-hint">Select a layer — in the list or by clicking the map.</div>;
  }

  const patch = (fn: (l: LayerState) => void) =>
    update((r) => {
      const t = layerOf(r, layer.id);
      if (t) fn(t);
    });

  const hasFill = ['sea', 'bathymetry', 'neighbors', 'sweden', 'parks', 'lakes', 'places', 'labels'].includes(layer.id);
  const hasStroke = ['waterlines', 'contours', 'sweden', 'lakes', 'parks', 'neBorders', 'rivers', 'kommun', 'lan', 'roads', 'railways', 'ferries', 'graticule'].includes(layer.id);
  const hasDash = ['neBorders', 'kommun', 'lan', 'railways', 'ferries', 'graticule'].includes(layer.id);

  return (
    <>
      <div className="inspector-title">{layerLabels[layer.id]}</div>
      <Section title="Style">
        <CheckRow label="Visible" checked={layer.visible} onChange={(v) => patch((l) => (l.visible = v))} />
        <RangeField label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} display={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch((l) => (l.opacity = v))} />
        {hasFill ? (
          <ColorField
            label={layer.id === 'places' ? 'Dot color' : layer.id === 'labels' ? 'Text color' : layer.id === 'bathymetry' ? 'Deep water' : 'Fill'}
            value={layer.fill ?? '#000000'}
            onChange={(v) => patch((l) => (l.fill = v))}
          />
        ) : null}
        {layer.id === 'labels' ? (
          <ColorField label="Water labels" value={layer.stroke ?? '#6E8296'} onChange={(v) => patch((l) => (l.stroke = v))} />
        ) : null}
        {hasStroke && layer.id !== 'labels' ? (
          <>
            <ColorField label={layer.id === 'roads' ? 'Road color' : 'Stroke'} value={layer.stroke ?? '#000000'} onChange={(v) => patch((l) => (l.stroke = v))} />
            <NumberField label="Width" value={layer.strokeWidthMm ?? 0.3} step={0.05} min={0} max={4} unit="mm" onChange={(v) => patch((l) => (l.strokeWidthMm = v))} />
          </>
        ) : null}
        {hasDash ? (
          <SelectField label="Line style" value={layer.dash ?? 'solid'} options={DASH_OPTIONS} onChange={(v) => patch((l) => (l.dash = v))} />
        ) : null}
        {layer.id === 'hillshade' ? (
          <>
            <SelectField
              label="Blend"
              value={layer.filters.blend ?? 'multiply'}
              options={[
                { value: 'multiply', label: 'Multiply — darkens (light themes)' },
                { value: 'screen', label: 'Screen — glows (dark themes)' },
              ]}
              onChange={(v) => patch((l) => (l.filters.blend = v as 'multiply' | 'screen'))}
            />
            <div className="hint">Keep it subtle for print. Screen mode inverts the shade into a relief glow.</div>
          </>
        ) : null}
      </Section>
      <LayerFilters layer={layer} patch={patch} />
    </>
  );
}

function LayerFilters({ layer, patch }: { layer: LayerState; patch: (fn: (l: LayerState) => void) => void }) {
  switch (layer.id) {
    case 'roads':
      return <RoadsFilters layer={layer} patch={patch} />;
    case 'railways':
      return (
        <Section title="Rail usage">
          {RAIL_USAGES.map((u) => (
            <CheckRow
              key={u}
              label={u === 'main' ? 'Main lines' : 'Branch lines'}
              checked={layer.filters.usages?.[u] ?? false}
              onChange={(v) => patch((l) => { (l.filters.usages ??= {})[u] = v; })}
            />
          ))}
        </Section>
      );
    case 'bathymetry':
      return (
        <Section title="Depth shading">
          <div className="hint">Five depth bands shade from the sea color toward the deep-water color above.</div>
        </Section>
      );
    case 'contours':
      return (
        <Section title="Contours">
          <SelectField
            label="Interval"
            value={String(layer.filters.intervalM ?? 400) as any}
            options={[
              { value: '200', label: '200 m' },
              { value: '400', label: '400 m' },
              { value: '600', label: '600 m' },
              { value: '800', label: '800 m' },
              { value: '1000', label: '1000 m' },
            ]}
            onChange={(v) => patch((l) => (l.filters.intervalM = Number(v)))}
          />
          <CheckRow
            label="Bold index contours (1000 m)"
            checked={(layer.filters.boldEveryM ?? 0) > 0}
            onChange={(v) => patch((l) => (l.filters.boldEveryM = v ? 1000 : 0))}
          />
        </Section>
      );
    case 'waterlines':
      return (
        <Section title="Rings">
          <RangeField label="Ring count" value={layer.filters.rings ?? 4} min={1} max={4} step={1} display={(v) => `${Math.round(v)}`} onChange={(v) => patch((l) => (l.filters.rings = Math.round(v)))} />
          <div className="hint">Concentric coastal lines fading seaward — the classic engraved-map look.</div>
        </Section>
      );
    case 'lakes':
      return (
        <Section title="Filter">
          <RangeField label="Min area" value={layer.filters.minAreaKm2 ?? 1} min={1} max={1000} log display={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} km²`} onChange={(v) => patch((l) => (l.filters.minAreaKm2 = v))} />
        </Section>
      );
    case 'rivers':
      return (
        <Section title="Filter">
          <RangeField label="Min length" value={layer.filters.minLengthKm ?? 30} min={30} max={400} display={(v) => `${Math.round(v)} km`} onChange={(v) => patch((l) => (l.filters.minLengthKm = v))} />
        </Section>
      );
    case 'ferries':
      return (
        <Section title="Filter">
          <RangeField label="Min length" value={layer.filters.minLengthKm ?? 10} min={8} max={120} display={(v) => `${Math.round(v)} km`} onChange={(v) => patch((l) => (l.filters.minLengthKm = v))} />
          <div className="hint">Raise to keep only Gotland and international lanes; lower to include road ferries.</div>
        </Section>
      );
    case 'parks':
      return (
        <Section title="Kinds">
          <CheckRow label="National parks" checked={layer.filters.kinds?.national_park ?? true} onChange={(v) => patch((l) => { (l.filters.kinds ??= {}).national_park = v; })} />
          <CheckRow label="Large nature reserves" checked={layer.filters.kinds?.nature_reserve ?? false} onChange={(v) => patch((l) => { (l.filters.kinds ??= {}).nature_reserve = v; })} />
        </Section>
      );
    case 'places':
      return (
        <Section title="Filter">
          <RangeField label="Min population" value={layer.filters.minPopulation ?? 0} min={1000} max={200000} log display={(v) => `${Math.round(v / 1000)}k`} onChange={(v) => patch((l) => (l.filters.minPopulation = Math.round(v)))} />
          <div className="hint">County seats always show.</div>
        </Section>
      );
    case 'labels':
      return (
        <Section title="Labeling">
          <RangeField label="Min population" value={layer.filters.labelMinPopulation ?? 0} min={1000} max={200000} log display={(v) => `${Math.round(v / 1000)}k`} onChange={(v) => patch((l) => (l.filters.labelMinPopulation = Math.round(v)))} />
          <RangeField label="Font scale" value={layer.filters.fontScale ?? 1} min={0.7} max={1.6} step={0.01} display={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch((l) => (l.filters.fontScale = v))} />
          <CheckRow label="Sea names" checked={layer.filters.seaLabels ?? true} onChange={(v) => patch((l) => (l.filters.seaLabels = v))} />
          <CheckRow label="Lake names" checked={layer.filters.lakeLabels ?? true} onChange={(v) => patch((l) => (l.filters.lakeLabels = v))} />
          <CheckRow label="River names" checked={layer.filters.riverLabels ?? true} onChange={(v) => patch((l) => (l.filters.riverLabels = v))} />
          <CheckRow label="Neighbor capitals" checked={layer.filters.neighborLabels ?? true} onChange={(v) => patch((l) => (l.filters.neighborLabels = v))} />
        </Section>
      );
    default:
      return null;
  }
}

function RoadsFilters({ layer, patch }: { layer: LayerState; patch: (fn: (l: LayerState) => void) => void }) {
  const begin = useStudio((s) => s.beginTransient);
  const end = useStudio((s) => s.endTransient);
  const base = layer.strokeWidthMm ?? 0.5;
  const hasOverrides = Object.keys(layer.classStyles ?? {}).length > 0;

  return (
    <>
      <Section title="Road classes">
        {ROAD_CLASSES.map((cls) => {
          const effColor = layer.classStyles?.[cls]?.stroke ?? layer.stroke ?? '#000000';
          const effWidth = layer.classStyles?.[cls]?.strokeWidthMm ?? base * ROAD_WIDTH_FACTOR[cls];
          return (
            <div className="class-row" key={cls}>
              <input
                type="checkbox"
                checked={layer.filters.classes?.[cls] ?? false}
                onChange={(e) => patch((l) => { (l.filters.classes ??= {})[cls] = e.target.checked; })}
              />
              <span className="class-label">{CLASS_LABELS[cls]}</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(effColor) ? effColor : '#000000'}
                title={`${CLASS_LABELS[cls]} color`}
                onFocus={begin}
                onBlur={end}
                onChange={(e) => patch((l) => { ((l.classStyles ??= {})[cls] ??= {}).stroke = e.target.value; })}
              />
              <span className="number-field">
                <input
                  className="mono-input class-width"
                  type="number"
                  value={Math.round(effWidth * 100) / 100}
                  step={0.05}
                  min={0}
                  max={4}
                  title={`${CLASS_LABELS[cls]} width (mm)`}
                  onFocus={begin}
                  onBlur={end}
                  onChange={(e) => patch((l) => { ((l.classStyles ??= {})[cls] ??= {}).strokeWidthMm = Number(e.target.value); })}
                />
              </span>
            </div>
          );
        })}
        {hasOverrides ? (
          <button className="link-btn" onClick={() => patch((l) => { delete l.classStyles; })}>
            Reset to base color × class widths
          </button>
        ) : (
          <div className="hint">Classes inherit the road color and width-per-class factors until you override them here.</div>
        )}
      </Section>
      <Section title="Casing">
        <CheckRow
          label="Under-stroke casing"
          checked={layer.casing?.on ?? false}
          onChange={(v) => patch((l) => { l.casing = { on: v, color: l.casing?.color ?? '#FFFFFF', extraMm: l.casing?.extraMm ?? 0.14 }; })}
        />
        {layer.casing?.on ? (
          <>
            <ColorField label="Color" value={layer.casing.color} onChange={(v) => patch((l) => { l.casing!.color = v; })} />
            <NumberField label="Extra width" value={layer.casing.extraMm} step={0.02} min={0} max={1} unit="mm" onChange={(v) => patch((l) => { l.casing!.extraMm = v; })} />
          </>
        ) : null}
      </Section>
    </>
  );
}

const PAPER_PRESETS = [
  { label: 'A0', wMm: 841, hMm: 1189 },
  { label: 'A1', wMm: 594, hMm: 841 },
  { label: 'A2', wMm: 420, hMm: 594 },
  { label: '50×70', wMm: 500, hMm: 700 },
];

function PaperTab() {
  const recipe = useStudio((s) => s.recipe);
  const update = useStudio((s) => s.update);
  const setView = useStudio((s) => s.setView);

  const setPaper = (fn: (p: Recipe['paper']) => void) => {
    update((r) => fn(r.paper));
    setView(null); // refit viewport
  };

  return (
    <>
      <div className="inspector-title">Paper</div>
      <Section title="Size">
        <div className="preset-row">
          {PAPER_PRESETS.map((p) => (
            <button
              key={p.label}
              className={`chip${recipe.paper.wMm === p.wMm && recipe.paper.hMm === p.hMm ? ' active' : ''}`}
              onClick={() => setPaper((paper) => { paper.wMm = p.wMm; paper.hMm = p.hMm; })}
            >
              {p.label}
            </button>
          ))}
          <button className="chip" title="Swap orientation" onClick={() => setPaper((p) => { const w = p.wMm; p.wMm = p.hMm; p.hMm = w; })}>
            ⇄
          </button>
        </div>
        <NumberField label="Width" value={recipe.paper.wMm} min={100} max={2000} unit="mm" onChange={(v) => setPaper((p) => (p.wMm = v))} />
        <NumberField label="Height" value={recipe.paper.hMm} min={100} max={2000} unit="mm" onChange={(v) => setPaper((p) => (p.hMm = v))} />
        <NumberField label="Map margin" value={recipe.paper.marginMm} min={0} max={120} unit="mm" onChange={(v) => setPaper((p) => (p.marginMm = v))} />
      </Section>
      <Section title="Frame">
        <CheckRow label="White frame border" checked={recipe.furniture.frame.show} onChange={(v) => update((r) => (r.furniture.frame.show = v))} />
        {recipe.furniture.frame.show ? (
          <>
            <NumberField label="Inset" value={recipe.furniture.frame.insetMm} min={4} max={60} unit="mm" onChange={(v) => update((r) => (r.furniture.frame.insetMm = v))} />
            <ColorField label="Border paper" value={recipe.furniture.frame.paper} onChange={(v) => update((r) => (r.furniture.frame.paper = v))} />
            <NumberField label="Rule width" value={recipe.furniture.frame.ruleMm} step={0.05} min={0} max={2} unit="mm" onChange={(v) => update((r) => (r.furniture.frame.ruleMm = v))} />
            <ColorField label="Rule color" value={recipe.furniture.frame.ruleColor} onChange={(v) => update((r) => (r.furniture.frame.ruleColor = v))} />
          </>
        ) : null}
      </Section>
    </>
  );
}

function LayoutTab() {
  const recipe = useStudio((s) => s.recipe);
  const update = useStudio((s) => s.update);
  const fu = recipe.furniture;
  const f = (fn: (x: Recipe['furniture']) => void) => update((r) => fn(r.furniture));

  return (
    <>
      <div className="inspector-title">Layout & furniture</div>
      <Section title="Title">
        <CheckRow label="Show title" checked={fu.title.show} onChange={(v) => f((x) => (x.title.show = v))} />
        <Field label="Text">
          <input type="text" value={fu.title.text} onChange={(e) => f((x) => (x.title.text = e.target.value))} />
        </Field>
        <Field label="Subtitle">
          <input type="text" value={fu.title.sub} onChange={(e) => f((x) => (x.title.sub = e.target.value))} />
        </Field>
        <div className="hint">{'{scale}'} inserts the exact computed map scale.</div>
        <NumberField label="Size" value={fu.title.sizeMm} step={0.5} min={4} max={40} unit="mm" onChange={(v) => f((x) => (x.title.sizeMm = v))} />
        <RangeField label="Tracking" value={fu.title.trackingEm} min={0} max={0.8} step={0.01} display={(v) => v.toFixed(2)} onChange={(v) => f((x) => (x.title.trackingEm = v))} />
        <CheckRow label="Serif face" checked={fu.title.serif} onChange={(v) => f((x) => (x.title.serif = v))} />
        <NumberField label="X" value={fu.title.xMm} unit="mm" onChange={(v) => f((x) => (x.title.xMm = v))} />
        <NumberField label="Y" value={fu.title.yMm} unit="mm" onChange={(v) => f((x) => (x.title.yMm = v))} />
      </Section>
      <Section title="Legend">
        <CheckRow label="Show legend" checked={fu.legend.show} onChange={(v) => f((x) => (x.legend.show = v))} />
        <NumberField label="X" value={fu.legend.xMm} unit="mm" onChange={(v) => f((x) => (x.legend.xMm = v))} />
        <NumberField label="Y" value={fu.legend.yMm} unit="mm" onChange={(v) => f((x) => (x.legend.yMm = v))} />
      </Section>
      <Section title="Scale bar & north">
        <CheckRow label="Scale bar" checked={fu.scalebar.show} onChange={(v) => f((x) => (x.scalebar.show = v))} />
        <NumberField label="X" value={fu.scalebar.xMm} unit="mm" onChange={(v) => f((x) => (x.scalebar.xMm = v))} />
        <NumberField label="Y" value={fu.scalebar.yMm} unit="mm" onChange={(v) => f((x) => (x.scalebar.yMm = v))} />
        <CheckRow label="North arrow" checked={fu.north.show} onChange={(v) => f((x) => (x.north.show = v))} />
        <NumberField label="X" value={fu.north.xMm} unit="mm" onChange={(v) => f((x) => (x.north.xMm = v))} />
        <NumberField label="Y" value={fu.north.yMm} unit="mm" onChange={(v) => f((x) => (x.north.yMm = v))} />
      </Section>
      <Section title="Colors & credits">
        <ColorField label="Furniture ink" value={fu.ink} onChange={(v) => f((x) => (x.ink = v))} />
        <ColorField label="Label halo" value={fu.halo} onChange={(v) => f((x) => (x.halo = v))} />
        <CheckRow label="Attribution line" checked={fu.attribution.show} onChange={(v) => f((x) => (x.attribution.show = v))} />
        <div className="hint">OSM's ODbL license asks for attribution on published maps — leave it on for anything you share.</div>
      </Section>
    </>
  );
}
