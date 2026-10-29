'use client';

import {
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  afterFees,
  type JobListing,
  type MyApplication,
  type User,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Avatar } from '@/components/avatar';
import { KpiList } from '@/components/contract/kpi-report';
import {
  ReportTemplateButton,
  ReportTemplateManager,
} from '@/components/report-template';
import { Field, formValues } from '@/components/form';
import { Detail, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { useMyProfile } from '@/lib/use-my-profile';
import { CATEGORY_LABELS, date, isoInDays, usdc } from '@/lib/format';

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { user, status } = useAuth();
  const job = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api<JobListing>(`/jobs/${id}`),
  });

  if (job.isLoading) return <Loading />;
  if (job.error || !job.data)
    return <ErrorAlert error={job.error} title="No se encontró el trabajo" />;
  const data = job.data;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <PageHeader
          title={data.title}
          description={
            data.startup ? (
              <Link
                href={`/startups/${data.startupId}`}
                className="inline-flex items-center gap-2 underline"
              >
                <Avatar
                  name={data.startup.companyName}
                  url={data.startup.logoUrl}
                  size={24}
                />
                {data.startup.companyName}
              </Link>
            ) : (
              'Una startup verificada'
            )
          }
        />
        <Card>
          <CardContent className="space-y-6 pt-6">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail label="Presupuesto">{usdc(data.budget)}</Detail>
              <Detail label="Fecha límite">{date(data.deadline)}</Detail>
              <Detail label="Categoría">{CATEGORY_LABELS[data.category]}</Detail>
              <Detail label="Estado">
                <StatusBadge status={data.status} />
              </Detail>
            </dl>
            <section>
              <h2 className="text-lg font-semibold text-navy">Alcance</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                {data.description}
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-navy">Entregas esperadas</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                {data.deliverables}
              </p>
            </section>
            {data.channel || data.contentLanguage || data.startupProvides ? (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {data.channel ? <Detail label="Canal">{data.channel}</Detail> : null}
                {data.contentLanguage ? (
                  <Detail label="Idioma del contenido">{data.contentLanguage}</Detail>
                ) : null}
                <Detail label="Rondas de cambios">{data.revisionRounds}</Detail>
                {data.startupProvides ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Detail label="La startup aporta">{data.startupProvides}</Detail>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {data.kpis.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold text-navy">
                  Cómo se mide el trabajo
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cada entrega reporta un resultado para cada uno de estos KPIs.
                </p>
                <KpiList kpis={data.kpis} />
              </section>
            ) : null}
            {data.reportTemplate ? (
              <section>
                <h2 className="text-lg font-semibold text-navy">Plantilla de reporte</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  La startup quiere que se complete y se adjunte a cada entrega.
                </p>
                <div className="mt-3">
                  {status === 'loading' ? null : user &&
                    (user.id === data.startupId ||
                      user.role === 'manager' ||
                      (user.role === 'specialist' &&
                        user.verificationStatus === 'approved')) ? (
                    <ReportTemplateButton
                      jobId={data.id}
                      template={data.reportTemplate}
                    />
                  ) : (
                    <p className="break-all rounded-xl border border-border p-3 text-sm">
                      {data.reportTemplate.fileName}
                      <span className="block text-muted-foreground">
                        {user
                          ? 'Los expertos verificados pueden descargarla.'
                          : 'Inicia sesión como experto verificado para descargarla.'}
                      </span>
                    </p>
                  )}
                </div>
              </section>
            ) : null}
            {data.milestones.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold text-navy">Plan de pagos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cada hito se paga cuando la startup lo aprueba.
                </p>
                <ol className="mt-3 space-y-3">
                  {data.milestones.map((milestone) => (
                    <li
                      key={milestone.id}
                      className="rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-navy">{milestone.title}</p>
                        <p className="text-muted-foreground">
                          {usdc(milestone.amount)} · entrega el {date(milestone.dueDate)}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-line">{milestone.description}</p>
                      <p className="mt-2 whitespace-pre-line text-muted-foreground">
                        <span className="font-medium text-navy">Para aprobarse: </span>
                        {milestone.acceptanceCriteria}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        {/* Until the session is known, offer nothing rather than the wrong thing. */}
        {status === 'loading' ? null : !user ? (
          <Card>
            <CardHeader>
              <CardTitle>¿Te interesa este trabajo?</CardTitle>
              <CardDescription>
                Conecta tu wallet como experto para postularte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/login">Inicia sesión para postularte</Link>
              </Button>
            </CardContent>
          </Card>
        ) : user.role === 'specialist' ? (
          <ApplyCard job={data} user={user} />
        ) : user.id === data.startupId ? (
          <OwnerCard job={data} />
        ) : null}
      </aside>
    </div>
  );
}

function ApplyCard({ job, user }: { job: JobListing; user: User }) {
  const [price, setPrice] = useState(String(Number(job.budget)));
  const [days, setDays] = useState('');
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => api<MyApplication[]>('/applications/mine'),
  });
  const existing = mine.data?.find((application) => application.jobId === job.id);
  const profile = useMyProfile();

  const apply = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/jobs/${job.id}/applications`, { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Postulación enviada');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'mine'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs', job.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    apply.mutate({
      approach: values.approach,
      ...(values.similarWorkUrl ? { similarWorkUrl: values.similarWorkUrl } : {}),
      ...(values.needsFromStartup ? { needsFromStartup: values.needsFromStartup } : {}),
      price: Number(values.price),
      estimatedDays: Number(values.estimatedDays),
    });
  }

  if (existing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Te postulaste</CardTitle>
          <CardDescription>
            {usdc(existing.price)} en {existing.estimatedDays}{' '}
            {existing.estimatedDays === 1 ? 'día' : 'días'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <StatusBadge feminine status={existing.status} />
          <Button asChild variant="link">
            <Link href="/applications">Mis postulaciones</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.status !== 'open') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ya no recibe postulaciones</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (user.verificationStatus !== 'approved') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verifícate para postularte</CardTitle>
          <CardDescription>
            Un manager de Pocket revisa primero a cada experto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/verification">Ir a la verificación</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // The startup reads the profile to choose: without one there is nothing to send.
  if (profile.isLoading) return null;
  if (!profile.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crea tu perfil para postularte</CardTitle>
          <CardDescription>
            Las startups lo leen para elegir a quién contratar. Toma unos minutos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/profile">Crear perfil</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Postúlate</CardTitle>
        <CardDescription>
          Puedes ofrecer un precio distinto al presupuesto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="¿Cómo lo harías?"
            htmlFor="approach"
            hint="Los pasos que seguirías en este trabajo, no tu historia de vida."
            required
          >
            <Textarea
              id="approach"
              name="approach"
              required
              minLength={50}
              maxLength={5000}
              rows={5}
            />
          </Field>
          <Field
            label="Un trabajo parecido"
            htmlFor="similarWorkUrl"
            hint="Un enlace a algo similar a este trabajo."
          >
            <Input
              id="similarWorkUrl"
              name="similarWorkUrl"
              type="url"
              pattern="https://.+"
              title="Un enlace que empiece con https://"
              placeholder="https://"
            />
          </Field>
          <Field
            label="¿Qué necesitas de la startup?"
            htmlFor="needsFromStartup"
            hint="Marca, accesos, un guion: todo lo que necesitas para empezar."
          >
            <Textarea
              id="needsFromStartup"
              name="needsFromStartup"
              maxLength={2000}
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio (USDC)" htmlFor="price" required>
              <Input
                id="price"
                name="price"
                type="number"
                required
                min={1}
                step="any"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field
              label="Días"
              htmlFor="estimatedDays"
              hint="Se cuentan desde el día en que la startup deposita el pago en el contrato."
              required
            >
              <Input
                id="estimatedDays"
                name="estimatedDays"
                type="number"
                required
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </Field>
          </div>

          <PriceNote price={price} budget={job.budget} />
          <DeadlineNote days={days} deadline={job.deadline} />

          <Button type="submit" className="w-full" disabled={apply.isPending}>
            {apply.isPending ? 'Enviando...' : 'Enviar postulación'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** How the offer compares to the budget, and what is left after the fees. */
function PriceNote({ price, budget }: { price: string; budget: string }) {
  const offered = Number(price);
  const posted = Number(budget);
  if (!Number.isFinite(offered) || offered <= 0) return null;
  const difference = offered - posted;
  const net = usdc(afterFees(offered));
  const fees = `Trustless Work se queda con el ${TRUSTLESS_WORK_FEE_PERCENT}% y Pocket con el ${POCKET_FEE_PERCENT}%, así que recibes ${net}.`;
  return (
    <p className="text-sm text-muted-foreground">
      {difference === 0
        ? `Igual al presupuesto. ${fees}`
        : `${difference > 0 ? '+' : '-'}${usdc(Math.abs(difference))} ${
            difference > 0 ? 'por encima' : 'por debajo'
          } del presupuesto de ${usdc(budget)}. ${fees}`}
    </p>
  );
}

/** Warns when the work would end after the day the startup needs it. */
function DeadlineNote({ days, deadline }: { days: string; deadline: string }) {
  const estimate = Number(days);
  if (!Number.isFinite(estimate) || estimate <= 0) return null;
  const endsOn = isoInDays(estimate);
  if (endsOn <= deadline.slice(0, 10)) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Terminarías después de la fecha límite</AlertTitle>
      <AlertDescription>
        Si empiezas hoy, con {estimate} {estimate === 1 ? 'día' : 'días'} terminas el{' '}
        {date(endsOn)}, después del {date(deadline)} que pidió la startup. Igual puedes
        postularte, pero explica por qué en tu propuesta.
      </AlertDescription>
    </Alert>
  );
}

function OwnerCard({ job }: { job: JobListing }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const close = useMutation({
    mutationFn: () => api(`/jobs/${job.id}/close`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Trabajo cerrado');
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu trabajo</CardTitle>
        <CardDescription>
          {job.applicationCount === 1
            ? '1 postulación hasta ahora.'
            : `${job.applicationCount} postulaciones hasta ahora.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild className="w-full">
          <Link href={`/jobs/${job.id}/applicants`}>Revisar postulantes</Link>
        </Button>
        {job.status === 'open' ? (
          <div className="border-t border-border pt-3">
            <ReportTemplateManager jobId={job.id} template={job.reportTemplate} />
          </div>
        ) : null}
        {job.status === 'open' ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={close.isPending}
            onClick={async () => {
              const confirmed = await confirm({
                title: '¿Cerrar este trabajo?',
                description: 'Las postulaciones que siguen pendientes se rechazarán.',
                confirmText: 'Cerrar trabajo',
                destructive: true,
              });
              if (confirmed) close.mutate();
            }}
          >
            Cerrar trabajo
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
