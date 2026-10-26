'use client';

import { useEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/reveal';
import { gsap, useGSAP } from '@/lib/gsap';

const scenarios = [
  {
    key: 'confirm',
    label: 'Confirmas el hito',
    caption: 'El contrato envía el pago de ese hito directo a la wallet del experto.',
  },
  {
    key: 'hold',
    label: 'No lo confirmas',
    caption: 'El pago se queda guardado. El experto puede corregir y volver a reportar.',
  },
  {
    key: 'dispute',
    label: 'No se ponen de acuerdo',
    caption:
      'Cualquiera abre una disputa y un manager de Pocket decide: todo para uno, todo para el otro o dividirlo.',
  },
] as const;
type Scenario = (typeof scenarios)[number]['key'];

const rules = [
  {
    name: 'Gente revisada',
    text: 'Un manager revisa a mano cada startup y cada experto.',
  },
  {
    name: 'Reglas que nadie cambia',
    text: 'El dinero solo va al experto o vuelve a la startup.',
  },
  { name: 'Pagas por hito', text: 'Cada parte del trabajo se paga cuando la confirmas.' },
];

function Node({
  id,
  render,
  name,
  note,
  strong,
}: {
  id: string;
  render: string;
  name: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        data-node={id}
        className={`grid size-20 place-items-center rounded-full md:size-28 ${strong ? 'bg-celeste/20 ring-2 ring-celeste' : 'bg-off-white/5 ring-1 ring-off-white/15'}`}
      >
        <img
          src={`/renders/sm/${render}.webp`}
          alt=""
          width={320}
          height={320}
          loading="lazy"
          className="size-12 md:size-16"
        />
      </div>
      <p className="font-heading text-base font-bold md:text-lg">{name}</p>
      <p className="text-xs text-muted md:text-sm">{note}</p>
    </div>
  );
}

export function Protected() {
  const root = useRef<HTMLElement>(null);
  const [scenario, setScenario] = useState<Scenario>('confirm');
  // Plays the scenarios on its own until someone picks one.
  const auto = useRef(true);
  const visible = useRef(false);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), {
      threshold: 0.4,
    });
    io.observe(root.current!);
    const timer = setInterval(() => {
      if (!auto.current || !visible.current) return;
      setScenario((s) => {
        const i = scenarios.findIndex((x) => x.key === s);
        return scenarios[(i + 1) % scenarios.length].key;
      });
    }, 4500);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);

  useGSAP(
    () => {
      const stage = root.current!.querySelector<HTMLElement>('[data-stage]')!;
      // Where the payment sits on a node: over its top-right edge, so it never
      // hides behind the render.
      const at = (id: string) => {
        const s = stage.getBoundingClientRect();
        const r = stage.querySelector(`[data-node="${id}"]`)!.getBoundingClientRect();
        return { x: r.right - s.left - 36, y: r.top - s.top - 6 };
      };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const tl = gsap.timeline({ defaults: { ease: 'power2.inOut', duration: 0.7 } });
      tl.set('[data-coin]', { ...at('contract'), autoAlpha: 1, scale: 1 })
        .set('[data-coin-split]', { ...at('contract'), autoAlpha: 0 })
        .set('[data-manager]', { autoAlpha: scenario === 'dispute' ? 1 : 0.3 })
        .fromTo(
          '[data-caption]',
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.3 },
        );

      if (scenario === 'confirm') {
        tl.to('[data-coin]', { ...at('expert'), delay: 0.3 }).fromTo(
          '[data-node="expert"]',
          { scale: 1 },
          { scale: 1.12, duration: 0.2, yoyo: true, repeat: 1 },
        );
      } else if (scenario === 'hold') {
        tl.to('[data-coin]', {
          x: '+=10',
          duration: 0.08,
          repeat: 5,
          yoyo: true,
          delay: 0.3,
        }).fromTo(
          '[data-node="contract"]',
          { scale: 1 },
          { scale: 1.08, duration: 0.25, yoyo: true, repeat: 1 },
          '<',
        );
      } else {
        tl.to('[data-coin]', { ...at('manager'), delay: 0.3 })
          .set('[data-coin-split]', { ...at('manager'), autoAlpha: 1, scale: 0.8 })
          .to('[data-coin]', { ...at('startup'), scale: 0.8 }, '+=0.3')
          .to('[data-coin-split]', { ...at('expert') }, '<');
      }
      if (reduce) tl.progress(1);
    },
    { scope: root, dependencies: [scenario], revertOnUpdate: true },
  );

  const current = scenarios.find((s) => s.key === scenario)!;

  return (
    <section ref={root} className="py-24 md:py-36">
      <Reveal className="wrap" stagger>
        <h2 className="headline-lg max-w-3xl">
          Tu dinero queda guardado en un contrato.
        </h2>
        <p className="mt-6 max-w-2xl text-xl text-muted">
          Es un contrato inteligente: un programa en la red Stellar que guarda el pago y
          cumple reglas fijas. Nadie puede moverlo por su cuenta, ni siquiera Pocket.
        </p>

        <div className="mt-14 rounded-[2rem] border border-off-white/15 bg-off-white/[0.04] p-6 md:p-10">
          <p className="text-sm font-medium text-muted">¿Qué pasa con el pago si…?</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Escenarios">
            {scenarios.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={s.key === scenario}
                onClick={() => {
                  auto.current = false;
                  setScenario(s.key);
                }}
                className={`press rounded-full px-5 py-2.5 font-medium transition-colors ${
                  s.key === scenario
                    ? 'bg-yellow text-navy'
                    : 'bg-off-white/10 text-off-white hover:bg-off-white/20'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div data-stage className="relative mt-10">
            <div className="grid grid-cols-3 items-start gap-2">
              <Node id="startup" render="wallet" name="Startup" note="Deposita el pago" />
              <Node
                id="contract"
                render="lock"
                name="Contrato"
                note="Guarda 1.500 USDC"
                strong
              />
              <Node
                id="expert"
                render="badge"
                name="Experto"
                note="Recibe al confirmar"
              />
            </div>
            <div data-manager className="mt-6 flex justify-center">
              <Node
                id="manager"
                render="shield"
                name="Manager"
                note="Solo si hay disputa"
              />
            </div>
            <span
              data-coin
              aria-hidden
              className="absolute left-0 top-0 z-10 rounded-full bg-yellow px-3 py-1 text-xs font-bold text-navy shadow-[0_6px_16px_-4px_rgb(0_0_0_/_0.5)] ring-2 ring-navy"
            >
              USDC
            </span>
            <span
              data-coin-split
              aria-hidden
              className="invisible absolute left-0 top-0 z-10 rounded-full bg-yellow px-3 py-1 text-xs font-bold text-navy opacity-0 shadow-[0_6px_16px_-4px_rgb(0_0_0_/_0.5)] ring-2 ring-navy"
            >
              USDC
            </span>
          </div>

          <p data-caption aria-live="polite" className="mt-8 max-w-2xl text-lg">
            {current.caption}
          </p>
        </div>

        <ul className="mt-12 grid gap-8 md:grid-cols-3">
          {rules.map((r) => (
            <li key={r.name} className="border-l-2 border-celeste pl-5">
              <h3 className="font-heading text-xl font-bold">{r.name}</h3>
              <p className="mt-1 text-muted">{r.text}</p>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
