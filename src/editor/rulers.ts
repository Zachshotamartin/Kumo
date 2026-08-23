export const RULER_SIZE = 20;

export interface RulerTick {
  value: number;
  position: number;
  label: string;
}

const niceStep = (roughStep: number) => {
  const exponent = Math.floor(Math.log10(Math.max(roughStep, Number.EPSILON)));
  const magnitude = 10 ** exponent;
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
};

const formatTick = (value: number) => {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  if (Math.abs(normalized) >= 1000) return new Intl.NumberFormat("en-US").format(normalized);
  return Number(normalized.toFixed(4)).toString();
};

/** Major ruler ticks aligned to world coordinates and kept legible at every zoom. */
export const rulerTicks = (
  viewportStart: number,
  zoom: number,
  screenLength = 8192,
  rulerInset = RULER_SIZE,
  minimumLabelSpacing = 64
): RulerTick[] => {
  const safeZoom = Math.max(0.0001, zoom);
  const step = niceStep(minimumLabelSpacing / safeZoom);
  const firstVisibleWorld = viewportStart + rulerInset / safeZoom;
  const lastVisibleWorld = viewportStart + screenLength / safeZoom;
  const first = Math.floor(firstVisibleWorld / step) * step;
  const ticks: RulerTick[] = [];
  for (let value = first; value <= lastVisibleWorld + step; value += step) {
    const normalized = Number(value.toPrecision(12));
    ticks.push({
      value: normalized,
      position: (normalized - viewportStart) * safeZoom - rulerInset,
      label: formatTick(normalized),
    });
  }
  return ticks;
};
