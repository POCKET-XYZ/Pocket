import { Magnetic, Tilt } from '@/components/pointer-motion';
import { Reveal } from '@/components/reveal';
import { links } from '@/lib/links';

const gains = [
  'El pago ya está guardado antes de que empieces.',
  'Cobras cada entrega aprobada, directo a tu wallet.',
  'Startups con alcance y fecha claros desde el inicio.',
];

export function Experts() {
  return (
    <section id="expertos" className="scroll-mt-20 py-24 md:py-36">
      <Reveal className="wrap">
        <Tilt>
          <div className="grid items-center gap-10 rounded-[2rem] bg-celeste p-8 text-navy md:grid-cols-[1.4fr_1fr] md:p-16">
            <div>
              <h2 className="headline-lg">
                Trabaja tranquilo. Tu pago ya está guardado.
              </h2>
              <ul className="mt-8 flex flex-col gap-3 text-lg text-navy/80">
                {gains.map((gain) => (
                  <li key={gain} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-2.5 size-2 shrink-0 rounded-full bg-navy"
                    />
                    {gain}
                  </li>
                ))}
              </ul>
              <Magnetic className="mt-10">
                <a
                  href={links.expert}
                  className="press block rounded-full bg-navy px-8 py-4 text-lg font-medium text-off-white"
                >
                  Crear mi perfil de experto
                </a>
              </Magnetic>
            </div>
            <img
              src="/renders/md/vetted.webp"
              alt=""
              width={480}
              height={480}
              loading="lazy"
              className="mx-auto w-1/2 max-w-xs md:w-full"
            />
          </div>
        </Tilt>
      </Reveal>
    </section>
  );
}
