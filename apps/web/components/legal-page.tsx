import Link from 'next/link';

/**
 * Where people write about legal and privacy matters. The address is still to
 * be decided, and must be set here before these documents are published.
 */
export const LEGAL_EMAIL = '[correo de contacto pendiente]';
export const PRIVACY_EMAIL = LEGAL_EMAIL;

/** Which network this deployment runs on: the Terms say what that means for money. */
export const ON_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet';

/** The day the version in force took effect, in each language. */
const EFFECTIVE: Record<'es' | 'en', string> = {
  es: 'Vigente desde el 2 de noviembre de 2026',
  en: 'Effective November 2, 2026',
};

const SEE_ALSO = {
  es: {
    terms: 'Términos de Servicio',
    privacy: 'Política de Privacidad',
    prefix: 'Consulta también los',
    and: 'y la',
  },
  en: {
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    prefix: 'See also the',
    and: 'and the',
  },
};

/**
 * Layout shared by the Terms of Service and the Privacy Policy, in Spanish
 * (at /terms and /privacy, the version that prevails) and in English (at
 * /terms/en and /privacy/en).
 */
export function LegalPage({
  lang,
  title,
  summary,
  otherLanguage,
  children,
}: {
  lang: 'es' | 'en';
  title: string;
  summary: React.ReactNode;
  /** The same document in the other language. */
  otherLanguage: string;
  children: React.ReactNode;
}) {
  const base = lang === 'es' ? '' : '/en';
  const see = SEE_ALSO[lang];
  return (
    <article lang={lang} className="mx-auto max-w-3xl pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold text-navy md:text-4xl">{title}</h1>
        <Link
          href={otherLanguage}
          className="text-sm underline"
          hrefLang={lang === 'es' ? 'en' : 'es'}
        >
          {lang === 'es' ? 'Read in English' : 'Leer en español'}
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{EFFECTIVE[lang]}</p>
      <div className="mt-6 rounded-2xl border border-border bg-celeste-light/40 p-5 text-sm leading-relaxed text-navy">
        {summary}
      </div>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground [&_a]:underline [&_h2]:mt-10 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-navy [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-navy [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <p className="mt-12 text-sm text-muted-foreground">
        {see.prefix} <Link href={`/terms${base}`}>{see.terms}</Link> {see.and}{' '}
        <Link href={`/privacy${base}`}>{see.privacy}</Link>.
      </p>
    </article>
  );
}
