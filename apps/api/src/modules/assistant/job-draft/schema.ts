/**
 * The exact shape of a job draft, enforced by the API's structured outputs.
 * No field holds a date or an amount: the model gives each milestone a weight
 * and Pocket shares the budget out. Lengths are checked in code, since the
 * schema cannot express them.
 */
export const JOB_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode',
    'language',
    'questions',
    'title',
    'description',
    'deliverables',
    'milestones',
    'kpis',
    'warnings',
  ],
  properties: {
    mode: { type: 'string', enum: ['draft', 'questions'] },
    language: { type: 'string', enum: ['es', 'pt', 'en'] },
    questions: { type: 'array', items: { type: 'string' } },
    title: { type: 'string' },
    description: { type: 'string' },
    deliverables: { type: 'string' },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'acceptance_criteria', 'weight'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          weight: { type: 'integer' },
        },
      },
    },
    kpis: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['template_id', 'name', 'unit', 'direction'],
        properties: {
          template_id: { type: ['string', 'null'] },
          name: { type: 'string' },
          unit: { type: ['string', 'null'] },
          direction: {
            anyOf: [{ type: 'string', enum: ['more_is_better', 'less_is_better'] }, { type: 'null' }],
          },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** The answer as the schema guarantees it, before the checks in code. */
export interface RawJobDraft {
  mode: 'draft' | 'questions';
  language: 'es' | 'pt' | 'en';
  questions: string[];
  title: string;
  description: string;
  deliverables: string;
  milestones: Array<{
    title: string;
    description: string;
    acceptance_criteria: string[];
    weight: number;
  }>;
  kpis: Array<{
    template_id: string | null;
    name: string;
    unit: string | null;
    direction: 'more_is_better' | 'less_is_better' | null;
  }>;
  warnings: string[];
}
