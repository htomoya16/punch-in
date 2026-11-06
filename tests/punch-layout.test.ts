import assert from "node:assert/strict";
import test from "node:test";
import { punchButtonPositions } from "../src/presentation/tracking/punch-button-layout";
function rowCounts(count: number, columns: 2 | 3) {
  const rows = new Map<number, number>();
  for (const position of punchButtonPositions(count, columns))
    rows.set(position.row, (rows.get(position.row) ?? 0) + 1);
  return [...rows.values()];
}
test("広い領域では4個を2+2、7個を3+2+2のように均等に並べる", () => {
  const expected = [
    [],
    [1],
    [2],
    [3],
    [2, 2],
    [3, 2],
    [3, 3],
    [3, 2, 2],
    [3, 3, 2],
    [3, 3, 3],
    [3, 3, 2, 2],
    [3, 3, 3, 2],
    [3, 3, 3, 3],
  ];
  expected.forEach((rows, count) => assert.deepEqual(rowCounts(count, 3), rows));
});
test("短い段の左右に同じ余白を取り、登録順を維持する", () => {
  assert.deepEqual(punchButtonPositions(5, 3), [
    { row: 1, column: 1 },
    { row: 1, column: 3 },
    { row: 1, column: 5 },
    { row: 2, column: 2 },
    { row: 2, column: 4 },
  ]);
  assert.deepEqual(punchButtonPositions(4, 3), [
    { row: 1, column: 2 },
    { row: 1, column: 4 },
    { row: 2, column: 2 },
    { row: 2, column: 4 },
  ]);
});
test("狭い領域は最大2列、奇数の最後の1個は中央", () => {
  assert.deepEqual(rowCounts(5, 2), [2, 2, 1]);
  assert.deepEqual(punchButtonPositions(5, 2).at(-1), { row: 3, column: 2 });
});
test("上限500種類でも欠落・重複・段の偏りや3列での孤立を生まない", () => {
  for (const columns of [2, 3] as const)
    for (let count = 1; count <= 500; count++) {
      const positions = punchButtonPositions(count, columns),
        rows = rowCounts(count, columns);
      assert.equal(positions.length, count);
      assert.equal(new Set(positions.map((p) => `${p.row}:${p.column}`)).size, count);
      assert.ok(rows.every((size) => size <= columns));
      assert.ok(Math.max(...rows) - Math.min(...rows) <= 1);
      assert.ok(positions.every((p) => p.column >= 1 && p.column + 1 <= columns * 2));
      if (columns === 3 && count > 1) assert.ok(rows.every((size) => size >= 2));
    }
});
