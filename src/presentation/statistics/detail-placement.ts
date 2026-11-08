export type ChartAnchor = { left: number; right: number; top: number; bottom: number };
export type DetailPlacement =
  { mode: "floating"; left: number; top: number; maxHeight: number } | { mode: "inline" };

/** Keep the selected column unobscured, even when the viewport cannot fit a floating detail. */
export function placeChartDetail(
  anchor: ChartAnchor,
  viewport: { width: number; height: number },
  detailHeight: number,
): DetailPlacement {
  const gap = 12;
  const topEdge = 64;
  const width = Math.min(420, viewport.width - gap * 2);
  const maxHeight = Math.min(560, viewport.height - topEdge - gap);
  const height = Math.min(detailHeight, maxHeight);
  const top = Math.max(topEdge, Math.min(anchor.top, viewport.height - maxHeight - gap));
  const left = Math.max(gap, Math.min(anchor.left, viewport.width - width - gap));

  if (anchor.right + gap + width <= viewport.width - gap) {
    return { mode: "floating", left: anchor.right + gap, top, maxHeight };
  }
  if (anchor.left - gap - width >= gap) {
    return { mode: "floating", left: anchor.left - gap - width, top, maxHeight };
  }

  const below = viewport.height - anchor.bottom - gap * 2;
  const above = anchor.top - topEdge - gap;
  if (below >= Math.min(180, height)) {
    return { mode: "floating", left, top: anchor.bottom + gap, maxHeight: Math.min(560, below) };
  }
  if (above >= Math.min(180, height)) {
    return {
      mode: "floating",
      left,
      top: anchor.top - gap - Math.min(height, above),
      maxHeight: Math.min(height, above),
    };
  }
  return { mode: "inline" };
}
