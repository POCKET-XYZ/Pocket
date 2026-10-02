/** An uploaded file as Nest hands it over, kept in memory. */
export interface UploadedBytes {
  buffer: Buffer;
  size: number;
}

/** The images Pocket keeps. Never SVG: an SVG is a document that can run script. */
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Every file type a delivery report can carry. */
export type AttachmentType = ImageType | 'application/pdf';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * What an image really is, read from its first bytes. The file name and the
 * type the browser claimed are never trusted: anyone can rename a page or an
 * SVG to logo.png.
 */
export function sniffImage(buffer: Buffer): ImageType | null {
  if (buffer.length >= PNG.length && buffer.subarray(0, PNG.length).equals(PNG)) {
    return 'image/png';
  }
  if (buffer.length >= JPEG.length && buffer.subarray(0, JPEG.length).equals(JPEG)) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Whether the bytes are a PDF, by its header. */
export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** A PDF or one of the images Pocket keeps, or null for anything else. */
export function sniffAttachment(buffer: Buffer): AttachmentType | null {
  if (isPdf(buffer)) return 'application/pdf';
  return sniffImage(buffer);
}

/** The extension a served file is named with, from its sniffed type. */
export const EXTENSIONS: Record<AttachmentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
