import { Reveal } from '@/components/reveal';

const gains = [
  'Expertos que ya hicieron crecer otros productos.',
  'Tú defines qué necesitas y cuánto quieres invertir.',
  'Cada entrega se revisa contra lo que acordaron.',
];

export function NoTeam() {
  return (
    <section id="startups" className="scroll-mt-20 bg-off-white py-24 text-navy md:py-36">
      <div className="wrap grid items-center gap-14 md:grid-cols-[1.2fr_1fr]">
        <Reveal stagger>
          <h2 className="headline-lg max-w-xl">No necesitas un equipo de marketing.</h2>
          <p className="mt-6 max-w-xl text-xl text-navy/75">
            Construiste un buen producto. Pocket te conecta con expertos en growth, ventas
            y marketing para llevarlo al mercado. Tú solo apruebas.
          </p>
          <ul className="mt-10 flex flex-col gap-4">
            {gains.map((gain) => (
              <li key={gain} className="flex items-start gap-3 text-lg">
                <span
                  aria-hidden
                  className="mt-2 size-2.5 shrink-0 rounded-full bg-celeste ring-4 ring-celeste/25"
                />
                {gain}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="mx-auto w-2/3 max-w-sm md:w-full">
          <img
            src="/renders/md/rocket.webp"
            alt="Un cohete celeste despegando"
            width={480}
            height={480}
            loading="lazy"
            className="w-full"
          />
        </Reveal>
      </div>
    </section>
  );
}
