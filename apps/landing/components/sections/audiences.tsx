import { Reveal } from '@/components/reveal';
import { links } from '@/lib/links';

export function Audiences() {
  return (
    <section className="py-24 md:py-36">
      <Reveal className="wrap grid gap-6 md:grid-cols-2" stagger>
        <article
          id="startups"
          className="flex scroll-mt-20 flex-col gap-6 rounded-3xl bg-celeste p-8 text-navy md:p-12"
        >
          <img
            src="/renders/chart.webp"
            alt=""
            width={640}
            height={640}
            loading="lazy"
            className="size-28"
          />
          <h2 className="headline-md">Para startups</h2>
          <ul className="flex flex-col gap-2 text-navy/80">
            <li>Specialists de growth, ventas y marketing ya verificados.</li>
            <li>Pagas por entrega aprobada, no por adelantado.</li>
            <li>Si algo sale mal, un manager media la disputa.</li>
          </ul>
          <a
            href={links.login}
            className="mt-auto w-fit rounded-full bg-navy px-6 py-3 font-medium text-off-white"
          >
            Publicar un Job
          </a>
        </article>
        <article
          id="specialists"
          className="flex scroll-mt-20 flex-col gap-6 rounded-3xl border border-off-white/20 p-8 md:p-12"
        >
          <img
            src="/renders/vetted.webp"
            alt=""
            width={640}
            height={640}
            loading="lazy"
            className="size-28"
          />
          <h2 className="headline-md">Para specialists</h2>
          <ul className="flex flex-col gap-2 text-muted">
            <li>El pago ya está bloqueado antes de que empieces.</li>
            <li>Cobras en USDC directo a tu wallet, cada milestone.</li>
            <li>Startups verificadas, con alcance y fecha definidos.</li>
          </ul>
          <a
            href={links.login}
            className="mt-auto w-fit rounded-full border border-celeste px-6 py-3 font-medium text-celeste"
          >
            Crear mi perfil
          </a>
        </article>
      </Reveal>
    </section>
  );
}
