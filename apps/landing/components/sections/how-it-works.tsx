const steps = [
  {
    who: 'Startup',
    name: 'Publica un Job',
    text: 'Define el alcance, el presupuesto y la fecha.',
  },
  {
    who: 'Specialist',
    name: 'Aplica',
    text: 'Envía su propuesta, su precio y su tiempo.',
  },
  {
    who: 'Startup',
    name: 'Fondea el escrow',
    text: 'Los USDC quedan bloqueados en Stellar.',
  },
  {
    who: 'Specialist',
    name: 'Entrega por milestone',
    text: 'Sube cada entrega con su evidencia.',
  },
  {
    who: 'Startup',
    name: 'Aprueba y se libera',
    text: 'El pago llega directo a la wallet del specialist.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-16 bg-off-white py-24 text-navy md:py-36"
    >
      <div className="wrap">
        <h2 className="headline-lg max-w-3xl">Cómo funciona</h2>
        <ol className="mt-16 grid gap-10 md:grid-cols-5 md:gap-6">
          {steps.map((step, i) => (
            <li
              key={step.name}
              className="flex flex-col gap-3 border-t-2 border-navy pt-5"
            >
              <span className="font-heading text-4xl font-bold text-navy/25">
                {i + 1}
              </span>
              <p className="text-sm font-medium text-navy/60">{step.who}</p>
              <h3 className="font-heading text-xl font-bold">{step.name}</h3>
              <p className="text-navy/75">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-14 max-w-2xl text-navy/75">
          Si hay desacuerdo, cualquiera de los dos abre una disputa y un manager decide:
          todo para uno, todo para el otro o dividirlo.
        </p>
      </div>
    </section>
  );
}
