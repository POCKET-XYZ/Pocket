import type { RawJobDraft } from './schema';
import { checkQuestions, failedParts, finishDraft, hasContent } from './validate';

const milestone = (title: string, weight = 1, extra: Partial<RawJobDraft['milestones'][number]> = {}) => ({
  title,
  description: `Entrega de ${title.toLowerCase()} lista para publicar`,
  acceptance_criteria: ['Formato vertical 9:16', 'Con subtítulos y el logo'],
  weight,
  ...extra,
});

const RAW: RawJobDraft = {
  mode: 'draft',
  language: 'es',
  questions: [],
  title: 'Tres videos cortos para TikTok sobre la app',
  description:
    'Queremos explicar cómo funciona la app de ahorro en grupo con videos cortos, claros y cercanos para TikTok.',
  deliverables: 'Tres videos verticales editados y publicados',
  milestones: [milestone('Guion de los videos', 1), milestone('Video 1', 2), milestone('Videos 2 y 3', 1)],
  kpis: [
    { template_id: 'tpl-1', name: 'vistas en 7 días', unit: null, direction: null },
    { template_id: null, name: 'Clics al enlace', unit: 'clics', direction: 'more_is_better' },
  ],
  warnings: ['Falta indicar el público objetivo.'],
};

const TEMPLATES = [
  {
    id: 'tpl-1',
    kpis: [{ name: 'Vistas en 7 días', targetValue: 1000, direction: 'more_is_better' as const, unit: 'vistas' }],
  },
];

describe('finishDraft', () => {
  it('shares out the budget the company wrote, by weight, adding up exactly', () => {
    const draft = finishDraft(RAW, null, 'Tengo 300 USDC para tres videos', TEMPLATES);
    expect(draft.milestones.map((m) => m.amount)).toEqual([75, 150, 75]);
    expect(draft.budget).toBe(300);
  });

  it('leaves every amount empty without a budget, and says so', () => {
    const draft = finishDraft(RAW, null, 'Quiero tres videos para TikTok', TEMPLATES);
    expect(draft.milestones.every((m) => m.amount === null)).toBe(true);
    expect(draft.budget).toBeNull();
    expect(draft.warnings).toContain('No dijiste tu presupuesto: pon tú los montos de cada hito.');
  });

  it('does not share out a price per video, and asks for the total', () => {
    const draft = finishDraft(RAW, null, '100 USDC por video, son 3', TEMPLATES);
    expect(draft.milestones.every((m) => m.amount === null)).toBe(true);
    expect(draft.warnings).toContain(
      '¿Cuál es tu presupuesto total? Escríbelo para repartirlo entre los hitos.',
    );
  });

  it('asks for USDC instead of converting another currency', () => {
    const draft = finishDraft({ ...RAW, language: 'pt' }, null, 'Tenho R$ 500', TEMPLATES);
    expect(draft.milestones.every((m) => m.amount === null)).toBe(true);
    expect(draft.warnings).toContain(
      'Os pagamentos na Pocket são em USDC: escreva seu orçamento em USDC para dividi-lo.',
    );
  });

  it('copies a KPI from the company template, target included, and keeps a new one without target', () => {
    const draft = finishDraft(RAW, null, 'x', TEMPLATES);
    expect(draft.kpis).toEqual([
      { name: 'Vistas en 7 días', targetValue: 1000, direction: 'more_is_better', unit: 'vistas', templateId: 'tpl-1' },
      { name: 'Clics al enlace', unit: 'clics', direction: 'more_is_better', templateId: null },
    ]);
  });

  it("drops a KPI from a template that is not the company's", () => {
    const raw = { ...RAW, kpis: [{ template_id: 'tpl-other', name: 'Vistas en 7 días', unit: null, direction: null }] };
    expect(finishDraft(raw, null, 'x', TEMPLATES).kpis).toEqual([]);
  });

  it.each([
    ['a hidden date', 'Video listo para el viernes con subtítulos'],
    ['a date of the calendar', 'Entrega el 15 de diciembre'],
    ['money', 'Video 1 por 100 USDC'],
    ['a promised result', 'Video que garantiza 10 mil seguidores'],
    ['a deadline in days', 'Video listo en 5 días'],
    ['a deadline within weeks', 'Entrega dentro de 2 semanas'],
  ])('keeps out a milestone with %s', (_case, title) => {
    const raw = { ...RAW, milestones: [milestone('Guion', 1), milestone(title, 1)] };
    const draft = finishDraft(raw, null, 'Tengo 200 USDC', TEMPLATES);
    expect(draft.milestones.map((m) => m.title)).toEqual(['Guion']);
    // The budget goes to what is left, still adding up.
    expect(draft.milestones[0].amount).toBe(200);
  });

  it('keeps a measuring window, which is not a due date', () => {
    const raw = { ...RAW, milestones: [milestone('Reporte de vistas en 7 días', 1)] };
    expect(finishDraft(raw, null, 'x', TEMPLATES).milestones).toHaveLength(1);
  });

  it('takes a failed part from the second answer when it passes there', () => {
    const first = { ...RAW, title: 'Videos que garantizan ventas en TikTok' };
    const retry = { ...RAW, title: 'Videos cortos para presentar la app en TikTok' };
    expect(failedParts(first)).toEqual(['title']);
    expect(finishDraft(first, retry, 'x', TEMPLATES).title).toBe(retry.title);
  });

  it('leaves a part out when it fails in both answers', () => {
    const first = { ...RAW, description: 'Tienen que estar listos para el lunes sin falta, garantizado.' };
    const draft = finishDraft(first, first, 'x', TEMPLATES);
    expect(draft.description).toBeNull();
    expect(hasContent(draft)).toBe(true);
  });

  it('cuts a text that is too long at a space, and leaves out one too short', () => {
    const raw = { ...RAW, title: 'Corto', deliverables: `Tres videos ${'muy '.repeat(800)}editados` };
    const draft = finishDraft(raw, null, 'x', TEMPLATES);
    expect(draft.title).toBeNull();
    expect(draft.deliverables!.length).toBeLessThanOrEqual(2000);
    expect(draft.deliverables!.endsWith(' ')).toBe(false);
  });

  it('writes the criteria as one line each, as the form holds them', () => {
    const draft = finishDraft(RAW, null, 'x', TEMPLATES);
    expect(draft.milestones[0].acceptanceCriteria).toBe('- Formato vertical 9:16\n- Con subtítulos y el logo');
  });

  it('drops a warning of the model that talks about money or dates', () => {
    const raw = { ...RAW, warnings: ['El presupuesto de 300 USDC es bajo.', 'Falta el público.'] };
    const draft = finishDraft(raw, null, 'Tengo 300 USDC', TEMPLATES);
    expect(draft.warnings).toEqual(['Falta el público.', 'Pon tú las fechas de entrega de cada hito.']);
  });

  it('keeps at most five milestones', () => {
    const raw = { ...RAW, milestones: Array.from({ length: 7 }, (_, i) => milestone(`Video ${i + 1}`, 1)) };
    expect(finishDraft(raw, null, 'x', TEMPLATES).milestones).toHaveLength(5);
  });
});

describe('checkQuestions', () => {
  it('keeps one or two short questions', () => {
    const raw = { ...RAW, mode: 'questions' as const, questions: ['¿Qué quieres que se entregue?', '¿Para qué red?', '¿Algo más?'] };
    expect(checkQuestions(raw)).toEqual(['¿Qué quieres que se entregue?', '¿Para qué red?']);
  });
});
