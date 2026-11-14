'use client';

import { useQuery } from '@tanstack/react-query';
import { ClockIcon, CoinsIcon, SparklesIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatTile } from '@/components/stat-tile';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function AssistantAdminPage() {
  return <RequireAuth roles={['manager']}>{() => <AssistantUsageView />}</RequireAuth>;
}

interface OutcomeCounts {
  accepted: number;
  edited: number;
  discarded: number;
}

/** What GET /manager/assistant/usage answers. */
interface AssistantUsage {
  month: string;
  enabled: boolean;
  model: string;
  spend: {
    usd: number;
    budgetUsd: number;
    share: number;
    perSuggestionUsd: number | null;
  };
  suggestions: Record<
    'job_draft' | 'delivery_report' | 'delivery_review',
    { shown: number; failed: number; refused: number }
  >;
  questions: number;
  people: number;
  outcomes: { resolved: number; noOutcome: number; waiting: number };
  parts: OutcomeCounts & { byPart: Array<OutcomeCounts & { part: string }> };
  byVersion: Array<OutcomeCounts & { version: string; suggestions: number }>;
  failures: Array<{ reason: string; count: number }>;
  latency: { averageMs: number | null; p90Ms: number | null };
}

const KIND_LABELS = {
  job_draft: 'Borradores de trabajo',
  delivery_report: 'Reportes de entrega',
  delivery_review: 'Revisiones de entrega',
} as const;

const PART_LABELS: Record<string, string> = {
  title: 'Título',
  description: 'Descripción',
  deliverables: 'Entregas esperadas',
  milestone: 'Hitos',
  kpi: 'KPIs',
  note: 'Nota de entrega',
};

const REASON_LABELS: Record<string, string> = {
  disabled: 'Asistente apagado',
  not_verified: 'Cuenta sin verificar',
  per_minute: 'Más de 5 por minuto',
  daily: 'Límite del día',
  monthly_budget: 'Tope del mes',
  refusal: 'El modelo no respondió',
  truncated: 'Respuesta cortada',
  timeout: 'Tardó demasiado',
  api_error: 'Error del proveedor',
  invalid_json: 'Respuesta ilegible',
  validation: 'No pasó las revisiones',
  in_progress: 'Quedó a medias',
};

/** The current month and the two before, as AAAA-MM in UTC. */
function recentMonths(): string[] {
  const now = new Date();
  return [0, 1, 2].map((back) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
      .toISOString()
      .slice(0, 7),
  );
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const percent = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : '-';

const usd = (value: number, digits = 2) =>
  `${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} USD`;

function AssistantUsageView() {
  const months = recentMonths();
  const [month, setMonth] = useState(months[0]);
  const usage = useQuery({
    queryKey: ['manager', 'assistant', month],
    queryFn: () => api<AssistantUsage>(`/manager/assistant/usage?month=${month}`),
  });
  const data = usage.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistente"
        description="Cuánto se usó el Asistente de Pocket, cuánto costó y qué hizo la gente con cada sugerencia."
      />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="month" className="text-sm text-muted-foreground">
          Mes
        </label>
        <select
          id="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          {months.map((option) => (
            <option key={option} value={option}>
              {monthLabel(option)}
            </option>
          ))}
        </select>
        {data ? (
          <span className="text-sm text-muted-foreground">
            {data.enabled ? 'Encendido' : 'Apagado'} · {data.model}
          </span>
        ) : null}
      </div>

      {usage.error ? (
        <ErrorAlert error={usage.error} onRetry={() => usage.refetch()} />
      ) : null}
      {!data && !usage.error ? <Loading /> : null}
      {data ? <UsageBody data={data} /> : null}
    </div>
  );
}

function UsageBody({ data }: { data: AssistantUsage }) {
  const shown = Object.values(data.suggestions).reduce(
    (sum, kind) => sum + kind.shown,
    0,
  );
  const totalParts = data.parts.accepted + data.parts.edited + data.parts.discarded;
  const overAlert = data.spend.share >= 0.8;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile
          label="Gasto del mes"
          value={usd(data.spend.usd, 4)}
          hint={`de ${usd(data.spend.budgetUsd)} de tope`}
          meter={Math.min(1, data.spend.share)}
          attention={overAlert}
          icon={CoinsIcon}
        />
        <StatTile
          label="Sugerencias mostradas"
          value={shown}
          hint={`${data.questions} con preguntas de vuelta`}
          icon={SparklesIcon}
        />
        <StatTile label="Personas que lo usaron" value={data.people} icon={UsersIcon} />
        <StatTile
          label="Costo promedio"
          value={
            data.spend.perSuggestionUsd !== null
              ? usd(data.spend.perSuggestionUsd, 4)
              : '-'
          }
          hint={
            data.latency.averageMs !== null
              ? `${(data.latency.averageMs / 1000).toFixed(1)} s en promedio`
              : undefined
          }
          icon={ClockIcon}
        />
      </div>
      {overAlert ? (
        <p className="text-sm font-medium text-amber-800">
          Pasó el 80% del tope del mes. Al llegar al 100% el asistente se apaga solo hasta
          el mes siguiente.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Qué hicieron con las sugerencias</CardTitle>
          <CardDescription>
            Cada parte usada tal cual cuenta como aceptada; cambiada antes de publicar o
            entregar, como editada; no usada, como descartada. Las sugerencias que no
            terminaron en nada van aparte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Share
              label="Aceptadas"
              value={data.parts.accepted}
              total={totalParts}
              tone="good"
            />
            <Share
              label="Editadas"
              value={data.parts.edited}
              total={totalParts}
              tone="neutral"
            />
            <Share
              label="Descartadas"
              value={data.parts.discarded}
              total={totalParts}
              tone="bad"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {data.outcomes.resolved} con resultado · {data.outcomes.noOutcome} sin
            resultado en 7 días · {data.outcomes.waiting} esperando que publiquen o
            entreguen
          </p>
          {data.parts.byPart.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parte</TableHead>
                  <TableHead className="text-right">Aceptadas</TableHead>
                  <TableHead className="text-right">Editadas</TableHead>
                  <TableHead className="text-right">Descartadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.parts.byPart.map((row) => {
                  const total = row.accepted + row.edited + row.discarded;
                  return (
                    <TableRow key={row.part}>
                      <TableCell>{PART_LABELS[row.part] ?? row.part}</TableCell>
                      <TableCell className="text-right">
                        {percent(row.accepted, total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {percent(row.edited, total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {percent(row.discarded, total)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Mostradas</TableHead>
                  <TableHead className="text-right">Fallidas</TableHead>
                  <TableHead className="text-right">Rechazadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map(
                  (kind) => (
                    <TableRow key={kind}>
                      <TableCell>{KIND_LABELS[kind]}</TableCell>
                      <TableCell className="text-right">
                        {data.suggestions[kind].shown}
                      </TableCell>
                      <TableCell className="text-right">
                        {data.suggestions[kind].failed}
                      </TableCell>
                      <TableCell className="text-right">
                        {data.suggestions[kind].refused}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por versión de las instrucciones</CardTitle>
            <CardDescription>
              Para comparar un cambio de instrucciones con el anterior.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.byVersion.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay sugerencias este mes.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Versión</TableHead>
                    <TableHead className="text-right">Sugerencias</TableHead>
                    <TableHead className="text-right">Aceptadas</TableHead>
                    <TableHead className="text-right">Editadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byVersion.map((row) => {
                    const total = row.accepted + row.edited + row.discarded;
                    return (
                      <TableRow key={row.version}>
                        <TableCell className="font-mono text-xs">{row.version}</TableCell>
                        <TableCell className="text-right">{row.suggestions}</TableCell>
                        <TableCell className="text-right">
                          {percent(row.accepted, total)}
                        </TableCell>
                        <TableCell className="text-right">
                          {percent(row.edited, total)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Errores y rechazos</CardTitle>
          <CardDescription>
            Los rechazos no llegan al modelo y no cuestan nada. Las fallas no descuentan
            del límite de la persona.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno este mes.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.failures.map((failure) => (
                <li key={failure.reason} className="flex justify-between gap-4">
                  <span>{REASON_LABELS[failure.reason] ?? failure.reason}</span>
                  <span className="tabular-nums">{failure.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Share({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'good' | 'neutral' | 'bad';
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-3',
        tone === 'good' && 'bg-emerald-50',
        tone === 'neutral' && 'bg-muted/60',
        tone === 'bad' && 'bg-rose-50',
      )}
    >
      <p className="font-heading text-2xl font-bold text-navy">{percent(value, total)}</p>
      <p className="text-sm text-muted-foreground">
        {label} ({value})
      </p>
    </div>
  );
}
