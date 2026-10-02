import { inflateRawSync } from 'node:zlib';

/** An uploaded file as Nest hands it over, kept in memory. */
export interface UploadedBytes {
  buffer: Buffer;
  size: number;
  /** The name the browser gave. Only ever used to name the download, never to decide the type. */
  originalname?: string;
}

/** The images Pocket keeps. Never SVG: an SVG is a document that can run script. */
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A report a startup hands over to be filled, or a filled one handed back. */
export type ReportFileType =
  'application/pdf' | typeof XLSX_TYPE | typeof DOCX_TYPE | 'text/csv';

/** Every file type a delivery report can carry. */
export type AttachmentType = ImageType | ReportFileType;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;

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

/**
 * Whether the bytes are a CSV: UTF-8 text with no NUL or other control
 * bytes besides tabs and line breaks. Markup is refused even though it is
 * text, so an SVG or a page renamed to .csv stays out.
 */
export function isCsv(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return false;
  const start = text.replace(/^\uFEFF/, '').trimStart();
  return start.length > 0 && !start.startsWith('<');
}

/** One file listed in a ZIP's central directory. */
interface ZipEntry {
  name: string;
  method: number;
  encrypted: boolean;
  compressedSize: number;
  localOffset: number;
}

/**
 * The files a ZIP lists in its central directory, or null when the bytes are
 * not a plain, well-formed ZIP. ZIP64 and archives with a comment that hides
 * the end record are refused: no Office file needs them under 5 MB.
 */
function zipEntries(buffer: Buffer): ZipEntry[] | null {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== ZIP_LOCAL) return null;
  // The end record is the last 22 bytes, plus a comment of up to 64 KB.
  let end = -1;
  const lowest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= lowest; i--) {
    if (buffer.readUInt32LE(i) === ZIP_END) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const offset = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) return null;
  if (offset + size > end) return null;

  const entries: ZipEntry[] = [];
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > offset + size || buffer.readUInt32LE(at) !== ZIP_CENTRAL) return null;
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > offset + size) return null;
    entries.push({
      name: buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8'),
      method,
      encrypted: (flags & 1) === 1,
      compressedSize,
      localOffset,
    });
    at = next;
  }
  return entries;
}

/** The content of one small ZIP entry, stored or deflated, or null. */
function zipRead(buffer: Buffer, entry: ZipEntry, limit: number): Buffer | null {
  const at = entry.localOffset;
  if (entry.encrypted || at + 30 > buffer.length) return null;
  if (buffer.readUInt32LE(at) !== ZIP_LOCAL) return null;
  const start = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
  const end = start + entry.compressedSize;
  if (end > buffer.length) return null;
  const data = buffer.subarray(start, end);
  try {
    if (entry.method === 0) return data.length <= limit ? data : null;
    if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: limit });
  } catch {
    // Corrupt, or bigger than any real list of content types.
  }
  return null;
}

/**
 * Whether a ZIP is a Word or Excel document, read from its own list of
 * content types. Macro-enabled files (.xlsm, .docm) declare themselves as
 * such and carry a vbaProject.bin: both are refused.
 */
function sniffOffice(buffer: Buffer): typeof XLSX_TYPE | typeof DOCX_TYPE | null {
  const entries = zipEntries(buffer);
  if (!entries) return null;
  const names = entries.map((entry) => entry.name);
  if (names.some((name) => /vbaproject\.bin$/i.test(name))) return null;
  const types = entries.find((entry) => entry.name === '[Content_Types].xml');
  if (!types) return null;
  const xml = zipRead(buffer, types, 1024 * 1024)?.toString('utf8');
  if (!xml || /macroEnabled/i.test(xml)) return null;

  const excel = names.some((name) => name.startsWith('xl/'));
  const word = names.some((name) => name.startsWith('word/'));
  if (excel && !word && /spreadsheetml\.(sheet|template)\.main\+xml/.test(xml)) {
    return XLSX_TYPE;
  }
  if (word && !excel && /wordprocessingml\.(document|template)\.main\+xml/.test(xml)) {
    return DOCX_TYPE;
  }
  return null;
}

/**
 * A report file, read from its bytes: PDF, Excel (.xlsx), Word (.docx) or
 * CSV. Null for anything else, macro-enabled Office files included.
 */
export function sniffReportFile(buffer: Buffer): ReportFileType | null {
  if (isPdf(buffer)) return 'application/pdf';
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === ZIP_LOCAL) {
    return sniffOffice(buffer);
  }
  if (sniffImage(buffer)) return null;
  return isCsv(buffer) ? 'text/csv' : null;
}

/** A report file or one of the images Pocket keeps, or null for anything else. */
export function sniffAttachment(buffer: Buffer): AttachmentType | null {
  return sniffImage(buffer) ?? sniffReportFile(buffer);
}

/** The extension a served file is named with, from its sniffed type. */
export const EXTENSIONS: Record<AttachmentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  [XLSX_TYPE]: 'xlsx',
  [DOCX_TYPE]: 'docx',
  'text/csv': 'csv',
};

/**
 * A name safe to put in a Content-Disposition header: the base name the
 * browser sent, kept to plain characters, ending in the extension of the type
 * the bytes really are.
 */
export function safeFileName(
  original: string | undefined,
  contentType: AttachmentType,
  fallback: string,
): string {
  const extension = EXTENSIONS[contentType];
  const base = (original?.split(/[\\/]/).at(-1) ?? '')
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '_')
    .replace(/^[ ._]+|[ ._]+$/g, '')
    .slice(0, 80);
  return `${base || fallback}.${extension}`;
}
