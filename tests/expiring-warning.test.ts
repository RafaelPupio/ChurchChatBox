import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExpiringWarning } from '@/app/admin/(protected)/oracao/ExpiringWarning';

/** Finding A3: the component's own comment says it is "Rendered ONLY when count
 *  > 0. There is deliberately no empty state: a standing '0 pedidos vão ser
 *  apagados' line is the 90-day failure in another form." — but nothing in the
 *  suite actually renders it with count: 0. A reviewer changed the guard from
 *  `count <= 0` to `count < 0` and the whole suite stayed green, because 0 is
 *  the one value that distinguishes the two and nothing exercised it. */
describe('ExpiringWarning — the zero boundary (count <= 0, not count < 0)', () => {
  it('renders nothing at exactly zero', () => {
    expect(renderToStaticMarkup(createElement(ExpiringWarning, { count: 0 }))).toBe('');
  });

  it('renders the warning at one', () => {
    const html = renderToStaticMarkup(createElement(ExpiringWarning, { count: 1 }));
    expect(html).toContain('Pedidos de oração que serão apagados em breve');
  });

  it('renders the warning for a large count too, so the guard is a lower bound and not an odd range', () => {
    const html = renderToStaticMarkup(createElement(ExpiringWarning, { count: 42 }));
    expect(html).toContain('42 pedido(s) de oração');
  });
});
