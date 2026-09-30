import Link from 'next/link';
import { LEGAL_VERSION } from '@pocket/shared';

/** Where people write about legal and privacy matters. */
export const LEGAL_EMAIL = 'legal@pocket.example';
export const PRIVACY_EMAIL = 'privacy@pocket.example';

/** Layout shared by the Terms of Service and the Privacy Policy. */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl pb-16">
      <h1 className="text-3xl font-bold text-navy md:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective {LEGAL_VERSION}</p>
      <div className="mt-6 rounded-2xl border border-border bg-celeste-light/40 p-5 text-sm leading-relaxed text-navy">
        {summary}
      </div>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground [&_a]:underline [&_h2]:mt-10 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-navy [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-navy [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <p className="mt-12 text-sm text-muted-foreground">
        See also the <Link href="/terms">Terms of Service</Link> and the{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </article>
  );
}
