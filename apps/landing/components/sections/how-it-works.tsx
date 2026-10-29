'use client';

import { useRef } from 'react';
import { Reveal } from '@/components/reveal';
import { scrollToY } from '@/components/smooth-scroll';
import { gsap, media, useGSAP } from '@/lib/gsap';

const steps = [
  {
    name: 'Publicar y elegir',
    who: 'Startup',
    text: 'Publica el resultado que esperas y elige entre expertos seleccionados por Pocket.',
  },
  {
    name: 'Acordar',
    who: 'Los dos',
    text: 'Cada hito queda con una meta medible y su monto.',
  },
  {
    name: 'Asegurar',
    who: 'Startup',
    text: 'El pago se guarda en un contrato antes de empezar.',
  },
  {
    name: 'Verificar',
    who: 'Los dos',
    text: 'El experto reporta, tú confirmas y se libera el pago.',
  },
];

// Illustrative proposals and milestones for the demo card; not real people.
const proposals = [
  { initials: 'AR', name: 'Andrea R.', role: 'Growth', price: '1.400 USDC' },
  {
    initials: 'VM',
    name: 'Valeria M.',
    role: 'Contenido y comunidad',
    price: '1.500 USDC',
  },
  { initials: 'JT', name: 'Julián T.', role: 'Ads y performance', price: '1.650 USDC' },
];
const milestones = [
  {
    id: '1',
    name: 'Hito 1 · Estrategia y contenido',
    goal: 'Plan de lanzamiento y 20 publicaciones',
    amount: '500 USDC',
    report: 'Reportado: plan y 20 publicaciones',
  },
  {
    id: '2',
    name: 'Hito 2 · Campaña',
    goal: '1.000 usuarios nuevos',
    amount: '1.000 USDC',
    report: 'Reportado: 1.240 usuarios nuevos',
  },
];

const box = 'rounded-xl bg-off-white px-4 py-3';
const small = 'text-xs font-medium text-navy/60';
const pill = 'rounded-full px-3 py-1 text-center text-xs font-bold whitespace-nowrap';
// Stacks children in one grid cell so states can crossfade in place.
const stack = 'grid [&>*]:[grid-area:1/1]';
const hidden = 'invisible opacity-0';

/**
 * Four screens of the app, one per step. Every screen is written in its
 * final state, which is what reduced motion shows; the timeline rewinds them.
 */
function DemoCard() {
  return (
    <div className="relative rounded-[2rem] bg-white p-6 text-navy shadow-[0_24px_60px_-20px_rgb(15_46_82_/_0.35)] md:col-start-2 md:row-span-2 md:row-start-1 md:p-8">
      <div className="mb-5 flex items-center gap-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-navy/15" />
        <span className="size-2.5 rounded-full bg-navy/15" />
        <span className="size-2.5 rounded-full bg-navy/15" />
        <span className="ml-3 font-heading text-sm font-bold text-navy/70">Pocket</span>
      </div>
      <div className={stack}>
        {/* 1. Publish, then pick an expert */}
        <div data-panel className={`${stack} ${hidden}`}>
          <div data-p1-form className={`flex flex-col gap-3 ${hidden}`}>
            <p className="font-heading text-xl font-bold">Nuevo trabajo</p>
            <div data-p1-field className={box}>
              <p className={small}>Resultado que esperas</p>
              <p className="font-medium">1.000 usuarios nuevos en 30 días</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div data-p1-field className={box}>
                <p className={small}>Presupuesto</p>
                <p className="font-medium">1.500 USDC</p>
              </div>
              <div data-p1-field className={box}>
                <p className={small}>Plazo</p>
                <p className="font-medium">30 días</p>
              </div>
            </div>
            <span
              data-p1-btn
              className="mt-1 block rounded-full bg-navy py-3 text-center font-medium text-off-white"
            >
              Publicar
            </span>
          </div>
          <div data-p1-pick className="flex flex-col gap-3">
            <p className="font-heading text-xl font-bold">Expertos para ti</p>
            {proposals.map((p) => {
              const chosen = p.initials === 'VM';
              return (
                <div
                  key={p.initials}
                  data-p1-row
                  {...(chosen ? { 'data-p1-chosen': '' } : {})}
                  className={`relative flex items-center gap-3 rounded-xl border-2 bg-off-white px-4 py-3 ${chosen ? 'border-celeste' : 'border-transparent'}`}
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
                      data-p1-badge
                      className="absolute -right-2 -top-3 rounded-full bg-yellow px-3 py-1 text-xs font-bold"
                    >
                      Elegida
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Agree on milestones */}
        <div data-panel className={`flex flex-col gap-3 ${hidden}`}>
          <p className="font-heading text-xl font-bold">Hitos acordados</p>
          {milestones.map((m) => (
            <div key={m.id} data-p2-row className={box}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{m.name}</p>
                <p className="text-sm font-bold">{m.amount}</p>
              </div>
              <p className="mt-1 text-sm text-navy/70">Meta: {m.goal}</p>
            </div>
          ))}
          <div className="mt-1 flex flex-wrap gap-2">
            <span data-p2-ok className={`${pill} bg-celeste`}>
              ✓ Startup aceptó
            </span>
            <span data-p2-ok className={`${pill} bg-celeste`}>
              ✓ Valeria aceptó
            </span>
          </div>
        </div>

        {/* 3. Secure the payment in the contract */}
        <div data-panel className={`relative flex flex-col gap-4 ${hidden}`}>
          <p className="font-heading text-xl font-bold">Guardar el pago</p>
          <div className={box}>
            <p className={small}>Total del trabajo</p>
            <p className="font-heading text-4xl font-bold">1.500 USDC</p>
            <p className="text-sm text-navy/60">2 hitos: 500 + 1.000 USDC</p>
          </div>
          <span
            data-p3-btn
            className={`${stack} rounded-full bg-yellow py-3 text-center font-medium`}
          >
            <span data-p3-idle className={hidden}>
              Guardar en el contrato
            </span>
            <span data-p3-done>Guardado</span>
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
              <p className="font-heading text-lg font-bold">Guardado en un contrato</p>
              <p className="text-sm text-navy/70">
                Se libera solo cuando confirmes cada hito.
              </p>
            </div>
          </div>
          <span
            data-p3-coin
            aria-hidden
            className={`absolute left-0 top-0 size-7 rounded-full border-4 border-[#f2b705] bg-yellow ${hidden}`}
          />
        </div>

        {/* 4. Verify: each report is confirmed and paid, then the results report */}
        <div data-panel className="flex flex-col gap-3">
          <p className="font-heading text-xl font-bold">Verificar</p>
          {milestones.map((m) => (
            <div key={m.id} className={`${box} flex items-center justify-between gap-3`}>
              <div>
                <p className="font-medium">{m.name}</p>
                <p className={`${stack} text-sm text-navy/70`}>
                  <span data-p4-goal={m.id} className={hidden}>
                    Meta: {m.goal}
                  </span>
                  <span data-p4-report={m.id}>{m.report}</span>
                </p>
              </div>
              <span className={stack}>
                <span data-p4-wait={m.id} className={`${pill} bg-navy/10 ${hidden}`}>
                  En curso
                </span>
                <span data-p4-check={m.id} className={`${pill} bg-yellow ${hidden}`}>
                  Por confirmar
                </span>
                <span data-p4-paid={m.id} className={`${pill} bg-celeste`}>
                  Pagado
                </span>
              </span>
            </div>
          ))}
          <div>
            <p className="text-sm text-navy/70">
              Pagado al experto: <span data-p4-count>1.500</span> de 1.500 USDC
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-navy/10">
              <div data-p4-bar className="h-full origin-left bg-celeste" />
            </div>
          </div>
          <div
            data-p4-report-card
            className="mt-1 flex items-center gap-3 rounded-xl bg-navy px-4 py-3 text-off-white"
          >
            <img
              src="/renders/sm/chart.webp"
              alt=""
              width={320}
              height={320}
              className="size-11 shrink-0"
            />
            <div>
              <p className="font-heading font-bold">
                Tu reporte de resultados está listo
              </p>
              <p className="text-sm text-muted">
                2 de 2 metas cumplidas · 1.240 usuarios
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  // Set by the active motion branch: shows step i when its number is clicked.
  const goTo = useRef<(i: number) => void>(() => {});

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const panels = q('[data-panel]');
      const dots = q('[data-step-dot]');
      const idle = { backgroundColor: '#d3e6ee', color: '#0f2e52', scale: 1 };
      const active = { backgroundColor: '#0f2e52', color: '#f4fbfd', scale: 1.1 };

      const mm = gsap.matchMedia();

      // Reduced motion: no timeline, the numbers just switch screens.
      mm.add('(prefers-reduced-motion: reduce)', () => {
        const show = (i: number) => {
          gsap.set(panels, { autoAlpha: 0 });
          gsap.set(panels[i], { autoAlpha: 1 });
          gsap.set(dots, idle);
          gsap.set(dots[i], active);
        };
        show(3);
        goTo.current = show;
      });

      mm.add(
        {
          desktop: media.pin,
          mobile: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const coin = q('[data-p3-coin]')[0];
          const count = q('[data-p4-count]')[0];
          const paid = { usdc: 0 };
          const showPaid = () => {
            // Thousands with a dot, as the rest of the card writes them.
            count.textContent = String(Math.round(paid.usdc)).replace(
              /\B(?=(\d{3})+$)/g,
              '.',
            );
          };

          // Rewind every screen to where step 1 starts.
          gsap.set(panels, { autoAlpha: 0 });
          gsap.set(panels[0], { autoAlpha: 1 });
          gsap.set(dots, idle);
          gsap.set(dots[0], active);
          gsap.set('[data-p1-form], [data-p3-idle]', { autoAlpha: 1 });
          gsap.set('[data-p1-pick], [data-p3-done], [data-p3-status]', { autoAlpha: 0 });
          gsap.set('[data-p1-chosen]', { borderColor: 'transparent' });
          gsap.set('[data-p4-goal], [data-p4-wait]', { autoAlpha: 1 });
          gsap.set('[data-p4-report], [data-p4-check], [data-p4-paid]', { autoAlpha: 0 });
          gsap.set('[data-p4-bar]', { scaleX: 0 });
          gsap.set('[data-p4-report-card]', { autoAlpha: 0, y: 16 });
          showPaid();

          // Where the coin falls: from the button into the lock.
          const rel = (sel: string) => {
            const card = panels[2].getBoundingClientRect();
            const r = q(sel)[0].getBoundingClientRect();
            return {
              x: r.left - card.left + r.width / 2 - 14,
              y: r.top - card.top + r.height / 2 - 14,
            };
          };

          const tl = gsap.timeline({
            defaults: { ease: 'power2.out', duration: 0.4 },
            ...(ctx.conditions!.desktop
              ? {
                  scrollTrigger: {
                    trigger: root.current,
                    start: 'top top',
                    end: '+=350%',
                    pin: true,
                    scrub: 0.5,
                    invalidateOnRefresh: true,
                  },
                }
              : {
                  repeat: -1,
                  repeatDelay: 2,
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
              .addLabel(`step${i}`, '+=0.6')
              .to(panels[i - 1], { autoAlpha: 0, y: -16, duration: 0.3 }, `step${i}`)
              .fromTo(
                panels[i],
                { autoAlpha: 0, y: 16 },
                { autoAlpha: 1, y: 0, duration: 0.35 },
                '<0.1',
              )
              .to(dots[i - 1], { ...idle, duration: 0.3 }, '<')
              .to(dots[i], { ...active, duration: 0.3 }, '<');

          // 1. The job is published, experts appear and one is chosen.
          tl.addLabel('step0', 0)
            .from('[data-p1-field]', { autoAlpha: 0, y: 12, stagger: 0.2 })
            .to(
              '[data-p1-btn]',
              { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1 },
              '+=0.2',
            )
            .to('[data-p1-form]', { autoAlpha: 0, duration: 0.25 }, '+=0.2')
            .to('[data-p1-pick]', { autoAlpha: 1, duration: 0.25 }, '<')
            .from('[data-p1-row]', { autoAlpha: 0, x: 24, stagger: 0.15 })
            .to('[data-p1-chosen]', { borderColor: '#86d4e6', scale: 1.03 }, '+=0.3')
            .from(
              '[data-p1-badge]',
              { scale: 0, autoAlpha: 0, ease: 'back.out(2)' },
              '<',
            );

          // 2. Each milestone gets a goal and an amount; both sides accept.
          go(1)
            .from('[data-p2-row]', { autoAlpha: 0, x: 24, stagger: 0.2 })
            .from('[data-p2-ok]', {
              scale: 0,
              autoAlpha: 0,
              ease: 'back.out(2)',
              stagger: 0.2,
            });

          // 3. The payment drops into the contract.
          go(2)
            .to(
              '[data-p3-btn]',
              { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1 },
              '+=0.3',
            )
            .fromTo(
              coin,
              {
                x: () => rel('[data-p3-btn]').x,
                y: () => rel('[data-p3-btn]').y,
                autoAlpha: 0,
                scale: 0.6,
              },
              { autoAlpha: 1, scale: 1, duration: 0.15 },
            )
            .to(coin, {
              x: () => rel('[data-p3-lock]').x,
              y: () => rel('[data-p3-lock]').y,
              duration: 0.6,
              ease: 'power2.in',
            })
            .to(coin, { autoAlpha: 0, scale: 0.4, duration: 0.15 })
            .to('[data-p3-idle]', { autoAlpha: 0, duration: 0.2 }, '<')
            .to('[data-p3-done]', { autoAlpha: 1, duration: 0.2 }, '<')
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

          // 4. Each milestone is reported, confirmed and paid; then the report.
          go(3);
          for (const [id, upTo, share] of [
            ['1', 500, 1 / 3],
            ['2', 1500, 1],
          ] as const) {
            tl.to(`[data-p4-goal="${id}"]`, { autoAlpha: 0, duration: 0.2 }, '+=0.3')
              .to(`[data-p4-report="${id}"]`, { autoAlpha: 1, duration: 0.2 }, '<')
              .to(`[data-p4-wait="${id}"]`, { autoAlpha: 0, duration: 0.2 }, '<')
              .fromTo(
                `[data-p4-check="${id}"]`,
                { autoAlpha: 0, scale: 0.8 },
                { autoAlpha: 1, scale: 1, ease: 'back.out(2)' },
                '<',
              )
              .to(`[data-p4-check="${id}"]`, { autoAlpha: 0, duration: 0.2 }, '+=0.4')
              .fromTo(
                `[data-p4-paid="${id}"]`,
                { autoAlpha: 0, scale: 0.8 },
                { autoAlpha: 1, scale: 1, ease: 'back.out(2)' },
                '<',
              )
              .to('[data-p4-bar]', { scaleX: share, duration: 0.6 }, '<')
              .to(paid, { usdc: upTo, duration: 0.6, onUpdate: showPaid }, '<');
          }
          tl.to(
            '[data-p4-report-card]',
            { autoAlpha: 1, y: 0, ease: 'back.out(1.6)' },
            '+=0.2',
          ).to({}, { duration: 1.2 });

          goTo.current = (i: number) => {
            const at = tl.labels[`step${i}`] + (i === 0 ? 0 : 0.5);
            const st = tl.scrollTrigger!;
            if (ctx.conditions!.desktop) {
              scrollToY(st.start + (st.end - st.start) * (at / tl.duration()));
            } else {
              tl.seek(at).play();
            }
          };
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
      <div className="wrap">
        {/* Phones: title, card, steps. Desktop: title and steps left, card right. */}
        <div className="grid items-center gap-x-14 gap-y-8 md:grid-cols-[1fr_1.1fr] md:grid-rows-[auto_1fr]">
          <div className="md:col-start-1 md:row-start-1">
            <h2 className="headline-lg">Cuatro pasos, un solo ciclo</h2>
            <p className="mt-3 max-w-md text-lg text-navy/75">
              Toca un número para ver ese paso.
            </p>
          </div>
          <DemoCard />
          <div className="md:col-start-1 md:row-start-2 md:self-start">
            <ol className="flex flex-col gap-1">
              {steps.map((step, i) => (
                <li key={step.name}>
                  <button
                    type="button"
                    onClick={() => goTo.current(i)}
                    className="group flex w-full gap-5 rounded-2xl p-3 text-left transition-colors hover:bg-navy/5"
                  >
                    <span
                      data-step-dot
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-navy font-heading text-lg font-bold text-off-white"
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-xl font-bold">
                          {step.name}
                        </span>
                        <span className="rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-medium">
                          {step.who}
                        </span>
                      </span>
                      <span className="mt-1 block text-navy/75">{step.text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <Reveal className="mt-6 flex items-center gap-4 rounded-2xl bg-celeste/25 px-5 py-4">
              <img
                src="/renders/sm/chart.webp"
                alt=""
                width={320}
                height={320}
                loading="lazy"
                className="size-12 shrink-0"
              />
              <p>
                Al cerrar, recibes tu <strong>reporte de resultados</strong> y el experto
                suma el trabajo a su <strong>historial</strong>.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
