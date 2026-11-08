export function buildChartScale(maximumMs: number) {
  const maximumMinutes = Math.max(60, Math.ceil(maximumMs / 60000));
  const steps = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
  let step = steps.find((candidate) => Math.ceil(maximumMinutes / candidate) <= 4);
  if (!step) {
    const unit = 10 ** Math.floor(Math.log10(maximumMinutes / 4));
    step = [1, 2, 5, 10]
      .map((factor) => factor * unit)
      .find((candidate) => candidate * 4 >= maximumMinutes)!;
  }
  const count = Math.ceil(maximumMinutes / step);
  return {
    maximumMs: count * step * 60000,
    ticks: Array.from({ length: count + 1 }, (_, index) => ({
      value: index * step * 60000,
      ratio: index / count,
    })),
  };
}
