import { Magnetic } from '@/components/pointer-motion';
import { Reveal } from '@/components/reveal';
import { links } from '@/lib/links';

export function Closing() {
  return (
    <>
      <section className="pb-24 pt-24 md:pb-36 md:pt-36">
        <Reveal className="wrap flex flex-col items-center gap-10 text-center" stagger>
          <img
            src="/renders/sm/hero.webp"
            alt=""
            width={320}
            height={320}
            loading="lazy"
            className="size-32"
          />
          <h2 className="headline-xl max-w-4xl">
            Contrata growth sin miedo. Cobra sin perseguir a nadie.
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Magnetic>
              <a
                href={links.startup}
                className="press block rounded-full bg-yellow px-10 py-5 text-xl font-semibold text-navy shadow-[0_10px_30px_-10px_rgb(255_210_63_/_0.6)]"
              >
                Soy startup
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href={links.expert}
                className="press block rounded-full border-2 border-celeste px-10 py-[18px] text-xl font-semibold text-celeste"
              >
                Soy experto
              </a>
            </Magnetic>
          </div>
        </Reveal>
      </section>
      <footer className="border-t border-off-white/10 py-10 text-sm text-muted">
        <div className="wrap flex flex-col justify-between gap-4 md:flex-row">
          <p>
            <span className="font-heading font-bold text-off-white">Pocket</span> ·
            Talento de growth con pago protegido
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <a href={links.terms} className="hover:text-off-white">
              Términos
            </a>
            <a href={links.privacy} className="hover:text-off-white">
              Privacidad
            </a>
            <span>© 2026 Pocket</span>
          </nav>
        </div>
      </footer>
    </>
  );
}
