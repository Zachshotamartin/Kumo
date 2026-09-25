/** Measurements of the canvas toolbar, in CSS pixels. */
export interface ToolbarFit {
  /** Width the toolbar may occupy inside its dock row. */
  available: number;
  /** Everything in the toolbar that isn't a primary tool: padding, borders, divider, history actions. */
  chrome: number;
  /** One tool button plus the gap after it. */
  step: number;
  /** The gap between tool buttons, which the last button in a group doesn't carry. */
  gap: number;
  /** Number of primary tools. */
  total: number;
  /** Tools that stay visible however narrow the toolbar gets. */
  minimum: number;
}

/**
 * How many primary tools the toolbar shows before the rest move into its "More tools" menu.
 * Showing the menu costs one extra button, so an overflowing toolbar makes room for it.
 */
export const fitToolCount = ({ available, chrome, step, gap, total, minimum }: ToolbarFit) => {
  if (chrome + total * step - gap <= available) return total;
  const withMenu = Math.floor((available - chrome + gap) / step) - 1;
  return Math.max(minimum, Math.min(total - 1, withMenu));
};

/**
 * The toolbar's available width: its dock row, less room on both sides for any control sharing
 * its line (the zoom), since the toolbar stays centred on the canvas. Controls stacked above it cost nothing.
 */
export const toolbarAvailableWidth = (toolbar: HTMLElement) => {
  const row = toolbar.parentElement;
  if (!row) return 0;
  const line = toolbar.getBoundingClientRect();
  const siblingWidths = [...row.children]
    .filter((child) => child !== toolbar)
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.top < line.bottom && rect.bottom > line.top)
    .map((rect) => rect.width);
  if (!siblingWidths.length) return row.clientWidth;
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
  return row.clientWidth - 2 * (Math.max(...siblingWidths) + gap);
};
