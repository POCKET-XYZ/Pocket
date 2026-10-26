'use client';

import { Reveal } from '@/components/reveal';
import { ScrollTrigger } from '@/lib/gsap';

const questions = [
  {
    q: '¿Necesito saber de cripto?',
    a: 'No. Entras con tu correo y un código, y Pocket crea tu wallet por detrás. Pagas y cobras en USDC, un dólar digital que siempre vale 1 dólar.',
  },
  {
    q: '¿Qué pasa si no me gusta el trabajo?',
    a: 'No apruebas la entrega y el pago sigue guardado. Si no llegan a un acuerdo, cualquiera de los dos abre una disputa y un manager de Pocket decide: todo para uno, todo para el otro o dividirlo.',
  },
  {
    q: '¿Pocket puede quedarse con mi dinero?',
    a: 'No. El pago se guarda en un contrato en Stellar. Pocket solo puede enviarlo a la wallet del experto que quedó fijada al contratar, y solo cuando tú apruebas.',
  },
  {
    q: '¿Cuánto cobra Pocket?',
    a: 'Nada por ahora. Trustless Work, el servicio que guarda el pago, cobra un 0.3 % por operación.',
  },
  {
    q: '¿Quién revisa a los expertos y a las startups?',
    a: 'Un manager de Pocket revisa a mano cada cuenta antes de que pueda publicar o postular a un trabajo.',
  },
  {
    q: '¿Cómo cobro si soy experto?',
    a: 'Cada vez que la startup aprueba una entrega, ese pago llega directo a tu wallet. No tienes que perseguir a nadie.',
  },
  {
    q: '¿Ya puedo usarlo con dinero real?',
    a: 'Todavía no. Pocket está en piloto y funciona con dinero de prueba en la red de pruebas de Stellar.',
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
