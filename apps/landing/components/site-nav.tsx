import { links } from '@/lib/links';

export function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-navy/80 backdrop-blur-md">
      <nav className="wrap flex h-16 items-center justify-between gap-6">
        <a href="#inicio" className="font-heading text-2xl font-bold text-off-white">
          Pocket
        </a>
        <div className="flex items-center gap-8">
          <ul className="hidden items-center gap-8 text-sm text-muted md:flex">
            <li>
              <a href="#como-funciona" className="hover:text-off-white">
                Cómo funciona
              </a>
            </li>
            <li>
              <a href="#startups" className="hover:text-off-white">
                Startups
              </a>
            </li>
            <li>
              <a href="#specialists" className="hover:text-off-white">
                Specialists
              </a>
            </li>
          </ul>
          <a
            href={links.login}
            className="press rounded-full bg-yellow px-5 py-2.5 text-sm font-medium text-navy"
          >
            Publicar un Job
          </a>
        </div>
      </nav>
    </header>
  );
}
