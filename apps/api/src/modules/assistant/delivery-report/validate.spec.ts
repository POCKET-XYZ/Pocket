import type { RawDeliveryReport } from './schema';
import { checkNote, finishReport, reportHasContent } from './validate';

const NOTES =
  'Subí los 3 videos. El primero llegó a 12 mil vistas, el segundo 8.000 y el tercero va empezando. 340 clics al link de la app.';
const KPIS = [
  { id: 'k-views', name: 'Vistas del primer video', unit: 'vistas' },
  { id: 'k-clicks', name: 'Clics al enlace', unit: 'clics' },
  { id: 'k-installs', name: 'Instalaciones', unit: null },
];
const RAW: RawDeliveryReport = {
  language: 'es',
  note: 'Publiqué los 3 videos. El primero llegó a 12 mil vistas y el enlace sumó 340 clics.',
  kpi_values: [
    { kpi_id: 'k-views', value: 12000 },
    { kpi_id: 'k-clicks', value: 340 },
    { kpi_id: 'k-installs', value: 25 },
  ],
};

describe('finishReport', () => {
  it('keeps the numbers the notes hold, however they were written', () => {
    const report = finishReport(RAW, null, NOTES, KPIS);
    expect(report.kpis.map((k) => k.value)).toEqual([12000, 340, null]);
  });

  it('leaves empty, with a note, a KPI the notes do not give', () => {
    const report = finishReport(RAW, null, NOTES, KPIS);
    expect(report.kpis[2]).toEqual({
      kpiId: 'k-installs',
      name: 'Instalaciones',
      value: null,
      warning: 'No encontré este dato en tus notas.',
    });
  });

  it('lists every KPI of the job, also those the model left out, and none of others', () => {
    const raw = { ...RAW, kpi_values: [{ kpi_id: 'k-other', value: 12000 }] };
    const report = finishReport(raw, null, NOTES, KPIS);
    expect(report.kpis.map((k) => k.kpiId)).toEqual(['k-views', 'k-clicks', 'k-installs']);
    expect(report.kpis.every((k) => k.value === null)).toBe(true);
  });

  it('drops a note that says a number the notes do not hold', () => {
    expect(checkNote('Los videos llegaron a 50 mil vistas en total.', NOTES)).toBeNull();
    expect(checkNote(RAW.note, NOTES)).toBe(RAW.note);
  });

  it('drops a note that promises results', () => {
    expect(checkNote('Subí los 3 videos y garantizo que se harán virales.', NOTES)).toBeNull();
  });

  it('takes the note from the second answer when the first made a number up', () => {
    const first = { ...RAW, note: 'Los videos sumaron 20 mil vistas.' };
    const report = finishReport(first, RAW, NOTES, KPIS);
    expect(report.note).toBe(RAW.note);
    expect(reportHasContent(report)).toBe(true);
  });

  it('leaves empty a KPI the notes give only as a range or a percentage', () => {
    const notes = 'Entre 300 y 400 clics. Tasa de instalación del 15%. 9.500 vistas.';
    const raw = { ...RAW, kpi_values: [{ kpi_id: 'k-views', value: 9500 }, { kpi_id: 'k-clicks', value: 300 }, { kpi_id: 'k-installs', value: 15 }] };
    expect(finishReport(raw, null, notes, KPIS).kpis.map((k) => k.value)).toEqual([9500, null, null]);
  });

  it('answers in the language of the notes', () => {
    const report = finishReport({ ...RAW, language: 'pt' }, null, NOTES, KPIS);
    expect(report.kpis[2].warning).toBe('Não encontrei este dado nas suas notas.');
  });
});
