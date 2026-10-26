import { Reveal } from '@/components/reveal';
import { Magnetic } from '@/components/pointer-motion';
import { links } from '@/lib/links';

export function Closing() {
  return (
    <>
      <section className="pb-24 pt-12 md:pb-36">
        <Reveal className="wrap flex flex-col items-center gap-10 text-center" stagger>
          <img
            src="/renders/sm/hero.webp"
            alt=""
            width={640}
            height={640}
            loading="lazy"
            className="size-32"
          />
          <h2 className="headline-xl max-w-4xl">
            Contrata growth sin miedo. Cobra sin perseguir a nadie.
          </h2>
          <Magnetic>
            <a
              href={links.login}
              className="press block rounded-full bg-yellow px-7 py-3.5 text-lg font-medium text-navy"
            >
              Publicar un Job
            </a>
          </Magnetic>
        </Reveal>
      </section>
      <footer className="border-t border-off-white/10 py-10 text-sm text-muted">
        <div className="wrap flex flex-col justify-between gap-4 md:flex-row">
          <p>
            <span className="font-heading font-bold text-off-white">Pocket</span> · Escrow
            en Stellar con Trustless Work
          </p>
          <p>Hoy funciona en testnet.</p>
        </div>
      </footer>
    </>
  );
}
