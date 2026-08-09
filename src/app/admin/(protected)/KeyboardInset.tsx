'use client';

import { useEffect } from 'react';

/** Publishes the software keyboard's height as --kb on <html>, and toggles the
 *  .keyboard-open class the phone media query keys off.
 *
 *  Without this, on an iPhone: she taps the reply box, the keyboard slides up, and
 *  the composer she is typing into is underneath it — because iOS shrinks only the
 *  VISUAL viewport, while `position: sticky; bottom: …` resolves against the
 *  LAYOUT viewport, which iOS leaves at its full height. Chrome on Android can be
 *  told to shrink the layout viewport instead (`interactiveWidget:
 *  'resizes-content'`); Safari cannot, and visualViewport is the only API that
 *  reports the difference.
 *
 *  Everything degrades to today's behaviour: no visualViewport (or no keyboard, or
 *  a desktop) means --kb stays at its 0px default and every calc() in the
 *  stylesheet collapses to what it would have been anyway. */
export function KeyboardInset(): null {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    const update = () => {
      // offsetTop matters as well as height: iOS both shrinks the visual viewport
      // and scrolls it up, and the covered strip is what is left over.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Under ~80px this is Safari's collapsing toolbar, not a keyboard. Reacting
      // to that would make the composer jitter every time she scrolls.
      const keyboard = covered > 80 ? Math.round(covered) : 0;
      root.style.setProperty('--kb', `${keyboard}px`);
      root.classList.toggle('keyboard-open', keyboard > 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kb');
      root.classList.remove('keyboard-open');
    };
  }, []);

  return null;
}
