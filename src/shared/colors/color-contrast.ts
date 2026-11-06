export function contrastText(color: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? "#182631" : "#ffffff";
}

/** Keep configurable text and outlines visible on the application's white surface. */
export function readableColor(color: string, minimumContrast = 4.5) {
  let rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < 25; i++) {
    const linear = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    if (1.05 / (luminance + 0.05) >= minimumContrast) break;
    rgb = rgb.map((v) => Math.floor(v * 0.9));
  }
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}
