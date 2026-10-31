'use client';

import type {
  Deliverable,
  DeliverableAttachment,
  JobKpi,
  KpiOutcome,
} from '@pocket/shared';
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
    return 'Adjunta un PDF, un archivo Excel (.xlsx), Word (.docx) o CSV, o una imagen PNG, JPEG o WebP';
  }
  if (file.size > MAX_FILE_BYTES)
    return 'El archivo es demasiado grande. El límite es 5 MB';
  return null;
}

/** A KPI number as people read it: commas for thousands, a dot for decimals. */
export function kpiNumber(value: string | number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 7 });
}

/** A number with the KPI's unit, e.g. "124 leads". */
export function withUnit(value: string | number, unit: string | null): string {
  return unit ? `${kpiNumber(value)} ${unit}` : kpiNumber(value);
}

type KpiTargetFields = Pick<JobKpi, 'target' | 'targetValue' | 'direction' | 'unit'>;

/**
 * A KPI's target as a sentence: "Al menos 100 leads", "Máximo 5 USDC", a text
 * target from before targets were numbers, or that it is only tracked.
 */
export function kpiTarget(kpi: KpiTargetFields): string {
  if (kpi.targetValue !== null && kpi.direction) {
    const prefix = kpi.direction === 'less_is_better' ? 'Máximo' : 'Al menos';
    return `${prefix} ${withUnit(kpi.targetValue, kpi.unit)}`;
  }
  if (kpi.target) return kpi.unit ? `${kpi.target} (${kpi.unit})` : kpi.target;
  return kpi.unit ? `Solo seguimiento (${kpi.unit})` : 'Solo seguimiento';
}

/**
 * How a number compares with the KPI's target, as the report scores it.
 * `percent` only for a floor ("more is better").
 */
export function kpiOutcome(
  kpi: KpiTargetFields,
  numericValue: string | number | null,
): { outcome: KpiOutcome; percent: number | null } {
  if (kpi.targetValue === null || !kpi.direction)
    return { outcome: 'tracked', percent: null };
  if (numericValue === null || numericValue === '') {
    return { outcome: 'not_measured', percent: null };
  }
  const value = Number(numericValue);
  const target = Number(kpi.targetValue);
  if (kpi.direction === 'less_is_better') {
    return { outcome: value <= target ? 'met' : 'not_met', percent: null };
  }
  return {
    outcome: value >= target ? 'met' : 'not_met',
    percent: target > 0 ? Math.round((value / target) * 100) : null,
  };
}

/** The outcome in words, so it never relies on color alone. */
export function KpiOutcomeBadge({
  outcome,
  percent,
}: {
  outcome: KpiOutcome;
  percent: number | null;
}) {
  if (outcome === 'tracked') return null;
  const styles: Record<Exclude<KpiOutcome, 'tracked'>, string> = {
    met: 'bg-emerald-100 text-emerald-800',
    not_met: 'bg-yellow/40 text-navy',
    not_measured: 'bg-muted text-muted-foreground',
  };
  const labels: Record<Exclude<KpiOutcome, 'tracked'>, string> = {
    met: '✓ Meta cumplida',
    not_met: 'Meta no cumplida',
    not_measured: 'Sin medir todavía',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[outcome]}`}
    >
      {labels[outcome]}
      {percent !== null && outcome !== 'not_measured' ? ` · ${percent} %` : ''}
    </span>
  );
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
          <span className="text-muted-foreground">Meta: {kpiTarget(kpi)}</span>
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
                  <dt className="text-xs text-muted-foreground">Meta</dt>
                  <dd className="break-words">{kpiTarget(kpi)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Resultado</dt>
                  <dd className="break-words font-semibold text-navy">
                    {result.numericValue !== null
                      ? withUnit(result.numericValue, kpi.unit)
                      : result.value}
                  </dd>
                </div>
              </dl>
              <div className="mt-1">
                <KpiOutcomeBadge {...kpiOutcome(kpi, result.numericValue)} />
              </div>
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
          alt={`Archivo adjunto a la versión ${version}`}
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
            ? 'Abriendo...'
            : `${isImage ? 'Ver la imagen adjunta' : `Descargar el ${kind.label} adjunto`} (${fileSize(attachment.size)})`}
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
      toast.success('Archivo adjuntado');
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
          ? 'Subiendo...'
          : deliverable.attachment
            ? 'Reemplazar el archivo adjunto'
            : 'Adjuntar un archivo'}
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
