import { BadgeCheckIcon, HandCoinsIcon, LockIcon, ScaleIcon } from 'lucide-react';
import Link from 'next/link';
import { Onboarding } from '@/components/onboarding';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    icon: BadgeCheckIcon,
    title: 'Todos están verificados',
    text: 'Un manager de Pocket revisa cada startup y cada experto antes de que puedan contratar o postularse.',
  },
  {
    icon: LockIcon,
    title: 'Primero se guarda el presupuesto',
    text: 'La startup deposita el pago en USDC en un contrato en Stellar antes de empezar. Nadie puede moverlo por su cuenta.',
  },
  {
    icon: HandCoinsIcon,
    title: 'Pago por hito',
    text: 'El pago de cada hito se libera al experto cuando la startup aprueba la entrega.',
  },
  {
    icon: ScaleIcon,
    title: 'Las disputas tienen árbitro',
    text: 'Si no se ponen de acuerdo, un manager decide: pagar, reembolsar o dividir. El contrato lo ejecuta.',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Only shows for a signed-in user who is not set up yet. */}
      <Onboarding />

      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-16 text-off-white md:px-14 md:py-20">
        <div className="absolute -right-24 -top-24 size-72 rounded-full bg-celeste/20 blur-3xl" />
        <div className="absolute -bottom-32 right-24 size-80 rounded-full bg-yellow/10 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-celeste">
          Talento de growth, pagos protegidos
        </p>
        <h1 className="relative mt-4 max-w-3xl text-4xl font-bold leading-[0.95] md:text-6xl">
          Tu equipo de growth, en tu bolsillo.
        </h1>
        <p className="relative mt-6 max-w-xl text-lg text-off-white/75">
          Las startups contratan expertos verificados en growth, ventas y marketing. Cada
          pago espera en un contrato en Stellar hasta que se aprueba el trabajo.
        </p>
        <div className="relative mt-10 flex flex-wrap gap-3">
          <Button
            asChild
            size="lg"
            className="h-11 bg-yellow px-5 text-navy hover:bg-yellow/85"
          >
            <Link href="/login">Empezar</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-11 border-off-white/30 bg-transparent px-5 text-off-white hover:bg-white/10 hover:text-off-white"
          >
            <Link href="/jobs">Ver trabajos abiertos</Link>
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-navy md:text-3xl">Cómo funciona Pocket</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <step.icon className="size-6 text-navy" />
              <h3 className="mt-4 text-lg font-semibold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
