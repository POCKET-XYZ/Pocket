import { links } from '@/lib/links';

export function Hero() {
  return (
    <section id="inicio" className="flex min-h-svh items-center pt-16">
      <div className="wrap grid items-center gap-10 py-16 md:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-8">
          <h1 className="headline-xl">Talento de growth. Pago garantizado on-chain.</h1>
          <p className="max-w-xl text-lg text-muted md:text-xl">
            Startups contratan specialists verificados de growth, ventas y marketing. Cada
            pago queda en escrow en Stellar hasta que el trabajo se aprueba.
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href={links.login}
              className="rounded-full bg-yellow px-7 py-3.5 text-lg font-medium text-navy"
            >
              Publicar un Job
            </a>
            <a
              href="#specialists"
              className="text-lg text-celeste underline-offset-4 hover:underline"
            >
              Soy specialist
            </a>
          </div>
        </div>
        <img
          src="/renders/hero.webp"
          alt="Un bolsillo celeste con una moneda dorada adentro"
          width={640}
          height={640}
          fetchPriority="high"
          className="mx-auto w-2/3 max-w-[480px] md:w-full"
        />
      </div>
    </section>
  );
}
