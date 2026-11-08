/** Decode and re-encode locally so only a small cropped raster, without photo metadata, is sent. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
    throw new Error("10MB以内の画像を選んでください");
  }
  const image = await createImageBitmap(file).catch(() => {
    throw new Error("画像を読み込めませんでした");
  });
  try {
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context || !size) throw new Error("画像を読み込めませんでした");
    context.drawImage(
      image,
      (image.width - size) / 2,
      (image.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("画像を読み込めませんでした"))),
        "image/webp",
        0.85,
      ),
    );
  } finally {
    image.close();
  }
}
