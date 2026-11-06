import { jumpBy } from '@/components/smooth-scroll';
import { ScrollTrigger } from '@/lib/gsap';

/**
 * onLeave for a pinned, scrubbed section: once it has played through going
 * down, it stays finished and lets go of its pin. Scrolling back up then
 * neither rewinds it nor makes the reader scroll through it a second time.
 * The page is moved up by the pin's length so nothing on screen jumps.
 */
export function settle(self: ScrollTrigger) {
  const anim = self.animation;
  const pinned = self.end - self.start;
  self.kill(true, true);
  anim?.progress(1).pause();
  jumpBy(-pinned);
  ScrollTrigger.refresh();
}
