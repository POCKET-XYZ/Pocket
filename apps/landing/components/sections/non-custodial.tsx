'use client';

import { useRef } from 'react';
import { Reveal } from '@/components/reveal';
import { gsap, media, useGSAP } from '@/lib/gsap';

const facts = [
  { value: 'USDC', label: 'Se paga en dólares digitales, sin volatilidad.' },
  { value: '< 1¢', label: 'Cuesta cada operación en Stellar.' },
  {
    value: '0 %',
    label: 'Cobra Pocket en el MVP. Trustless Work cobra 0.3 % por operación en mainnet.',
  },
];

const arrow = (
  <li aria-hidden className="self-center text-2xl text-celeste">
    <span className="hidden md:inline">⟶</span>
    <span className="md:hidden">↓</span>
  </li>
);

const render = (name: string) => (
  <img
    src={`/renders/sm/${name}.webp`}
    alt=""
    width={640}
    height={640}
    loading="lazy"
    className="size-16 shrink-0"
  />
);

export function NonCustodial() {
  const flow = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.motion, () => {
        // A coin rides along the top edge of the three boxes as the flow scrolls
        // by: from the startup's wallet into the escrow, then to the specialist.
        const box = flow.current!;
        const at = (key: string) => () => {
          const c = box.getBoundingClientRect();
          const r = box.querySelector(`[data-box="${key}"]`)!.getBoundingClientRect();
          return { x: r.left - c.left + r.width / 2 - 12, y: r.top - c.top - 12 };
        };
        const [startup, escrow, specialist] = [
          at('startup'),
          at('escrow'),
          at('specialist'),
        ];
        gsap
          .timeline({
            defaults: { ease: 'power1.inOut' },
            scrollTrigger: {
              trigger: box,
              start: 'top 75%',
              end: 'bottom 35%',
              scrub: true,
              invalidateOnRefresh: true,
            },
          })
          .fromTo(
            '[data-coin]',
            { x: () => startup().x, y: () => startup().y, autoAlpha: 0, scale: 0.4 },
            { autoAlpha: 1, scale: 1, duration: 0.3 },
          )
          .to('[data-coin]', { x: () => escrow().x, y: () => escrow().y, duration: 1 })
          .to({}, { duration: 0.4 })
          .to('[data-coin]', {
            x: () => specialist().x,
            y: () => specialist().y,
            duration: 1,
          });
      });
      return () => mm.revert();
    },
    { scope: flow },
  );

  return (
    <section className="py-24 md:py-36">
      <Reveal className="wrap" stagger>
        <h2 className="headline-lg max-w-3xl">Pocket nunca toca el dinero.</h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          La startup firma el fondeo y la aprobación desde su wallet. Pocket solo puede
          liberar el pago hacia la wallet del specialist fijada en el escrow.
        </p>
        <div ref={flow} className="relative mt-14">
          <div
            aria-hidden
            data-coin
            className="invisible absolute left-0 top-0 z-10 size-6 rounded-full bg-yellow shadow-[0_0_0_4px_rgb(255_210_63_/_0.25)]"
          />
          <ol className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <li
              data-box="startup"
              className="flex flex-1 items-center gap-4 rounded-2xl border border-off-white/20 p-6"
            >
              {render('wallet')}
              <div>
                <p className="font-heading text-xl font-bold">Wallet de la startup</p>
                <p className="mt-1 text-sm text-muted">Firma y fondea</p>
              </div>
            </li>
            {arrow}
            <li
              data-box="escrow"
              className="flex flex-1 items-center gap-4 rounded-2xl border-2 border-celeste bg-celeste/10 p-6"
            >
              {render('lock')}
              <div>
                <p className="font-heading text-xl font-bold">Escrow en Stellar</p>
                <p className="mt-1 text-sm text-muted">Trustless Work guarda los USDC</p>
              </div>
            </li>
            {arrow}
            <li
              data-box="specialist"
              className="flex flex-1 items-center gap-4 rounded-2xl border border-off-white/20 p-6"
            >
              {render('badge')}
              <div>
                <p className="font-heading text-xl font-bold">Wallet del specialist</p>
                <p className="mt-1 text-sm text-muted">Recibe al aprobar</p>
              </div>
            </li>
          </ol>
        </div>
        <dl className="mt-16 grid gap-10 md:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.value}>
              <dt className="headline-lg text-celeste">{fact.value}</dt>
              <dd className="mt-2 max-w-xs text-muted">{fact.label}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
