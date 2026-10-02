'use client';

import type { Deliverable, DeliverableAttachment, JobKpi } from '@pocket/shared';
import { useQueryClient } from '@tanstack/react-query';
import { FileIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { download, errorMessage, upload } from '@/lib/api';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_EXTENSIONS,
  FILE_KINDS,
  MAX_FILE_BYTES,
  extensionOf,
  fileSize,
  saveFile,
} from '@/lib/files';

/** A delivery's file the API would refuse, said before uploading it, or null. */
export function attachmentProblem(file: File): string | null {
  if (!ATTACHMENT_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'Attach a PDF, an Excel (.xlsx), Word (.docx) or CSV file, or a PNG, JPEG or WebP image';
  }
  if (file.size > MAX_FILE_BYTES) return 'The file is too big. The limit is 5 MB';
  return null;
}

/** A KPI's target with its unit, e.g. "50 per month (leads)". */
export function kpiTarget(kpi: JobKpi): string {
  if (!kpi.target) return kpi.unit ? `No target set (${kpi.unit})` : 'No target set';
  return kpi.unit ? `${kpi.target} (${kpi.unit})` : kpi.target;
}

/** What a job is measured on, as the startup listed it. */
export function KpiList({ kpis }: { kpis: JobKpi[] }) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
      {kpis.map((kpi) => (
        <li
          key={kpi.id}
          className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <span className="font-medium text-navy">{kpi.name}</span>
          <span className="text-muted-foreground">Target: {kpiTarget(kpi)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A delivery's results report: each KPI's target next to the result, and the
 * file that backs them. Nothing when the delivery reported neither.
 */
export function KpiReport({
  kpis,
  deliverable,
}: {
  kpis: JobKpi[];
  deliverable: Deliverable;
}) {
  const rows = kpis.flatMap((kpi) => {
    const result = deliverable.kpiResults.find((r) => r.kpiId === kpi.id);
    return result ? [{ kpi, result }] : [];
  });
  if (rows.length === 0 && !deliverable.attachment) return null;

  return (
    <div className="mt-2 space-y-2">
      {rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map(({ kpi, result }) => (
            <li key={kpi.id} className="rounded-lg bg-background px-3 py-2">
              <p className="font-medium text-navy">{kpi.name}</p>
              <dl className="mt-1 grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Target</dt>
                  <dd className="break-words">{kpiTarget(kpi)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Result</dt>
                  <dd className="break-words font-semibold text-navy">{result.value}</dd>
                </div>
              </dl>
              {result.comment ? (
                <p className="mt-1 whitespace-pre-line break-words text-foreground/80">
                  {result.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {deliverable.attachment ? (
        <AttachmentView
          deliverableId={deliverable.id}
          version={deliverable.version}
          attachment={deliverable.attachment}
        />
      ) : null}
    </div>
  );
}

/**
 * The delivery's file. It is private to the contract, so it is fetched with
 * the session rather than linked: an image is shown here, anything else
 * (a PDF, a filled Excel or Word template, a CSV) is saved.
 */
function AttachmentView({
  deliverableId,
  version,
  attachment,
}: {
  deliverableId: string;
  version: number;
  attachment: DeliverableAttachment;
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const kind = FILE_KINDS[attachment.contentType];
  const isImage = attachment.contentType.startsWith('image/');

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function open() {
    setLoading(true);
    try {
      const blob = await download(`/deliverables/${deliverableId}/attachment`);
      if (isImage) {
        // The type the API read from the file, not whatever the response says.
        setPreview(
          URL.createObjectURL(new Blob([blob], { type: attachment.contentType })),
        );
      } else {
        saveFile(blob, attachment.contentType, `delivery-v${version}.${kind.extension}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={`File attached to version ${version}`}
          className="max-h-96 w-auto max-w-full rounded-lg border border-border bg-white object-contain"
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void open()}
        >
          <FileIcon />
          {loading
            ? 'Opening...'
            : `${isImage ? 'Show attached image' : `Download attached ${kind.label}`} (${fileSize(attachment.size)})`}
        </Button>
      )}
    </div>
  );
}

/**
 * Lets the specialist add or replace the file of their latest delivery while
 * the startup has not answered it, for when it did not go up with it.
 */
export function AttachFileButton({
  contractId,
  deliverable,
}: {
  contractId: string;
  deliverable: Deliverable;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function onChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = attachmentProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await upload(`/deliverables/${deliverable.id}/attachment`, 'file', file, '5 MB');
      toast.success('File attached');
      await queryClient.invalidateQueries({ queryKey: ['contracts', contractId] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={busy} asChild>
      <label className="cursor-pointer whitespace-nowrap">
        {busy
          ? 'Uploading...'
          : deliverable.attachment
            ? 'Replace the attached file'
            : 'Attach a file'}
        <input
          type="file"
          accept={ATTACHMENT_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(event) => void onChosen(event)}
        />
      </label>
    </Button>
  );
}
