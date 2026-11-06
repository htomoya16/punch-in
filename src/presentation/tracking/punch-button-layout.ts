export type PunchButtonPosition = { row: number; column: number };

// Half-button grid tracks allow a shorter row to stay centered without
// reordering or remounting buttons when the available width changes.
export function punchButtonPositions(count: number, columns: 2 | 3): PunchButtonPosition[] {
  if (count === 0) return [];
  const rows = Math.ceil(count / columns);
  const perRow = Math.floor(count / rows);
  const extra = count % rows;
  const positions: PunchButtonPosition[] = [];
  for (let row = 0; row < rows; row++) {
    const size = perRow + (row < extra ? 1 : 0);
    const firstColumn = columns - size + 1;
    for (let item = 0; item < size; item++)
      positions.push({ row: row + 1, column: firstColumn + item * 2 });
  }
  return positions;
}
