import assert from "node:assert/strict";
import test from "node:test";
import { buildChartScale } from "../src/presentation/statistics/chart-scale";
import { placeChartDetail } from "../src/presentation/statistics/detail-placement";

test("目盛りは分の値で等間隔になり、最大時間を超える範囲まで表示する", () => {
  for (const minutes of [0, 1, 90, 481, 7000, 123456]) {
    const scale = buildChartScale(minutes * 60000);
    assert.ok(scale.maximumMs >= minutes * 60000);
    assert.ok(scale.ticks.length >= 3 && scale.ticks.length <= 5);
    assert.equal(scale.ticks[0].value, 0);
    assert.equal(scale.ticks.at(-1)?.value, scale.maximumMs);
    for (const tick of scale.ticks) {
      assert.equal(tick.value % 60000, 0);
      assert.ok(Math.abs(tick.value / scale.maximumMs - tick.ratio) < 0.000001);
    }
  }
});

test("詳細は画面内に収まり、選択した棒の領域と交差しない", () => {
  for (const width of [320, 760, 1024, 1440]) {
    for (const height of [400, 600, 900]) {
      for (const x of [0.1, 0.5, 0.9]) {
        const anchor = {
          left: width * x - 12,
          right: width * x + 12,
          top: 160,
          bottom: Math.min(height - 24, 380),
        };
        const placement = placeChartDetail(anchor, { width, height }, 560);
        if (placement.mode === "inline") continue;
        const popupWidth = Math.min(420, width - 24);
        assert.ok(placement.left >= 12);
        assert.ok(placement.left + popupWidth <= width - 12);
        assert.ok(placement.top >= 64);
        assert.ok(placement.top + placement.maxHeight <= height - 12);
        assert.ok(
          placement.left >= anchor.right ||
            placement.left + popupWidth <= anchor.left ||
            placement.top >= anchor.bottom ||
            placement.top + placement.maxHeight <= anchor.top,
        );
      }
    }
  }
});

test("狭い画面に詳細を置けない場合はグラフ下の表示へ切り替える", () => {
  assert.equal(
    placeChartDetail(
      { left: 140, right: 180, top: 100, bottom: 360 },
      { width: 320, height: 400 },
      560,
    ).mode,
    "inline",
  );
});
