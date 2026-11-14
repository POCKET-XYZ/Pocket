import type { RawDeliveryReport } from './schema';
import { checkNote, finishReport, reportHasContent, tidyNote } from './validate';

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
// RAW's note as the company reads it: one point per sentence.
const RAW_POINTS =
  '• Publiqué los 3 videos.\n• El primero llegó a 12 mil vistas y el enlace sumó 340 clics.';

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
    expect(checkNote(RAW.note, NOTES)).toBe(RAW_POINTS);
  });

  it('drops a note that says the work is as agreed, which is the company\'s call', () => {
    expect(checkNote('Publiqué los 3 videos según lo acordado.', NOTES)).toBeNull();
    expect(checkNote('I posted the three videos as agreed.', NOTES)).toBeNull();
  });

  it('drops a note that adds courtesies the expert never wrote', () => {
    expect(checkNote('Subí los 3 videos. Quedo a disposición para cualquier consulta.', NOTES)).toBeNull();
  });

  it('drops a note that promises results', () => {
    expect(checkNote('Subí los 3 videos y garantizo que se harán virales.', NOTES)).toBeNull();
  });

  it('takes the note from the second answer when the first made a number up', () => {
    const first = { ...RAW, note: 'Los videos sumaron 20 mil vistas.' };
    const report = finishReport(first, RAW, NOTES, KPIS);
    expect(report.note).toBe(RAW_POINTS);
    expect(reportHasContent(report)).toBe(true);
  });

  it('leaves empty a KPI the notes give only as a range or a percentage', () => {
    const notes = 'Entre 300 y 400 clics. Tasa de instalación del 15%. 9.500 vistas.';
    const raw = { ...RAW, kpi_values: [{ kpi_id: 'k-views', value: 9500 }, { kpi_id: 'k-clicks', value: 300 }, { kpi_id: 'k-installs', value: 15 }] };
    expect(finishReport(raw, null, notes, KPIS).kpis.map((k) => k.value)).toEqual([9500, null, null]);
  });

  it('keeps the note in points, one under the other, marked with "• "', () => {
    const note = '- Publiqué los **3 videos**.\n\n* El primero llegó a 12 mil vistas.\n·  El enlace sumó 340 clics.';
    const tidy = '• Publiqué los 3 videos.\n• El primero llegó a 12 mil vistas.\n• El enlace sumó 340 clics.';
    expect(tidyNote(note)).toBe(tidy);
    expect(checkNote(note, NOTES)).toBe(tidy);
  });

  it('makes every line a point once there are points, and drops a line that only opens the list', () => {
    expect(tidyNote('Publiquei os 3 vídeos.\n• O primeiro teve 7 mil visualizações.')).toBe(
      '• Publiquei os 3 vídeos.\n• O primeiro teve 7 mil visualizações.',
    );
    expect(tidyNote('Estos son los resultados:\n• 9.500 vistas\n• 340 clics')).toBe(
      '• 9.500 vistas\n• 340 clics',
    );
  });

  it('makes each line and each sentence a point when the marks were left out', () => {
    expect(tidyNote('Subí los 3 videos.\n\nEl primero llegó a 12 mil vistas.')).toBe(
      '• Subí los 3 videos.\n• El primero llegó a 12 mil vistas.',
    );
    expect(tidyNote('Publiquei os 3 vídeos. O primeiro teve 7 mil visualizações.')).toBe(
      '• Publiquei os 3 vídeos.\n• O primeiro teve 7 mil visualizações.',
    );
  });

  it('does not split a number or an abbreviation as if a sentence ended there', () => {
    expect(tidyNote('El primero tuvo aprox. 3200 vistas y el segundo 9.500.')).toBe(
      'El primero tuvo aprox. 3200 vistas y el segundo 9.500.',
    );
  });

  it('writes a single point as a sentence, and leaves a hyphen inside a line alone', () => {
    expect(tidyNote('• Publiqué los 3 videos.')).toBe('Publiqué los 3 videos.');
    expect(tidyNote('Subí 2 videos - el primero con 12 mil vistas.')).toBe(
      'Subí 2 videos - el primero con 12 mil vistas.',
    );
  });

  it('still drops a made-up number when the note comes in points', () => {
    expect(checkNote('• Publiqué los 3 videos.\n• Sumaron 50 mil vistas.', NOTES)).toBeNull();
  });

  it('answers in the language of the notes', () => {
    const report = finishReport({ ...RAW, language: 'pt' }, null, NOTES, KPIS);
    expect(report.kpis[2].warning).toBe('Não encontrei este dado nas suas notas.');
  });
});
