/** The widest a logo is kept: well over the 160 real pixels its 80 px take on a retina screen. */
export const LOGO_MAX_SIDE = 512;

/**
 * An image made small enough to upload, read in the browser. One no bigger
 * than `maxSide` and `maxBytes` goes as it is; a bigger one is redrawn at
 * `maxSide` as a high-quality WebP, which keeps a PNG's transparency. Returns
 * the original when the browser cannot redraw it, for the size check to name.
 */
export async function shrinkImage(
  file: File,
  maxSide: number,
  maxBytes: number,
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= maxBytes) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.92),
    );
    // A browser without WebP output hands back a PNG: keep whichever is smaller.
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'logo';
    return new File([blob], `${name}.${blob.type === 'image/webp' ? 'webp' : 'png'}`, {
      type: blob.type,
    });
  } finally {
    bitmap.close();
  }
}
