/** The exact shape of a delivery report, enforced by structured outputs. */
export const DELIVERY_REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'note', 'kpi_values'],
  properties: {
    language: { type: 'string', enum: ['es', 'pt', 'en'] },
    note: { type: 'string' },
    kpi_values: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kpi_id', 'value'],
        properties: {
          kpi_id: { type: 'string' },
          value: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const;

export interface RawDeliveryReport {
  language: 'es' | 'pt' | 'en';
  note: string;
  kpi_values: Array<{ kpi_id: string; value: number | null }>;
}
