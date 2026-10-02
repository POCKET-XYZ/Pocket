import type { Response } from 'express';
import type { AttachmentType } from './file-type';

/** A private file, ready to be sent. */
export interface PrivateFile {
  data: Buffer;
  contentType: AttachmentType;
  /** Plain characters only, as safeFileName makes it. */
  fileName: string;
}

/**
 * The headers a private file is served with. Only an image may show inline:
 * a PDF, an Office file or a CSV is always saved, never opened as a page of
 * the API, and nothing in it can run.
 */
export function privateFileHeaders(file: PrivateFile): Record<string, string> {
  const disposition = file.contentType.startsWith('image/') ? 'inline' : 'attachment';
  return {
    'Content-Type':
      file.contentType === 'text/csv' ? 'text/csv; charset=utf-8' : file.contentType,
    'Content-Disposition': `${disposition}; filename="${file.fileName}"`,
    'X-Content-Type-Options': 'nosniff',
    // Private to who may read it: no shared cache keeps a copy.
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  };
}

export function sendPrivateFile(res: Response, file: PrivateFile): void {
  res.set(privateFileHeaders(file));
  res.send(file.data);
}
