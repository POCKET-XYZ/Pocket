'use client';

import { useRef } from 'react';
import { gsap, media, useGSAP } from '@/lib/gsap';

const steps = [
  {
    name: 'Publica lo que necesitas',
    text: 'Cuéntanos el objetivo, el presupuesto y la fecha.',
  },
  {
    name: 'Elige a tu experto',
    text: 'Recibe propuestas de expertos revisados y quédate con una.',
  },
  {
    name: 'Deposita el pago',
    text: 'El dinero queda guardado. Nadie puede moverlo por su cuenta.',
  },
  {
    name: 'Aprueba y se paga',
    text: 'Cada entrega que apruebas se paga al momento.',
  },
];

// Illustrative proposals for the demo card; not real people.
const proposals = [
  { initials: 'AR', name: 'Andrea R.', role: 'Growth · 4 años', price: '95 USDC' },
  { initials: 'VM', name: 'Valeria M.', role: 'Contenido y comunidad', price: '90 USDC' },
  { initials: 'JT', name: 'Julián T.', role: 'Ads y performance', price: '120 USDC' },
];

const field = 'rounded-xl bg-off-white px-4 py-3';
const label = 'text-xs font-medium text-navy/60';

/** The demo card: four screens of the app, one per step, stacked in one cell. */
function DemoCard() {
  return (
    <div className="relative order-first rounded-[2rem] bg-white p-6 md:order-none text-navy shadow-[0_24px_60px_-20px_rgb(15_46_82_/_0.35)] md:p-8">
      <div className="mb-6 flex items-center gap-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-navy/15" />
        <span className="size-2.5 rounded-full bg-navy/15" />
        <span className="size-2.5 rounded-full bg-navy/15" />
        <span className="ml-3 font-heading text-sm font-bold text-navy/70">Pocket</span>
      </div>
      <div className="grid [&>*]:[grid-area:1/1]">
        {/* 1. Publish */}
        <div data-panel className="invisible flex flex-col gap-3 opacity-0">
          <p className="font-heading text-xl font-bold">Nuevo trabajo</p>
          <div data-p1-field className={field}>
            <p className={label}>Objetivo</p>
            <p className="font-medium">Conseguir los primeros 1.000 usuarios</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div data-p1-field className={field}>
              <p className={label}>Presupuesto</p>
              <p className="font-medium">90 USDC</p>
            </div>
            <div data-p1-field className={field}>
              <p className={label}>Fecha</p>
              <p className="font-medium">15 de diciembre</p>
            </div>
          </div>
          <span
            data-p1-btn
            className="mt-2 block rounded-full bg-navy py-3 text-center font-medium text-off-white"
          >
            Publicar
          </span>
        </div>

        {/* 2. Choose */}
        <div data-panel className="invisible flex flex-col gap-3 opacity-0">
          <p className="font-heading text-xl font-bold">Propuestas</p>
          {proposals.map((p) => {
            const chosen = p.initials === 'VM';
            return (
              <div
                key={p.initials}
                data-p2-row
                {...(chosen ? { 'data-p2-chosen': '' } : {})}
                className="relative flex items-center gap-4 rounded-xl border-2 border-transparent bg-off-white px-4 py-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-celeste font-heading font-bold">
                  {p.initials}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-navy/60">{p.role}</p>
                </div>
                <p className="text-sm font-medium">{p.price}</p>
                {chosen && (
                  <span
                    data-p2-badge
                    className="absolute -right-2 -top-3 rounded-full bg-yellow px-3 py-1 text-xs font-bold"
                  >
                    Elegida
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 3. Fund: the screen shown without motion, in its final state. */}
        <div data-panel className="relative flex flex-col gap-4">
          <p className="font-heading text-xl font-bold">Depositar el pago</p>
          <div className={field}>
            <p className={label}>Total del trabajo</p>
            <p className="font-heading text-4xl font-bold">90 USDC</p>
            <p className="text-sm text-navy/60">2 entregas: 30 + 60 USDC</p>
          </div>
          <span
            data-p3-btn
            className="relative grid rounded-full bg-yellow py-3 text-center font-medium [&>*]:[grid-area:1/1]"
          >
            <span data-p3-label="idle" className="invisible opacity-0">
              Depositar 90 USDC
            </span>
            <span data-p3-label="done">Depositado</span>
          </span>
          <div
            data-p3-status
            className="flex items-center gap-4 rounded-xl border-2 border-celeste bg-celeste/15 px-4 py-3"
          >
            <img
              data-p3-lock
              src="/renders/sm/lock.webp"
              alt=""
              width={320}
              height={320}
              className="size-14 shrink-0"
            />
            <div>
              <p className="font-heading text-lg font-bold">Pago protegido</p>
              <p className="text-sm text-navy/70">
                Se libera cuando apruebes cada entrega.
              </p>
            </div>
          </div>
          <span
            data-p3-coin
            aria-hidden
            className="invisible absolute left-0 top-0 size-7 rounded-full border-4 border-[#f2b705] bg-yellow opacity-0"
          />
        </div>

        {/* 4. Approve and pay */}
        <div data-panel className="invisible flex flex-col gap-3 opacity-0">
          <p className="font-heading text-xl font-bold">Entregas</p>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-off-white px-4 py-3">
            <div>
              <p className="font-medium">Entrega 1 · Estrategia</p>
              <p className="text-sm text-navy/60">30 USDC</p>
            </div>
            <span className="grid text-sm font-bold [&>*]:[grid-area:1/1]">
              <span
                data-p4-review
                className="rounded-full bg-navy/10 px-3 py-1 text-center"
              >
                En revisión
              </span>
              <span
                data-p4-paid
                className="invisible rounded-full bg-celeste px-3 py-1 text-center opacity-0"
              >
                Pagada
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-off-white px-4 py-3">
            <div>
              <p className="font-medium">Entrega 2 · Campaña</p>
              <p className="text-sm text-navy/60">60 USDC</p>
            </div>
            <span className="rounded-full bg-navy/10 px-3 py-1 text-sm font-bold">
              Guardada
            </span>
          </div>
          <div className="mt-2">
            <p className="text-sm text-navy/70">
              Pagado al experto: <span data-p4-count>0</span> de 90 USDC
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-navy/10">
              <div data-p4-bar className="h-full origin-left scale-x-0 bg-celeste" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          desktop: media.pin,
          mobile: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const q = gsap.utils.selector(root);
          const panels = q('[data-panel]');
          // The active step is marked by its number; the text stays readable.
          const items = q('[data-step-dot]');
          const idle = { backgroundColor: '#d3e6ee', color: '#0f2e52', scale: 1 };
          const active = { backgroundColor: '#0f2e52', color: '#f4fbfd', scale: 1.1 };
          const coin = q('[data-p3-coin]')[0];

          // Start from step 1: everything after it hidden or undone.
          gsap.set(panels, { autoAlpha: 0 });
          gsap.set(panels[0], { autoAlpha: 1 });
          gsap.set(items, idle);
          gsap.set(items[0], active);
          gsap.set('[data-p3-label="idle"]', { autoAlpha: 1 });
          gsap.set('[data-p3-label="done"], [data-p3-status]', { autoAlpha: 0 });

          // Where the coin falls: from the deposit button into the lock.
          const from = () => {
            const card = panels[2].getBoundingClientRect();
            const btn = q('[data-p3-btn]')[0].getBoundingClientRect();
            return {
              x: btn.left - card.left + btn.width / 2 - 14,
              y: btn.top - card.top,
            };
          };
          const to = () => {
            const card = panels[2].getBoundingClientRect();
            const lock = q('[data-p3-lock]')[0].getBoundingClientRect();
            return {
              x: lock.left - card.left + lock.width / 2 - 14,
              y: lock.top - card.top + lock.height / 2 - 14,
            };
          };

          const tl = gsap.timeline({
            defaults: { ease: 'power2.out', duration: 0.4 },
            ...(ctx.conditions!.desktop
              ? {
                  scrollTrigger: {
                    trigger: root.current,
                    start: 'top top',
                    end: '+=300%',
                    pin: true,
                    scrub: 0.5,
                    invalidateOnRefresh: true,
                  },
                }
              : {
                  repeat: -1,
                  repeatDelay: 1.5,
                  scrollTrigger: {
                    trigger: root.current,
                    start: 'top 70%',
                    end: 'bottom top',
                    toggleActions: 'play pause resume pause',
                  },
                }),
          });

          const go = (i: number) =>
            tl
              .to(panels[i - 1], { autoAlpha: 0, y: -16, duration: 0.3 }, '+=0.6')
              .fromTo(
                panels[i],
                { autoAlpha: 0, y: 16 },
                { autoAlpha: 1, y: 0, duration: 0.35 },
                '<0.1',
              )
              .to(items[i - 1], { ...idle, duration: 0.3 }, '<')
              .to(items[i], { ...active, duration: 0.3 }, '<');

          // 1. The form fills in and gets published.
          tl.from('[data-p1-field]', { autoAlpha: 0, y: 12, stagger: 0.2 }).to(
            '[data-p1-btn]',
            { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1 },
            '+=0.2',
          );

          // 2. Proposals arrive and one is chosen.
          go(1)
            .from('[data-p2-row]', { autoAlpha: 0, x: 24, stagger: 0.15 })
            .to('[data-p2-chosen]', { borderColor: '#86d4e6', scale: 1.03 }, '+=0.3')
            .from(
              '[data-p2-badge]',
              { scale: 0, autoAlpha: 0, ease: 'back.out(2)' },
              '<',
            );

          // 3. The deposit: a press, a coin into the lock, the money is protected.
          go(2)
            .to(
              '[data-p3-btn]',
              { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1 },
              '+=0.3',
            )
            .fromTo(
              coin,
              { x: () => from().x, y: () => from().y, autoAlpha: 0, scale: 0.6 },
              { autoAlpha: 1, scale: 1, duration: 0.15 },
            )
            .to(coin, {
              x: () => to().x,
              y: () => to().y,
              duration: 0.6,
              ease: 'power2.in',
            })
            .to(coin, { autoAlpha: 0, scale: 0.4, duration: 0.15 })
            .to('[data-p3-label="idle"]', { autoAlpha: 0, duration: 0.2 }, '<')
            .to('[data-p3-label="done"]', { autoAlpha: 1, duration: 0.2 }, '<')
            .fromTo(
              '[data-p3-status]',
              { autoAlpha: 0, y: 12 },
              { autoAlpha: 1, y: 0 },
              '<-0.5',
            )
            .from(
              '[data-p3-lock]',
              { scale: 0.5, ease: 'back.out(2)', duration: 0.5 },
              '<',
            );

          // 4. The first delivery is approved and paid; the rest stays saved.
          const paid = { usdc: 0 };
          go(3)
            .to('[data-p4-review]', { autoAlpha: 0, duration: 0.2 }, '+=0.4')
            .fromTo(
              '[data-p4-paid]',
              { autoAlpha: 0, scale: 0.8 },
              { autoAlpha: 1, scale: 1, ease: 'back.out(2)' },
              '<',
            )
            .fromTo('[data-p4-bar]', { scaleX: 0 }, { scaleX: 1 / 3, duration: 0.6 }, '<')
            .to(
              paid,
              {
                usdc: 30,
                duration: 0.6,
                onUpdate: () => {
                  q('[data-p4-count]')[0].textContent = String(Math.round(paid.usdc));
                },
              },
              '<',
            )
            .to({}, { duration: 1 });
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="como-funciona"
      className="flex min-h-svh scroll-mt-20 items-center bg-off-white py-24 text-navy md:py-28"
    >
      <div className="wrap grid items-center gap-14 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="headline-lg">Cómo funciona</h2>
          <p className="mt-4 max-w-md text-lg text-navy/75">
            Cuatro pasos, y tu dinero protegido en todo momento.
          </p>
          <ol className="mt-10 flex flex-col gap-6">
            {steps.map((step, i) => (
              <li key={step.name} className="flex gap-5">
                <span
                  data-step-dot
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-navy font-heading text-lg font-bold text-off-white"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-heading text-xl font-bold">{step.name}</h3>
                  <p className="mt-1 text-navy/75">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <DemoCard />
      </div>
    </section>
  );
}
