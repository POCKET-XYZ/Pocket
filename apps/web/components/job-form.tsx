'use client';

import {
  ServiceCategory,
  type Job,
  type JobKpi,
  type JobKpiInput,
  type JobListing,
  type JobMilestoneInput,
} from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, formValues } from '@/components/form';
import {
  KpiRows,
  MAX_KPIS,
  kpiDrafts,
  kpiInputs,
  repeatedKpi,
  type KpiDraft,
} from '@/components/kpi-rows';
import { KpiTemplateTools } from '@/components/kpi-template-tools';
import { ReportTemplateManager, uploadReportTemplate } from '@/components/report-template';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { REPORT_ACCEPT, reportTemplateProblem } from '@/lib/files';
import { CATEGORY_LABELS, todayIso, usdc } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fromUnits, toUnits } from '@/lib/usdc';

const MAX_MILESTONES = 5;

interface MilestoneDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: string;
  dueDate: string;
}

const EMPTY: MilestoneDraft = {
  title: '',
  description: '',
  acceptanceCriteria: '',
  amount: '',
  dueDate: '',
};

/** What the startup chose to do with the form: post it now, or keep it as a draft. */
type Intent = 'publish' | 'draft';

/** A stored KPI as the form edits it. */
function kpiInputsOf(kpis: JobKpi[]): JobKpiInput[] {
  return kpis.map((kpi) => ({
    name: kpi.name,
    ...(kpi.targetValue !== null && kpi.direction
      ? { targetValue: Number(kpi.targetValue), direction: kpi.direction }
      : {}),
    ...(kpi.target ? { target: kpi.target } : {}),
    ...(kpi.unit ? { unit: kpi.unit } : {}),
  }));
}

/**
 * The job form. Posting a job also means posting how it gets paid: each
 * milestone says what has to be delivered and what it has to meet to be
 * approved, so a specialist knows what unlocks each payment before applying.
 *
 * Without `draft` it posts a new job or saves it as a draft. With `draft` it
 * edits that draft, and can post it in the same step.
 */
export function JobForm({ draft }: { draft?: JobListing }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [budget, setBudget] = useState(draft ? String(Number(draft.budget)) : '');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(
    draft && draft.milestones.length > 0
      ? draft.milestones.map((milestone) => ({
          title: milestone.title,
          description: milestone.description,
          acceptanceCriteria: milestone.acceptanceCriteria ?? '',
          amount: String(Number(milestone.amount)),
          dueDate: milestone.dueDate.slice(0, 10),
        }))
      : [{ ...EMPTY }],
  );
  const [kpis, setKpis] = useState<KpiDraft[]>(
    draft ? kpiDrafts(kpiInputsOf(draft.kpis)) : [],
  );
  const [reportTemplate, setReportTemplate] = useState<File | null>(null);
  const [intent, setIntent] = useState<Intent>('publish');

  const assigned = milestones.reduce((sum, m) => sum + toUnits(m.amount), BigInt(0));
  const remaining = toUnits(budget) - assigned;

  const save = useMutation({
    mutationFn: async ({ body, intent }: { body: Record<string, unknown>; intent: Intent }) => {
      if (draft) {
        await api<Job>(`/jobs/${draft.id}`, { method: 'PUT', body });
        if (intent === 'publish') {
          await api<Job>(`/jobs/${draft.id}/publish`, { method: 'POST' });
        }
        return { id: draft.id, intent };
      }
      const job = await api<Job>('/jobs', {
        method: 'POST',
        body: { ...body, ...(intent === 'draft' ? { draft: true } : {}) },
      });
      if (reportTemplate) {
        try {
          await uploadReportTemplate(job.id, reportTemplate);
        } catch (error) {
          // The job itself is saved; only the file is missing.
          toast.error(
            `${intent === 'draft' ? 'Borrador guardado' : 'Trabajo publicado'}, pero la plantilla de reporte no se subió: ${errorMessage(error)}. Adjúntala de nuevo desde la página del trabajo.`,
          );
        }
      }
      return { id: job.id, intent };
    },
    onSuccess: async ({ id, intent }) => {
      toast.success(
        intent === 'publish'
          ? 'Trabajo publicado'
          : draft
            ? 'Cambios guardados'
            : 'Borrador guardado. Solo tú lo ves hasta que lo publiques.',
      );
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.push(`/jobs/${id}`);
    },
    onError: async (error) => {
      // An edit that saved but could not be posted still changed the draft.
      if (draft) await queryClient.invalidateQueries({ queryKey: ['jobs', draft.id] });
      if (error instanceof ApiError && error.message.includes('perfil')) {
        toast.error(error.message, {
          action: { label: 'Completar perfil', onClick: () => router.push('/profile') },
        });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  function update(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((current) =>
      current.map((milestone, i) =>
        i === index ? { ...milestone, ...patch } : milestone,
      ),
    );
  }

  function onReportTemplateChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    const problem = chosen ? reportTemplateProblem(chosen) : null;
    if (problem) {
      toast.error(problem);
      event.target.value = '';
      setReportTemplate(null);
      return;
    }
    setReportTemplate(chosen);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The button pressed decides; Enter in a field posts, like the first button.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const chosen: Intent =
      submitter instanceof HTMLButtonElement && submitter.value === 'draft'
        ? 'draft'
        : 'publish';
    setIntent(chosen);
    if (remaining !== BigInt(0)) {
      toast.error(`Los hitos deben sumar el presupuesto de ${usdc(budget)}`);
      return;
    }
    const repeated = repeatedKpi(kpis);
    if (repeated) {
      toast.error(`"${repeated}" aparece dos veces como KPI`);
      return;
    }
    const values = formValues(event.currentTarget);
    save.mutate({
      intent: chosen,
      body: {
        title: values.title,
        description: values.description,
        category: values.category,
        deliverables: values.deliverables,
        budget: Number(budget),
        deadline: values.deadline,
        revisionRounds: Number(values.revisionRounds ?? 1),
        ...(values.channel ? { channel: values.channel } : {}),
        ...(values.contentLanguage ? { contentLanguage: values.contentLanguage } : {}),
        ...(values.startupProvides ? { startupProvides: values.startupProvides } : {}),
        milestones: milestones.map(
          (milestone): JobMilestoneInput => ({
            title: milestone.title.trim(),
            description: milestone.description.trim(),
            acceptanceCriteria: milestone.acceptanceCriteria.trim(),
            amount: Number(milestone.amount),
            dueDate: milestone.dueDate,
          }),
        ),
        ...(kpis.length > 0 ? { kpis: kpiInputs(kpis) } : {}),
      },
    });
  }

  const busy = save.isPending;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Título" htmlFor="title" hint="Lo que necesitas, en una línea." required>
            <Input
              id="title"
              name="title"
              required
              minLength={10}
              maxLength={120}
              defaultValue={draft?.title}
            />
          </Field>
          <Field label="Categoría" htmlFor="category" required>
            <select
              id="category"
              name="category"
              required
              defaultValue={draft?.category ?? ''}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>
                Elige una categoría
              </option>
              {Object.values(ServiceCategory).map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Descripción"
            htmlFor="description"
            hint="Objetivo, público, especificaciones y referencias. De 50 a 5000 caracteres."
            required
          >
            <Textarea
              id="description"
              name="description"
              required
              minLength={50}
              maxLength={5000}
              rows={6}
              defaultValue={draft?.description}
              placeholder={
                'Objetivo: qué tiene que lograr este trabajo.\nPúblico: a quién le habla.\nEspecificaciones: duración, formato, subtítulos, estilo.\nReferencias: enlaces que te gusten.\n¿El experto solo entrega o también publica?'
              }
            />
          </Field>
          <Field
            label="Entregas esperadas"
            htmlFor="deliverables"
            hint="Lo que deberías recibir al final."
            required
          >
            <Textarea
              id="deliverables"
              name="deliverables"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              defaultValue={draft?.deliverables}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Presupuesto (USDC)" htmlFor="budget" required>
              <Input
                id="budget"
                name="budget"
                type="number"
                required
                min={1}
                max={1000000}
                step="any"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </Field>
            <Field label="Fecha límite" htmlFor="deadline" required>
              <Input
                id="deadline"
                name="deadline"
                type="date"
                required
                min={todayIso()}
                defaultValue={draft?.deadline.slice(0, 10)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Rondas de cambios"
              htmlFor="revisionRounds"
              hint="Incluidas en el precio."
            >
              <Input
                id="revisionRounds"
                name="revisionRounds"
                type="number"
                min={0}
                max={10}
                defaultValue={draft?.revisionRounds ?? 1}
              />
            </Field>
            <Field label="Canal" htmlFor="channel" hint="Dónde se publica o se usa.">
              <Input
                id="channel"
                name="channel"
                maxLength={120}
                placeholder="TikTok y Reels"
                defaultValue={draft?.channel ?? undefined}
              />
            </Field>
            <Field label="Idioma del contenido" htmlFor="contentLanguage">
              <Input
                id="contentLanguage"
                name="contentLanguage"
                maxLength={60}
                placeholder="Español"
                defaultValue={draft?.contentLanguage ?? undefined}
              />
            </Field>
          </div>

          <Field
            label="Lo que tú aportas"
            htmlFor="startupProvides"
            hint="Guion, marca, logo, acceso a la app: todo con lo que el experto puede contar."
          >
            <Textarea
              id="startupProvides"
              name="startupProvides"
              maxLength={2000}
              rows={2}
              defaultValue={draft?.startupProvides ?? undefined}
            />
          </Field>

          <section className="space-y-3 rounded-2xl border border-border p-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-navy">Plan de pagos</h2>
              <p className="text-sm text-muted-foreground">
                Divide el presupuesto en hasta {MAX_MILESTONES} entregas. Cada una se paga
                cuando la apruebas, así el experto sabe qué libera cada pago.
              </p>
            </div>

            {milestones.map((milestone, index) => (
              <div key={index} className="space-y-3 rounded-xl bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-navy">Hito {index + 1}</p>
                  {milestones.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Quitar hito"
                      onClick={() =>
                        setMilestones((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </div>
                <Input
                  placeholder="Título, por ejemplo Video 1"
                  aria-label={`Título del hito ${index + 1}`}
                  required
                  minLength={3}
                  maxLength={120}
                  value={milestone.title}
                  onChange={(event) => update(index, { title: event.target.value })}
                />
                <Textarea
                  placeholder="Qué se tiene que entregar"
                  aria-label={`Qué se entrega en el hito ${index + 1}`}
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={2}
                  value={milestone.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                />
                <Textarea
                  placeholder="Qué debe cumplir para aprobarse, por ejemplo: vertical, 60 segundos, con subtítulos y el logo"
                  aria-label={`Qué debe cumplir el hito ${index + 1}`}
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={2}
                  value={milestone.acceptanceCriteria}
                  onChange={(event) =>
                    update(index, { acceptanceCriteria: event.target.value })
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    placeholder="Monto (USDC)"
                    aria-label={`Monto del hito ${index + 1}`}
                    required
                    min={0.0000001}
                    step="any"
                    value={milestone.amount}
                    onChange={(event) => update(index, { amount: event.target.value })}
                  />
                  <Input
                    type="date"
                    aria-label={`Fecha de entrega del hito ${index + 1}`}
                    required
                    min={todayIso()}
                    value={milestone.dueDate}
                    onChange={(event) => update(index, { dueDate: event.target.value })}
                  />
                </div>
              </div>
            ))}

            {milestones.length < MAX_MILESTONES ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setMilestones((current) => [
                    ...current,
                    {
                      ...EMPTY,
                      amount: remaining > BigInt(0) ? fromUnits(remaining) : '',
                    },
                  ])
                }
              >
                <PlusIcon /> Agregar hito
              </Button>
            ) : null}

            {budget ? (
              <p
                className={cn(
                  'text-sm',
                  remaining === BigInt(0) ? 'text-emerald-700' : 'text-destructive',
                )}
              >
                {remaining === BigInt(0)
                  ? 'Los hitos suman el presupuesto.'
                  : remaining > BigInt(0)
                    ? `Faltan ${usdc(fromUnits(remaining))} del presupuesto por asignar.`
                    : `${usdc(fromUnits(-remaining))} por encima del presupuesto.`}
              </p>
            ) : null}
          </section>

          <section className="space-y-3 rounded-2xl border border-border p-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-navy">
                Cómo lo vas a medir{' '}
                <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
              </h2>
              <p className="text-sm text-muted-foreground">
                Hasta {MAX_KPIS} KPIs. Los postulantes los ven antes de postularse, y cada
                entrega reporta un resultado para cada uno.
              </p>
            </div>

            <KpiTemplateTools kpis={kpis} onUse={setKpis} />
            <KpiRows kpis={kpis} onChange={setKpis} />
          </section>

          <section className="space-y-3 rounded-2xl border border-border p-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-navy">
                Plantilla de reporte{' '}
                <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
              </h2>
              <p className="text-sm text-muted-foreground">
                El archivo que quieres que el experto complete y adjunte a cada entrega, como
                tu hoja de cálculo de KPIs. Los expertos con su cuenta activa pueden
                descargarlo junto con el brief.
              </p>
            </div>
            {draft ? (
              // Saved on its own, right away, like on the job's page.
              <ReportTemplateManager jobId={draft.id} template={draft.reportTemplate} />
            ) : (
              <Field
                label="Archivo"
                htmlFor="reportTemplate"
                hint="Excel (.xlsx), Word (.docx), PDF o CSV, de hasta 5 MB. No se aceptan archivos con macros (.xlsm, .docm)."
              >
                <Input
                  id="reportTemplate"
                  type="file"
                  accept={REPORT_ACCEPT}
                  onChange={onReportTemplateChosen}
                />
              </Field>
            )}
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" size="lg" value="publish" disabled={busy}>
              {busy && intent === 'publish'
                ? 'Publicando...'
                : draft
                  ? 'Guardar y publicar'
                  : 'Publicar trabajo'}
            </Button>
            <Button type="submit" size="lg" variant="outline" value="draft" disabled={busy}>
              {busy && intent === 'draft'
                ? 'Guardando...'
                : draft
                  ? 'Guardar cambios'
                  : 'Guardar borrador'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {draft
              ? 'Mientras sea borrador, solo tú lo ves. Los expertos lo ven cuando lo publicas.'
              : 'Un borrador queda guardado en Mis publicaciones y solo tú lo ves hasta que lo publiques.'}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
