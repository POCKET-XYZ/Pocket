import { BadgeCheckIcon, HandCoinsIcon, LockIcon, ScaleIcon } from 'lucide-react';
import Link from 'next/link';
import { Onboarding } from '@/components/onboarding';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    icon: BadgeCheckIcon,
    title: 'Everyone is verified',
    text: 'A Pocket manager reviews every startup and every specialist before they can hire or apply.',
  },
  {
    icon: LockIcon,
    title: 'The budget is locked first',
    text: 'The startup funds a USDC escrow on Stellar before work starts. Nobody can move it alone.',
  },
  {
    icon: HandCoinsIcon,
    title: 'Paid per milestone',
    text: 'Each milestone is released to the specialist when the startup approves the delivery.',
  },
  {
    icon: ScaleIcon,
    title: 'Disputes have a referee',
    text: 'If they disagree, a manager decides: pay, refund or split. The escrow executes it.',
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
          Growth talent, guaranteed payments
        </p>
        <h1 className="relative mt-4 max-w-3xl text-4xl font-bold leading-[0.95] md:text-6xl">
          Your growth team, in your pocket.
        </h1>
        <p className="relative mt-6 max-w-xl text-lg text-off-white/75">
          Startups hire vetted growth, sales and marketing specialists. Every payment
          waits in an escrow on Stellar until the work is approved.
        </p>
        <div className="relative mt-10 flex flex-wrap gap-3">
          <Button
            asChild
            size="lg"
            className="h-11 bg-yellow px-5 text-navy hover:bg-yellow/85"
          >
            <Link href="/login">Get started</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-11 border-off-white/30 bg-transparent px-5 text-off-white hover:bg-white/10 hover:text-off-white"
          >
            <Link href="/jobs">Browse open jobs</Link>
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-navy md:text-3xl">How Pocket works</h2>
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
