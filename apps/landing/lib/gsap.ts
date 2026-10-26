'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

// Registered once here; components import gsap from this module, never from 'gsap'.
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** Media queries for gsap.matchMedia(): who gets which motion. */
export const media = {
  motion: '(prefers-reduced-motion: no-preference)',
  // Pinned sections only where there is room; on phones they stay a plain scroll.
  pin: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
  // Tilt and magnetic effects need a mouse; touch screens skip them.
  pointer:
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
};

/** A brand color from globals.css, for tweens that need its value. */
export const brand = (name: 'navy' | 'yellow' | 'off-white') =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

export { gsap, ScrollTrigger, SplitText, useGSAP };
