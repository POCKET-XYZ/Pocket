'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useConfirm } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import {
  streamJobDraft,
  type AssistantEvent,
  type Quota,
  type SuggestedJob,
  type SuggestedKpi,
  type SuggestedMilestone,
  type TextKey,
} from '@/lib/assistant';
import { usdc } from '@/lib/format';

/** The longest text the assistant reads, as the API takes it. */
const MAX_CHARS = 4_000;

/** After this long writing, the screen says it is still adjusting. */
const SLOW_MS = 15_000;

const TEXT_LABELS: Record<TextKey, string> = {
  title: 'Título',
  description: 'Descripción',
  deliverables: 'Entregas esperadas',
};

/** What the panel needs from the job form to fill it in. */
export interface JobFormBridge {
  textOf(key: TextKey): string;
  setText(key: TextKey, value: string, focus: boolean): void;
  /** Puts a milestone in the form and returns the row it went to. */
  putMilestone(milestone: SuggestedMilestone, focus: boolean): number;
  /** Whether any milestone row already has something written. */
  milestonesWritten(): boolean;
  replaceMilestones(milestones: SuggestedMilestone[]): void;
  putKpi(kpi: SuggestedKpi): void;
  budget(): string;
  setBudget(total: number): void;
  category(): string | undefined;
}

/**
 * What the form reports when the job is saved: the suggestion shown, the
 * parts put in the form (a milestone with the row it went to), and the parts
 * discarded. The API compares them with what it showed.
 */
export interface AssistantTracking {
  suggestionId: string;
  draft: SuggestedJob;
  used: Map<string, number | null>;
  discarded: Set<string>;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'writing'; adjusting: boolean; slow: boolean }
  | { kind: 'questions'; questions: string[] }
  | { kind: 'done'; suggestionId: string; draft: SuggestedJob }
  | { kind: 'error'; message: string };

interface Streamed {
  texts: Partial<Record<TextKey, string>>;
  milestones: Array<Omit<SuggestedMilestone, 'amount'>>;
}

/**
 * "¿Te ayudamos a escribirlo?": the company describes what it needs and the
 * Pocket assistant proposes the post, part by part as each is written. Each
 * part can be used, edited or discarded; nothing reaches the form until the
 * company says so, and the form works the same without it.
 */
export function JobDraftAssistant({
  bridge,
  onTracking,
  jobId,
}: {
  bridge: JobFormBridge;
  onTracking: (tracking: AssistantTracking | null) => void;
  jobId?: string;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const quota = useQuery({
    queryKey: ['assistant', 'quota'],
    queryFn: () => api<Quota>('/assistant/quota'),
    staleTime: 60_000,
  });
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [streamed, setStreamed] = useState<Streamed>({ texts: {}, milestones: [] });
  const [used, setUsed] = useState<Map<string, number | null>>(new Map());
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const questionsAsked = useRef<string[] | null>(null);
  const milestonesSeen = useRef(0);

  const busy = phase.kind === 'writing';
  const unavailable =
    quota.data && !quota.data.available ? quota.data.message : undefined;
  // Switched off for everyone, or not answering: the form is shown alone.
  const hidden = !quota.data || quota.data.reason === 'off';

  function track(nextUsed: Map<string, number | null>, nextDiscarded: Set<string>) {
    setUsed(nextUsed);
    setDiscarded(nextDiscarded);
    if (phase.kind === 'done') {
      onTracking({
        suggestionId: phase.suggestionId,
        draft: phase.draft,
        used: nextUsed,
        discarded: nextDiscarded,
      });
    }
  }

  async function ask(followUp?: { questions: string[]; answers: string }) {
    setPhase({ kind: 'writing', adjusting: false, slow: false });
    setStreamed({ texts: {}, milestones: [] });
    milestonesSeen.current = 0;
    setUsed(new Map());
    setDiscarded(new Set());
    onTracking(null);
    const slow = setTimeout(
      () =>
        setPhase((current) =>
          current.kind === 'writing' ? { ...current, slow: true } : current,
        ),
      SLOW_MS,
    );
    const onEvent = (event: AssistantEvent) => {
      if (event.type === 'status') {
        setPhase((current) =>
          current.kind === 'writing'
            ? { ...current, adjusting: event.stage === 'adjusting' }
            : current,
        );
      } else if (event.type === 'part') {
        if (event.key.startsWith('milestone:')) {
          const value = event.value as Omit<SuggestedMilestone, 'amount'>;
          milestonesSeen.current += 1;
          const count = milestonesSeen.current;
          setStreamed((current) => ({
            ...current,
            milestones: [...current.milestones, value],
          }));
          setAnnouncement(`${count} ${count === 1 ? 'hito listo' : 'hitos listos'}`);
        } else {
          const key = event.key as TextKey;
          setStreamed((current) => ({
            ...current,
            texts: { ...current.texts, [key]: event.value as string },
          }));
          setAnnouncement(`${TEXT_LABELS[key]} listo`);
        }
      } else if (event.type === 'questions') {
        questionsAsked.current = event.questions;
        setPhase({ kind: 'questions', questions: event.questions });
        setAnnouncement('El asistente tiene una pregunta');
      } else if (event.type === 'done') {
        setPhase({ kind: 'done', suggestionId: event.suggestionId, draft: event.draft });
        onTracking({
          suggestionId: event.suggestionId,
          draft: event.draft,
          used: new Map(),
          discarded: new Set(),
        });
        setAnnouncement('Borrador listo para revisar');
        queryClient.setQueryData<Quota>(['assistant', 'quota'], (current) =>
          current ? { ...current, remainingToday: event.remainingToday } : current,
        );
      } else if (event.type === 'error') {
        setPhase({ kind: 'error', message: event.message });
      }
    };
    try {
      await streamJobDraft(
        {
          text,
          category: bridge.category(),
          ...(followUp ? { followUp } : {}),
          ...(jobId ? { jobId } : {}),
        },
        onEvent,
      );
    } catch (error) {
      setPhase({ kind: 'error', message: errorMessage(error) });
    } finally {
      clearTimeout(slow);
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'quota'] });
    }
  }

  // --- Using the parts ---------------------------------------------------------

  const draft = phase.kind === 'done' ? phase.draft : null;

  function applyText(key: TextKey, focus: boolean) {
    const value = draft?.[key];
    if (!value) return;
    bridge.setText(key, value, focus);
    track(new Map(used).set(key, null), withoutKey(discarded, key));
  }

  function applyMilestone(index: number, focus: boolean) {
    const milestone = draft?.milestones[index];
    if (!milestone) return;
    const row = bridge.putMilestone(milestone, focus);
    track(
      new Map(used).set(`milestone:${index}`, row),
      withoutKey(discarded, `milestone:${index}`),
    );
  }

  function applyKpi(index: number) {
    const kpi = draft?.kpis[index];
    if (!kpi) return;
    bridge.putKpi(kpi);
    track(new Map(used).set(`kpi:${index}`, null), withoutKey(discarded, `kpi:${index}`));
  }

  function discard(key: string) {
    const nextUsed = new Map(used);
    nextUsed.delete(key);
    track(nextUsed, new Set(discarded).add(key));
  }

  async function applyAll() {
    if (!draft) return;
    const texts = (['title', 'description', 'deliverables'] as const).filter(
      (key) => draft[key] && !discarded.has(key),
    );
    const written = texts.filter((key) => bridge.textOf(key).trim() !== '');
    const replacing = written.length + (bridge.milestonesWritten() ? 1 : 0);
    if (replacing > 0) {
      const confirmed = await confirm({
        title: `¿Reemplazar ${replacing} ${replacing === 1 ? 'parte que ya escribiste' : 'partes que ya escribiste'}?`,
        description: 'Lo que escribiste en esos campos se cambia por la sugerencia.',
        confirmText: 'Reemplazar',
      });
      if (!confirmed) return;
    }
    const nextUsed = new Map(used);
    for (const key of texts) {
      bridge.setText(key, draft[key] as string, false);
      nextUsed.set(key, null);
    }
    const milestones = draft.milestones
      .map((milestone, index) => ({ milestone, index }))
      .filter(({ index }) => !discarded.has(`milestone:${index}`));
    if (milestones.length > 0) {
      bridge.replaceMilestones(milestones.map(({ milestone }) => milestone));
      milestones.forEach(({ index }, row) => nextUsed.set(`milestone:${index}`, row));
    }
    draft.kpis.forEach((kpi, index) => {
      if (discarded.has(`kpi:${index}`) || used.has(`kpi:${index}`)) return;
      bridge.putKpi(kpi);
      nextUsed.set(`kpi:${index}`, null);
    });
    if (draft.budget !== null) bridge.setBudget(draft.budget);
    track(nextUsed, discarded);
  }

  // --- Screen --------------------------------------------------------------------

  const writing = phase.kind === 'writing';
  const shownTexts = (key: TextKey) => (draft ? draft[key] : streamed.texts[key]) ?? null;
  const shownMilestones: Array<
    Omit<SuggestedMilestone, 'amount'> & { amount?: number | null }
  > = draft ? draft.milestones : streamed.milestones;

  if (hidden) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-5 text-primary" aria-hidden />
          ¿Te ayudamos a escribirlo?
        </CardTitle>
        <CardDescription>
          Cuéntale al Asistente de Pocket qué necesitas, con tus palabras. Te propone el
          título, la descripción, los hitos y los KPIs; tú decides qué usar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unavailable ? (
          <p className="text-sm text-muted-foreground">{unavailable}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Textarea
                aria-label="Qué necesitas"
                placeholder="Por ejemplo: necesito 3 videos cortos para TikTok que muestren cómo funciona nuestra app. Tengo 300 USDC."
                rows={4}
                maxLength={MAX_CHARS}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  No pegues datos personales ni contraseñas.{' '}
                  <Link href="/privacy" className="underline">
                    Cómo usamos lo que escribes
                  </Link>
                </span>
                <span>
                  {text.length.toLocaleString('es')} / {MAX_CHARS.toLocaleString('es')}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={busy || text.trim().length < 10}
                onClick={() => void ask()}
              >
                {busy
                  ? 'Escribiendo...'
                  : draft
                    ? 'Proponer otro borrador'
                    : 'Proponer borrador'}
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

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {phase.kind === 'error' ? (
          <p className="text-sm text-destructive">{phase.message}</p>
        ) : null}

        {phase.kind === 'questions' ? (
          <div className="space-y-3 rounded-xl bg-muted/40 p-4">
            <p className="text-sm font-semibold text-navy">
              Antes de proponer, una pregunta:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {phase.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            <Textarea
              aria-label="Tu respuesta"
              rows={3}
              maxLength={2000}
              value={answers}
              onChange={(event) => setAnswers(event.target.value)}
            />
            <Button
              type="button"
              disabled={answers.trim() === ''}
              onClick={() =>
                void ask({
                  questions: questionsAsked.current ?? phase.questions,
                  answers,
                })
              }
            >
              Responder y proponer
            </Button>
          </div>
        ) : null}

        {writing || draft ? (
          <div className="space-y-3">
            {writing ? (
              <p className="text-sm text-muted-foreground" role="status">
                {phase.adjusting || phase.slow
                  ? 'Ajustando la sugerencia...'
                  : 'Escribiendo tu borrador...'}
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Revisa cada parte. Las fechas siempre las pones tú.
                </p>
                <Button type="button" variant="outline" onClick={() => void applyAll()}>
                  Usar todo
                </Button>
              </div>
            )}

            {(['title', 'description', 'deliverables'] as const).map((key) => {
              const value = shownTexts(key);
              if (!value || discarded.has(key)) return null;
              return (
                <SuggestionPart
                  key={key}
                  label={TEXT_LABELS[key]}
                  inForm={used.has(key)}
                  actions={draft !== null}
                  onUse={() => applyText(key, false)}
                  onEdit={() => applyText(key, true)}
                  onDiscard={() => discard(key)}
                >
                  <p className="whitespace-pre-line">{value}</p>
                </SuggestionPart>
              );
            })}

            {shownMilestones.map((milestone, index) =>
              discarded.has(`milestone:${index}`) ? null : (
                <SuggestionPart
                  key={`milestone:${index}`}
                  label={`Hito ${index + 1}: ${milestone.title}`}
                  inForm={used.has(`milestone:${index}`)}
                  actions={draft !== null}
                  onUse={() => applyMilestone(index, false)}
                  onEdit={() => applyMilestone(index, true)}
                  onDiscard={() => discard(`milestone:${index}`)}
                >
                  <p className="whitespace-pre-line">{milestone.description}</p>
                  <p className="mt-2 text-xs font-semibold text-navy">Para aprobarlo</p>
                  <p className="whitespace-pre-line">{milestone.acceptanceCriteria}</p>
                  {draft ? (
                    <p className="mt-2 text-sm">
                      {milestone.amount !== null && milestone.amount !== undefined
                        ? `Monto: ${usdc(milestone.amount)}`
                        : 'Monto: lo pones tú'}
                    </p>
                  ) : null}
                </SuggestionPart>
              ),
            )}
            {writing ? (
              <p className="text-sm text-muted-foreground">
                {shownMilestones.length === 0
                  ? 'Armando hitos...'
                  : 'Armando KPIs y avisos...'}
              </p>
            ) : null}

            {draft && draft.kpis.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-navy">KPIs</p>
                {draft.kpis.map((kpi, index) =>
                  discarded.has(`kpi:${index}`) ? null : (
                    <SuggestionPart
                      key={`kpi:${index}`}
                      label={kpi.name}
                      inForm={used.has(`kpi:${index}`)}
                      actions
                      onUse={() => applyKpi(index)}
                      onDiscard={() => discard(`kpi:${index}`)}
                    >
                      <p>
                        {kpi.templateId ? 'De tus plantillas' : 'Nuevo: pon tú la meta'}
                        {kpi.targetValue !== undefined
                          ? ` · Meta ${kpi.targetValue.toLocaleString('es')}${kpi.unit ? ` ${kpi.unit}` : ''}`
                          : kpi.unit
                            ? ` · En ${kpi.unit}`
                            : ''}
                      </p>
                    </SuggestionPart>
                  ),
                )}
                {draft.kpis.some((kpi) => kpi.templateId === null) ? (
                  <p className="text-xs text-muted-foreground">
                    Si usas los KPIs nuevos, puedes guardarlos como plantilla abajo, en
                    &quot;Cómo lo vas a medir&quot;.
                  </p>
                ) : null}
              </div>
            ) : null}

            {draft && draft.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold">Lo que falta</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {draft.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SuggestionPart({
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
    <div className="rounded-xl border border-border p-3 text-sm">
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

function withoutKey(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  next.delete(key);
  return next;
}

/**
 * The parts as they ended up in what was saved, for the API to compare with
 * what it showed. `final` joins a part's fields one per line, as the API does.
 */
export function outcomeParts(
  tracking: AssistantTracking,
  saved: {
    texts: Record<TextKey, string>;
    milestones: Array<{
      title: string;
      description: string;
      acceptanceCriteria: string;
      amount: string;
    }>;
    kpiNames: string[];
  },
): Array<{ key: string; used: boolean; final?: string }> {
  const parts: Array<{ key: string; used: boolean; final?: string }> = [];
  for (const key of ['title', 'description', 'deliverables'] as const) {
    if (!tracking.draft[key]) continue;
    const used = tracking.used.has(key);
    parts.push({ key, used, ...(used ? { final: saved.texts[key] } : {}) });
  }
  tracking.draft.milestones.forEach((_, index) => {
    const key = `milestone:${index}`;
    const row = tracking.used.get(key);
    const milestone =
      row !== undefined && row !== null ? saved.milestones[row] : undefined;
    parts.push(
      milestone
        ? {
            key,
            used: true,
            final: [
              milestone.title,
              milestone.description,
              milestone.acceptanceCriteria,
              milestone.amount,
            ].join('\n'),
          }
        : { key, used: false },
    );
  });
  tracking.draft.kpis.forEach((kpi, index) => {
    const key = `kpi:${index}`;
    const kept =
      tracking.used.has(key) &&
      saved.kpiNames.some((name) => name.trim().toLowerCase() === kpi.name.toLowerCase());
    parts.push(kept ? { key, used: true, final: kpi.name } : { key, used: false });
  });
  return parts;
}
