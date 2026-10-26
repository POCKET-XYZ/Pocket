import { ScrollProgress } from '@/components/scroll-progress';
import { Audiences } from '@/components/sections/audiences';
import { Barrier } from '@/components/sections/barrier';
import { Closing } from '@/components/sections/closing';
import { Hero } from '@/components/sections/hero';
import { HowItWorks } from '@/components/sections/how-it-works';
import { NonCustodial } from '@/components/sections/non-custodial';
import { Problem } from '@/components/sections/problem';
import { Solution } from '@/components/sections/solution';
import { Why } from '@/components/sections/why';
import { SiteNav } from '@/components/site-nav';

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <SiteNav />
      <main>
        <Hero />
        <Problem />
        <Why />
        <Barrier />
        <Solution />
        <HowItWorks />
        <NonCustodial />
        <Audiences />
        <Closing />
      </main>
    </>
  );
}
