import { ScrollProgress } from '@/components/scroll-progress';

// Step 1 of the landing guide: the base only. The nine sections come in step 3.
export default function Home() {
  return (
    <>
      <ScrollProgress />
      <section className="relative mx-auto flex min-h-svh max-w-6xl flex-col justify-center gap-6 px-4 md:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- the optimizer is off (next.config.ts) */}
        <img
          src="/renders/hero.webp"
          alt=""
          width={640}
          height={640}
          fetchPriority="high"
          className="pointer-events-none absolute right-0 top-1/2 -z-10 hidden w-[min(40vw,480px)] -translate-y-1/2 md:block"
        />
        <p className="eyebrow text-celeste">Pocket</p>
        <h1 className="headline-xl max-w-4xl">
          Talento de growth. Pago garantizado on-chain.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Startups contratan specialists verificados, con cada pago protegido por escrow
          en Stellar.
        </p>
        <a
          href="#base"
          className="w-fit rounded-full bg-yellow px-6 py-3 font-medium text-navy"
        >
          Publicar un Job
        </a>
      </section>
      <section id="base" className="min-h-svh bg-off-white text-navy">
        <div className="mx-auto max-w-6xl px-4 py-24 md:px-6">
          <p className="eyebrow text-navy/70">Base lista</p>
          <h2 className="headline-lg mt-4">Lenis + ScrollTrigger conectados.</h2>
        </div>
      </section>
    </>
  );
}
