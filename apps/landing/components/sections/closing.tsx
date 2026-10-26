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
                className="press block rounded-full bg-yellow px-8 py-4 text-lg font-medium text-navy"
              >
                Soy startup
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href={links.expert}
                className="press block rounded-full border-2 border-celeste px-8 py-3.5 text-lg font-medium text-celeste"
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
          <p>© 2026 Pocket</p>
        </div>
      </footer>
    </>
  );
}
