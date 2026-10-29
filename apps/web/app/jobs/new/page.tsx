'use client';

import { ServiceCategory, type Job, type JobMilestoneInput } from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, formValues } from '@/components/form';
import {
  KpiRows,
  MAX_KPIS,
  kpiInputs,
  repeatedKpi,
  type KpiDraft,
} from '@/components/kpi-rows';
import { KpiTemplateTools } from '@/components/kpi-template-tools';
import { uploadReportTemplate } from '@/components/report-template';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { REPORT_ACCEPT, reportTemplateProblem } from '@/lib/files';
import { CATEGORY_LABELS, todayIso, usdc } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fromUnits, toUnits } from '@/lib/usdc';
import { useMyProfile } from '@/lib/use-my-profile';

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

export default function NewJobPage() {
  return (
    <RequireAuth roles={['startup']} verified>
      {() => <ProfileFirst />}
    </RequireAuth>
  );
}

/** Specialists judge a job by the startup behind it: the profile comes first. */
function ProfileFirst() {
  const profile = useMyProfile();
  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorAlert error={profile.error} />;
  if (!profile.data) {
    return (
      <EmptyState title="Primero completa el perfil de tu startup">
        Los expertos lo leen antes de postularse.
        <div>
          <Button asChild className="mt-4">
            <Link href="/profile">Crear perfil</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }
  return <NewJob />;
}

/**
 * Posting a job also means posting how it gets paid. Each milestone says what
 * has to be delivered and what it has to meet to be approved, so a specialist
 * knows exactly what unlocks each payment before applying.
 */
function NewJob() {
  const router = useRouter();
  const [budget, setBudget] = useState('');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([{ ...EMPTY }]);
  const [kpis, setKpis] = useState<KpiDraft[]>([]);
  const [reportTemplate, setReportTemplate] = useState<File | null>(null);

  const assigned = milestones.reduce((sum, m) => sum + toUnits(m.amount), BigInt(0));
  const remaining = toUnits(budget) - assigned;

  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const job = await api<Job>('/jobs', { method: 'POST', body });
      if (reportTemplate) {
        try {
          await uploadReportTemplate(job.id, reportTemplate);
        } catch (error) {
          // The job itself is posted; only the file is missing.
          toast.error(
            `Trabajo publicado, pero la plantilla de reporte no se subió: ${errorMessage(error)}. Adjúntala de nuevo desde la página del trabajo.`,
          );
        }
      }
      return job;
    },
    onSuccess: async (job) => {
      toast.success('Trabajo publicado');
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.push(`/jobs/${job.id}`);
    },
    onError: (error) => {
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
    create.mutate({
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
      milestones: milestones.map((milestone): JobMilestoneInput => ({
        title: milestone.title.trim(),
        description: milestone.description.trim(),
        acceptanceCriteria: milestone.acceptanceCriteria.trim(),
        amount: Number(milestone.amount),
        dueDate: milestone.dueDate,
      })),
      ...(kpis.length > 0 ? { kpis: kpiInputs(kpis) } : {}),
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Publicar un trabajo"
        description="Di qué necesitas, cómo se paga y qué debe cumplir cada entrega. Los expertos se postulan con una propuesta y un precio."
      />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              label="Título"
              htmlFor="title"
              hint="Lo que necesitas, en una línea."
              required
            >
              <Input id="title" name="title" required minLength={10} maxLength={120} />
            </Field>
            <Field label="Categoría" htmlFor="category" required>
              <select
                id="category"
                name="category"
                required
                defaultValue=""
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
                  defaultValue={1}
                />
              </Field>
              <Field label="Canal" htmlFor="channel" hint="Dónde se publica o se usa.">
                <Input
                  id="channel"
                  name="channel"
                  maxLength={120}
                  placeholder="TikTok y Reels"
                />
              </Field>
              <Field label="Idioma del contenido" htmlFor="contentLanguage">
                <Input
                  id="contentLanguage"
                  name="contentLanguage"
                  maxLength={60}
                  placeholder="Español"
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
              />
            </Field>

            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-navy">
                  Plan de pagos
                </h2>
                <p className="text-sm text-muted-foreground">
                  Divide el presupuesto en hasta {MAX_MILESTONES} entregas. Cada una se
                  paga cuando la apruebas, así el experto sabe qué libera cada pago.
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
                          setMilestones((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Título, por ejemplo Video 1"
                    required
                    minLength={3}
                    maxLength={120}
                    value={milestone.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                  />
                  <Textarea
                    placeholder="Qué se tiene que entregar"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={2}
                    value={milestone.description}
                    onChange={(event) =>
                      update(index, { description: event.target.value })
                    }
                  />
                  <Textarea
                    placeholder="Qué debe cumplir para aprobarse, por ejemplo: vertical, 60 segundos, con subtítulos y el logo"
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
                      required
                      min={0.0000001}
                      step="any"
                      value={milestone.amount}
                      onChange={(event) => update(index, { amount: event.target.value })}
                    />
                    <Input
                      type="date"
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
                <h2 className="font-heading text-lg font-semibold text-navy">
                  Cómo lo vas a medir{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Hasta {MAX_KPIS} KPIs. Los postulantes los ven antes de postularse, y
                  cada entrega reporta un resultado para cada uno.
                </p>
              </div>

              <KpiTemplateTools kpis={kpis} onUse={setKpis} />
              <KpiRows kpis={kpis} onChange={setKpis} />
            </section>

            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-navy">
                  Plantilla de reporte{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  El archivo que quieres que el experto complete y adjunte a cada entrega,
                  como tu hoja de cálculo de KPIs. Los expertos verificados pueden
                  descargarlo junto con el brief.
                </p>
              </div>
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
            </section>

            <Button type="submit" size="lg" disabled={create.isPending}>
              {create.isPending ? 'Publicando...' : 'Publicar trabajo'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
