/**
 * The API's form errors, as people read them. The API validates with
 * class-validator, whose messages name the field as it is in the code
 * (`websiteUrl`) and, for the generic checks, are in English. Each message
 * gets the field's label from the form and a Spanish sentence; anything not
 * recognised is shown as it arrives, so nothing is lost.
 */

/** Field names in the API, by the label the form shows next to them. */
const LABELS: Record<string, string> = {
  // Account details
  fullName: 'Nombre completo',
  contactEmail: 'Correo de contacto',
  country: 'País',
  companyRegistrationId: 'Número de registro',
  note: 'Nota',
  // Startup profile
  companyName: 'Nombre de la empresa',
  legalName: 'Razón social',
  oneLiner: 'Descripción en una línea',
  sector: 'Sector',
  stage: 'Etapa',
  lookingFor: 'Qué buscas',
  websiteUrl: 'Sitio web',
  logoUrl: 'Logo',
  contactRole: 'Tu cargo',
  // Specialist profile
  displayName: 'Nombre',
  headline: 'A qué te dedicas',
  bio: 'Sobre ti',
  categories: 'Categorías',
  skills: 'Habilidades',
  tools: 'Herramientas',
  caseStudies: 'Casos de éxito',
  yearsExperience: 'Años de experiencia',
  languages: 'Idiomas',
  timezone: 'Zona horaria',
  weeklyHours: 'Horas por semana',
  hourlyRate: 'Tarifa por hora',
  minProjectBudget: 'Proyecto mínimo',
  portfolioUrl: 'Portafolio',
  linkedinUrl: 'LinkedIn',
  cvUrl: 'CV',
  avatarUrl: 'Foto',
  location: 'Ubicación',
  socialAccounts: 'Redes',
  niches: 'Nichos',
  audienceCountries: 'Países de la audiencia',
  // Job
  title: 'Título',
  description: 'Descripción',
  category: 'Categoría',
  deliverables: 'Lo que deberías recibir',
  budget: 'Presupuesto',
  deadline: 'Fecha límite',
  revisionRounds: 'Rondas de cambios',
  channel: 'Dónde se publica',
  contentLanguage: 'Idioma',
  startupProvides: 'Lo que pone la startup',
  milestones: 'Hitos',
  kpis: 'KPIs',
  // Application, delivery, dispute, chat
  approach: 'Tu propuesta',
  similarWorkUrl: 'Trabajo parecido',
  needsFromStartup: 'Lo que necesitas de la startup',
  price: 'Precio',
  estimatedDays: 'Días que te toma',
  url: 'Enlace',
  comment: 'Comentario',
  reason: 'Motivo',
  feedback: 'Comentario',
  body: 'Mensaje',
};

/** Fields inside a list item, as the item reads: "Hito 1: fecha de entrega". */
const ITEMS: Record<string, { item: string; fields: Record<string, string> }> = {
  milestones: {
    item: 'Hito',
    fields: {
      title: 'título',
      description: 'qué se entrega',
      acceptanceCriteria: 'qué debe cumplir',
      amount: 'monto',
      dueDate: 'fecha de entrega',
    },
  },
  kpis: {
    item: 'KPI',
    fields: {
      name: 'nombre',
      target: 'meta',
      targetValue: 'meta',
      unit: 'unidad',
      direction: 'dirección',
    },
  },
  caseStudies: { item: 'Caso de éxito', fields: { url: 'enlace', result: 'resultado' } },
  socialAccounts: {
    item: 'Red',
    fields: {
      platform: 'plataforma',
      url: 'enlace',
      followers: 'seguidores',
      avgViews: 'vistas promedio',
    },
  },
};

/** class-validator's English sentences, and how they read in Pocket. */
const SENTENCES: [RegExp, (...groups: string[]) => string][] = [
  [
    /^must be shorter than or equal to (\d+) characters$/,
    (n) => `puede tener hasta ${n} caracteres`,
  ],
  [
    /^must be longer than or equal to (\d+) characters$/,
    (n) => `necesita al menos ${n} caracteres`,
  ],
  [/^should not be empty$/, () => 'es obligatorio'],
  [/^should not be null or undefined$/, () => 'es obligatorio'],
  [
    /^must be a number conforming to the specified constraints$/,
    () => 'tiene que ser un número',
  ],
  [/^must be an integer number$/, () => 'tiene que ser un número entero'],
  [/^must be an email$/, () => 'tiene que ser un correo válido'],
  [/^must not be less than (\S+)$/, (n) => `no puede ser menor que ${n}`],
  [/^must not be greater than (\S+)$/, (n) => `no puede ser mayor que ${n}`],
  [/^must be a string$/, () => 'tiene que ser texto'],
  [/^must be an array$/, () => 'tiene que ser una lista'],
  [/^must contain at least (\d+) elements?$/, (n) => `necesita al menos ${n}`],
  [/^must contain (?:no|not) more than (\d+) elements$/, (n) => `puede tener hasta ${n}`],
  [/^must be one of the following values: .*$/, () => 'tiene un valor que no es válido'],
  [/^must be a valid ISO 8601 date string$/, () => 'tiene que ser una fecha válida'],
  [/^must be a Date instance$/, () => 'tiene que ser una fecha válida'],
  [/^must be a boolean value$/, () => 'tiene que ser sí o no'],
  [/^must be a valid enum value$/, () => 'tiene un valor que no es válido'],
  [/^must be an? URL address$/, () => 'tiene que ser un enlace https://'],
  [/^must be a UUID$/, () => 'no es válido'],
  [/^must match .* regular expression$/, () => 'no tiene el formato correcto'],
];

/** The label of a field path, or null when it is not one the forms show. */
function labelOf(path: string): string | null {
  const parts = path.split('.');
  if (parts.length === 1) return LABELS[path] ?? null;
  const [list, index, field] = parts;
  const known = ITEMS[list];
  if (!known || !/^\d+$/.test(index)) return null;
  const item = `${known.item} ${Number(index) + 1}`;
  if (!field) return item;
  const name = known.fields[field];
  return name ? `${item}: ${name}` : null;
}

function sentence(rest: string): string {
  for (const [pattern, write] of SENTENCES) {
    const match = rest.match(pattern);
    if (match) return write(...match.slice(1));
  }
  return rest;
}

/** One API message as people read it. */
export function readableMessage(message: string): string {
  const text = message.trim();
  const unknownField = text.match(/^property (\S+) should not exist$/);
  if (unknownField) {
    return `${labelOf(unknownField[1]) ?? unknownField[1]} no se puede enviar aquí`;
  }
  const each = text.match(/^each value in (\S+) (.*)$/);
  if (each) {
    const label = labelOf(each[1]);
    if (label) return `${label}: cada uno ${sentence(each[2])}`;
  }
  const field = text.match(/^([a-zA-Z]+(?:\.\d+(?:\.[a-zA-Z]+)?)*) (.*)$/);
  if (field) {
    const label = labelOf(field[1]);
    if (label) return `${label} ${sentence(field[2])}`;
  }
  return text;
}

/** Every message the API sent, one per line and without repeats. */
export function readableMessages(messages: string[]): string {
  return [...new Set(messages.map(readableMessage))].join('\n');
}
