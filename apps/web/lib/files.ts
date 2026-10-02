import type { AttachmentContentType } from '@pocket/shared';

/** How each kind of file Pocket keeps is called, and its extension. */
export const FILE_KINDS: Record<
  AttachmentContentType,
  { label: string; extension: string }
> = {
  'application/pdf': { label: 'PDF', extension: 'pdf' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    label: 'Excel file',
    extension: 'xlsx',
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    label: 'Word file',
    extension: 'docx',
  },
  'text/csv': { label: 'CSV file', extension: 'csv' },
  'image/png': { label: 'image', extension: 'png' },
  'image/jpeg': { label: 'image', extension: 'jpg' },
  'image/webp': { label: 'image', extension: 'webp' },
};

/** A report template's file: PDF, Excel, Word or CSV. */
export const REPORT_EXTENSIONS = ['xlsx', 'docx', 'pdf', 'csv'];
export const REPORT_ACCEPT = REPORT_EXTENSIONS.map((extension) => `.${extension}`).join(
  ',',
);

/** What a delivery's file can be, as the API checks it. */
export const ATTACHMENT_EXTENSIONS = [...REPORT_EXTENSIONS, 'png', 'jpg', 'jpeg', 'webp'];
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(',');

/** The most a report template or a delivery's file can weigh. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * The extension of a chosen file, lower case. Browsers disagree on the type
 * of a CSV or an Office file (Windows often says a CSV is an Excel file), so
 * the page goes by the name; the API reads the bytes either way.
 */
export function extensionOf(name: string): string {
  return /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** A report template the API would refuse, said before uploading it, or null. */
export function reportTemplateProblem(file: File): string | null {
  if (!REPORT_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'Upload the report template as an Excel (.xlsx), Word (.docx), PDF or CSV file. Macro-enabled files (.xlsm, .docm) are not accepted';
  }
  if (file.size > MAX_FILE_BYTES) return 'The file is too big. The limit is 5 MB';
  return null;
}

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Hand a downloaded file to the browser to save, with its real type and name. */
export function saveFile(blob: Blob, contentType: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([blob], { type: contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
