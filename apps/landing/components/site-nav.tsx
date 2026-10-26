import { links } from '@/lib/links';

const sections = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#startups', label: 'Para startups' },
  { href: '#expertos', label: 'Para expertos' },
  { href: '#preguntas', label: 'Preguntas' },
];

export function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-navy/85 backdrop-blur-md">
      <nav className="wrap flex h-20 items-center justify-between gap-6">
        <a href="#inicio" className="font-heading text-3xl font-bold text-off-white">
          Pocket
        </a>
        <div className="flex items-center gap-10">
          <ul className="hidden items-center gap-8 text-base text-muted lg:flex">
            {sections.map((s) => (
              <li key={s.href}>
                <a href={s.href} className="transition-colors hover:text-off-white">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={links.login}
            className="press rounded-full bg-yellow px-7 py-3 text-base font-medium text-navy"
          >
            Inicio
          </a>
        </div>
      </nav>
    </header>
  );
}
