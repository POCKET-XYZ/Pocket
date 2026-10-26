import { ScrollProgress } from '@/components/scroll-progress';
import { Barrier } from '@/components/sections/barrier';
import { Closing } from '@/components/sections/closing';
import { Experts } from '@/components/sections/experts';
import { Faq } from '@/components/sections/faq';
import { Hero } from '@/components/sections/hero';
import { HowItWorks } from '@/components/sections/how-it-works';
import { NoTeam } from '@/components/sections/no-team';
import { Protected } from '@/components/sections/protected';
import { SiteNav } from '@/components/site-nav';

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <SiteNav />
      <main>
        <Hero />
        <NoTeam />
        <Barrier />
        <Protected />
        <HowItWorks />
        <Experts />
        <Faq />
        <Closing />
      </main>
    </>
  );
}
