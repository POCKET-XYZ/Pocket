'use client';

import { Reveal } from '@/components/reveal';
import { ScrollTrigger } from '@/lib/gsap';

// Which network the app the CTAs open runs on; set per deploy, like the links.
const ON_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet';

const questions = [
  {
    q: '¿Necesito saber de cripto?',
    a: 'No. Entras con tu correo o con Google, y Pocket crea tu wallet por detrás. Pagas y cobras en USDC, un dólar digital: cada USDC equivale a 1 dólar.',
  },
  {
    q: '¿Qué pasa si no me gusta el trabajo?',
    a: 'No apruebas la entrega y el pago sigue guardado. Si no llegan a un acuerdo, cualquiera de los dos abre una disputa y un manager de Pocket decide: todo para uno, todo para el otro o dividirlo.',
  },
  {
    q: '¿Pocket puede quedarse con mi dinero?',
    a: 'No. El pago queda guardado en un contrato en Stellar y solo sale de dos formas: al experto cuando apruebas su entrega, o repartido entre los dos si un manager resuelve una disputa. Pocket solo firma pagos a la startup o al experto de ese contrato, y lo único que recibe es su comisión.',
  },
  {
    q: '¿Cuánto cobra Pocket?',
    a: 'Un 1 % de cada pago que sale del contrato. Trustless Work, la tecnología del contrato, cobra además un 0,3 %. Las dos comisiones se descuentan del pago, así que el experto recibe el 98,7 %.',
  },
  {
    q: '¿Cómo sé con quién estoy trabajando?',
    a: 'Cada startup y cada experto tiene un perfil con lo que hace, sus enlaces y, en los expertos, su CV. Lo revisas antes de contratar o postularte. Y como el pago solo le llega al experto cuando apruebas su entrega, no arriesgas tu dinero con alguien que no cumple.',
  },
  {
    q: '¿Cómo cobro si soy experto?',
    a: 'Cada vez que la startup aprueba una entrega, ese pago llega directo a tu wallet. No tienes que perseguir a nadie.',
  },
  {
    q: '¿Ya puedo usarlo con dinero real?',
    a: ON_MAINNET
      ? 'Sí. Pocket funciona en la red principal de Stellar y los pagos son en USDC real. Cada pago queda registrado en la red y lo puedes revisar cuando quieras.'
      : 'Todavía no. Pocket está en piloto y funciona con dinero de prueba en la red de pruebas de Stellar.',
  },
];

export function Faq() {
  return (
    <section
      id="preguntas"
      className="scroll-mt-20 bg-off-white py-24 text-navy md:py-36"
    >
      <div className="wrap grid gap-12 md:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <h2 className="headline-lg">¿Tienes dudas?</h2>
          <p className="mt-4 text-lg text-navy/75">Aquí van las que más nos hacen.</p>
        </Reveal>
        <Reveal as="div" className="flex flex-col" stagger>
          {questions.map(({ q, a }) => (
            <details
              key={q}
              onToggle={() => ScrollTrigger.refresh()}
              className="group border-b border-navy/15 py-6 first:border-t [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-heading text-xl font-bold">
                {q}
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-xl text-off-white transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-4 max-w-2xl text-lg text-navy/75">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
