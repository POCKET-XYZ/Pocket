'use client';

import type { JobReportTemplate } from '@pocket/shared';
import { useQueryClient } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
import { api, download, errorMessage, upload } from '@/lib/api';
import {
  FILE_KINDS,
  REPORT_ACCEPT,
  fileSize,
  reportTemplateProblem,
  saveFile,
} from '@/lib/files';
import { cn } from '@/lib/utils';

/** Send a report template for a job, after checking it like the API would. */
export async function uploadReportTemplate(jobId: string, file: File): Promise<void> {
  const problem = reportTemplateProblem(file);
  if (problem) throw new Error(problem);
  await upload(`/jobs/${jobId}/report-template`, 'file', file, '5 MB');
}

/**
 * The report template the startup wants filled in, as a download with its
 * name and size. It is not public, so it is fetched with the session.
 */
export function ReportTemplateButton({
  jobId,
  template,
  className,
}: {
  jobId: string;
  template: JobReportTemplate;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const blob = await download(`/jobs/${jobId}/report-template`);
      saveFile(blob, template.contentType, template.fileName);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={loading}
      onClick={() => void onClick()}
      className={cn('h-auto max-w-full justify-start py-2 text-left', className)}
    >
      <DownloadIcon />
      <span className="min-w-0">
        <span className="block font-semibold text-navy">
          {loading ? 'Descargando...' : 'Plantilla de reporte'}
        </span>
        <span className="block whitespace-normal break-all text-xs font-normal text-muted-foreground">
          {template.fileName} · {FILE_KINDS[template.contentType].label},{' '}
          {fileSize(template.size)}
        </span>
      </span>
    </Button>
  );
}

/**
 * Lets the startup attach, replace or remove the job's report template while
 * the job is open.
 */
export function ReportTemplateManager({
  jobId,
  template,
}: {
  jobId: string;
  template: JobReportTemplate | null;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
  }

  async function onChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    try {
      await uploadReportTemplate(jobId, file);
      toast.success(
        template ? 'Plantilla de reporte reemplazada' : 'Plantilla de reporte adjuntada',
      );
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    const confirmed = await confirm({
      title: '¿Quitar la plantilla de reporte de este trabajo?',
      confirmText: 'Quitar',
      destructive: true,
    });
    if (!confirmed) return;
    setBusy('remove');
    try {
      await api(`/jobs/${jobId}/report-template`, { method: 'DELETE' });
      toast.success('Plantilla de reporte quitada');
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy !== null} asChild>
          <label className="cursor-pointer">
            {busy === 'upload'
              ? 'Subiendo...'
              : template
                ? 'Reemplazar plantilla de reporte'
                : 'Adjuntar una plantilla de reporte'}
            <input
              type="file"
              accept={REPORT_ACCEPT}
              className="sr-only"
              disabled={busy !== null}
              onChange={(event) => void onChosen(event)}
            />
          </label>
        </Button>
        {template ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void onRemove()}
          >
            {busy === 'remove' ? 'Quitando...' : 'Quitar'}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        El archivo que quieres que el experto complete y adjunte a cada entrega: Excel
        (.xlsx), Word (.docx), PDF o CSV, de hasta 5 MB. Los expertos con su cuenta activa
        pueden descargarlo.
      </p>
    </div>
  );
}
