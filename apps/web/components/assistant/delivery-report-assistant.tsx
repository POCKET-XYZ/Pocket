'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import {
  streamDeliveryReport,
  type AssistantEvent,
  type Quota,
  type SuggestedReport,
} from '@/lib/assistant';

const MAX_CHARS = 4_000;

/** What the report's parts became when the delivery was sent. */
export interface ReportTracking {
  suggestionId: string;
  report: SuggestedReport;
  /** Parts put in the form: `note` and `kpi:N`. */
  used: Set<string>;
}

type Phase =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'writing'; adjusting: boolean }
  | { kind: 'done'; suggestionId: string; report: SuggestedReport }
  | { kind: 'error'; message: string };

/**
 * "¿Te ayudamos a armar el reporte?" inside the delivery dialog: the expert
 * pastes their notes and the Pocket assistant proposes the note for the
 * company and each KPI's result, read only from those notes. The expert uses,
 * edits or discards each part, and still adds the link and sends.
 */
export function DeliveryReportAssistant({
  milestoneId,
  onUseNote,
  onUseResult,
  onTracking,
}: {
  milestoneId: string;
  onUseNote: (note: string, focus: boolean) => void;
  onUseResult: (kpiId: string, value: number) => void;
  onTracking: (tracking: ReportTracking | null) => void;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [notes, setNotes] = useState('');
  const [streamedNote, setStreamedNote] = useState<string | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const quota = useQuery({
    queryKey: ['assistant', 'quota'],
    queryFn: () => api<Quota>('/assistant/quota'),
    staleTime: 60_000,
    enabled: phase.kind !== 'closed',
  });

  if (phase.kind === 'closed') {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        onClick={() => setPhase({ kind: 'open' })}
      >
        <SparklesIcon aria-hidden />
        ¿Te ayudamos a armar el reporte?
      </Button>
    );
  }

  const report = phase.kind === 'done' ? phase.report : null;
  const unavailable =
    quota.data && !quota.data.available ? quota.data.message : undefined;

  function track(nextUsed: Set<string>) {
    setUsed(nextUsed);
    if (phase.kind === 'done') {
      onTracking({
        suggestionId: phase.suggestionId,
        report: phase.report,
        used: nextUsed,
      });
    }
  }

  async function ask() {
    setPhase({ kind: 'writing', adjusting: false });
    setStreamedNote(null);
    setUsed(new Set());
    setDiscarded(new Set());
    onTracking(null);
    const onEvent = (event: AssistantEvent) => {
      if (event.type === 'status') {
        setPhase({ kind: 'writing', adjusting: event.stage === 'adjusting' });
      } else if (event.type === 'part' && event.key === 'note') {
        setStreamedNote(event.value as string);
      } else if (event.type === 'report') {
        setPhase({
          kind: 'done',
          suggestionId: event.suggestionId,
          report: event.report,
        });
        onTracking({
          suggestionId: event.suggestionId,
          report: event.report,
          used: new Set(),
        });
        queryClient.setQueryData<Quota>(['assistant', 'quota'], (current) =>
          current ? { ...current, remainingToday: event.remainingToday } : current,
        );
      } else if (event.type === 'error') {
        setPhase({ kind: 'error', message: event.message });
      }
    };
    try {
      await streamDeliveryReport({ milestoneId, notes }, onEvent);
    } catch (error) {
      setPhase({ kind: 'error', message: errorMessage(error) });
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'quota'] });
    }
  }

  function applyNote(focus: boolean) {
    if (!report?.note) return;
    onUseNote(report.note, focus);
    track(new Set(used).add('note'));
  }

  function applyResult(index: number) {
    const result = report?.kpis[index];
    if (!result || result.value === null) return;
    onUseResult(result.kpiId, result.value);
    track(new Set(used).add(`kpi:${index}`));
  }

  function applyAll() {
    if (!report) return;
    const next = new Set(used);
    if (report.note && !discarded.has('note')) {
      onUseNote(report.note, false);
      next.add('note');
    }
    report.kpis.forEach((result, index) => {
      if (result.value === null || discarded.has(`kpi:${index}`)) return;
      onUseResult(result.kpiId, result.value);
      next.add(`kpi:${index}`);
    });
    track(next);
  }

  const busy = phase.kind === 'writing';
  const note = report ? report.note : streamedNote;

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        <SparklesIcon className="size-4 text-primary" aria-hidden />
        ¿Te ayudamos a armar el reporte?
      </p>
      {unavailable ? (
        <p className="text-sm text-muted-foreground">{unavailable}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Pega tus notas como las tengas. El Asistente de Pocket arma la nota para la
            empresa y lee el resultado de cada KPI, solo de lo que escribiste.
          </p>
          <Textarea
            aria-label="Tus notas"
            rows={4}
            maxLength={MAX_CHARS}
            value={notes}
            disabled={busy}
            placeholder="Por ejemplo: subí los 3 videos, el primero llegó a 12 mil vistas, 340 clics al link..."
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>No pegues datos personales ni contraseñas.</span>
            <span>
              {notes.length.toLocaleString('es')} / {MAX_CHARS.toLocaleString('es')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy || notes.trim().length < 10}
              onClick={() => void ask()}
            >
              {busy ? 'Ordenando...' : report ? 'Ordenar de nuevo' : 'Ordenar mi reporte'}
            </Button>
            {quota.data ? (
              <span className="text-sm text-muted-foreground">
                Te {quota.data.remainingToday === 1 ? 'queda' : 'quedan'}{' '}
                {quota.data.remainingToday}{' '}
                {quota.data.remainingToday === 1 ? 'sugerencia' : 'sugerencias'} hoy
              </span>
            ) : null}
          </div>
        </>
      )}

      {phase.kind === 'error' ? (
        <p className="text-sm text-destructive">{phase.message}</p>
      ) : null}
      {busy ? (
        <p className="text-sm text-muted-foreground" role="status">
          {phase.adjusting ? 'Ajustando la sugerencia...' : 'Ordenando tus notas...'}
        </p>
      ) : null}

      {note && !discarded.has('note') ? (
        <ReportPart
          label="Nota para la empresa"
          inForm={used.has('note')}
          actions={report !== null}
          onUse={() => applyNote(false)}
          onEdit={() => applyNote(true)}
          onDiscard={() => setDiscarded(new Set(discarded).add('note'))}
        >
          <p className="whitespace-pre-line">{note}</p>
        </ReportPart>
      ) : null}

      {report
        ? report.kpis.map((result, index) =>
            discarded.has(`kpi:${index}`) ? null : (
              <ReportPart
                key={result.kpiId}
                label={result.name}
                inForm={used.has(`kpi:${index}`)}
                actions={result.value !== null}
                onUse={() => applyResult(index)}
                onDiscard={() => setDiscarded(new Set(discarded).add(`kpi:${index}`))}
              >
                {result.value !== null ? (
                  <p>{result.value.toLocaleString('es')}</p>
                ) : (
                  <p className="text-amber-700">{result.warning}</p>
                )}
              </ReportPart>
            ),
          )
        : null}

      {report ? (
        <Button type="button" variant="outline" size="sm" onClick={applyAll}>
          Usar todo
        </Button>
      ) : null}
    </div>
  );
}

function ReportPart({
  label,
  inForm,
  actions,
  onUse,
  onEdit,
  onDiscard,
  children,
}: {
  label: string;
  inForm: boolean;
  actions: boolean;
  onUse: () => void;
  onEdit?: () => void;
  onDiscard: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-semibold text-navy">{label}</p>
        <Badge variant={inForm ? 'secondary' : 'outline'}>
          {inForm ? 'En el formulario' : 'Sugerido'}
        </Badge>
      </div>
      {children}
      {actions ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onUse}>
            Usar
          </Button>
          {onEdit ? (
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              Editar
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
            Descartar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The report's parts as they were sent, for the API to compare with what it showed. */
export function reportOutcomeParts(
  tracking: ReportTracking,
  sent: { note: string; results: Record<string, string> },
): Array<{ key: string; used: boolean; final?: string }> {
  const parts: Array<{ key: string; used: boolean; final?: string }> = [];
  if (tracking.report.note) {
    const used = tracking.used.has('note');
    parts.push({ key: 'note', used, ...(used ? { final: sent.note } : {}) });
  }
  tracking.report.kpis.forEach((result, index) => {
    if (result.value === null) return;
    const key = `kpi:${index}`;
    const used = tracking.used.has(key);
    parts.push({
      key,
      used,
      ...(used ? { final: sent.results[result.kpiId] ?? '' } : {}),
    });
  });
  return parts;
}
